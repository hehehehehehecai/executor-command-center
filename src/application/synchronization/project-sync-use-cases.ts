import type { GitHubActivityReader } from "@/application/github-activity/github-activity-reader";
import type { FirstSyncInstallationTokenProvider, FirstSyncProjectContext, FirstSyncProjectContextReader, FirstSyncRepositorySnapshot, FirstSyncRunStore, GitHubActivitySnapshotWriter, ProjectScopedSnapshotGroup, SnapshotWriteReceipt } from "@/application/synchronization/first-sync-use-cases";
import { parseBackgroundJob, type BackgroundJob } from "@/domain/jobs/background-job";
import type { FirstSyncGroupName } from "@/domain/synchronization/first-sync";
import type { SyncRun } from "@/domain/synchronization/synchronization-state";

export const projectSynchronizationRuntimeContract = "project-synchronization-runtime.v1" as const;
export interface ProjectRepositoryMetadataReader { read(input: { context: FirstSyncProjectContext; readAt: string; signal?: AbortSignal }): Promise<FirstSyncRepositorySnapshot>; }
export type ProjectSynchronizationResult = { syncRunId: string; status: "completed" | "partial" | "failed"; groups: readonly SnapshotWriteReceipt[]; errorCode: string | null; retryable: boolean; authorizationRevoked: boolean; replayed: boolean };

const retryableErrors = new Set(["github_activity_rate_limited", "github_activity_timeout", "github_activity_unavailable", "github_activity_snapshot_write_failed", "first_sync_storage_failed"]);
const authorizationErrors = new Set(["github_activity_authorization_revoked"]);
const safeErrors = new Set([...retryableErrors, ...authorizationErrors, "github_activity_not_found", "github_activity_invalid_response", "github_activity_pagination_invalid", "github_activity_aborted"]);
const groups: readonly FirstSyncGroupName[] = ["repository", "commit", "issue", "pull_request", "release", "workflow_run"];
function canonical(value: string): string { const parsed = Date.parse(value); if (!Number.isFinite(parsed)) throw new Error("project_sync_invalid_request"); return new Date(parsed).toISOString(); }
function windowStart(value: string): string { const date = new Date(canonical(value)); date.setUTCDate(date.getUTCDate() - 90); return date.toISOString(); }
function failure(error: unknown) { const message = error instanceof Error ? error.message : ""; if (message === "sync_run_concurrency_conflict") throw error; const code = safeErrors.has(message) ? message : "project_sync_failed"; return { code, retryable: retryableErrors.has(code), revoked: authorizationErrors.has(code) }; }
function unique<T extends { githubObjectId: string; repositoryFullName: string }>(items: readonly T[], fullName: string): readonly T[] { const result = new Map<string, T>(); for (const item of items) { if (item.repositoryFullName !== fullName) throw new Error("github_activity_invalid_response"); result.set(item.githubObjectId, item); } return [...result.values()]; }

export class ExecuteProjectSynchronization {
  constructor(private readonly dependencies: { runs: Pick<FirstSyncRunStore, "getById" | "transition">; contexts: FirstSyncProjectContextReader; tokens: FirstSyncInstallationTokenProvider; reader: GitHubActivityReader; metadata: ProjectRepositoryMetadataReader; writer: GitHubActivitySnapshotWriter; clock: { now(): Date } }) {}
  private result(run: SyncRun, input: Omit<ProjectSynchronizationResult, "syncRunId" | "status">): ProjectSynchronizationResult { return { syncRunId: run.id, status: run.status as ProjectSynchronizationResult["status"], ...input }; }
  async execute(input: { job: unknown; signal?: AbortSignal }): Promise<ProjectSynchronizationResult> {
    const job = parseBackgroundJob(input.job);
    const triggerSource = job.triggerSource ?? "first_sync";
    if (triggerSource === "first_sync") throw new Error("project_sync_first_sync_job_invalid");
    const existing = await this.dependencies.runs.getById(job.projectId, job.syncRunId);
    if (!existing) throw new Error("project_sync_run_not_found");
    if (existing.id !== job.jobId || existing.projectId !== job.projectId || existing.idempotencyKey !== job.idempotencyKey || existing.triggerSource !== triggerSource) throw new Error("project_sync_identity_invalid");
    if (existing.status === "completed") return this.result(existing, { groups: [], errorCode: null, retryable: false, authorizationRevoked: false, replayed: true });
    if (existing.status === "running") throw new Error("sync_run_concurrency_conflict");
    if (existing.status !== "queued" && existing.status !== "partial") throw new Error("project_sync_run_terminal");
    const now = canonical(this.dependencies.clock.now().toISOString());
    let run = await this.dependencies.runs.transition({ projectId: job.projectId, runId: job.syncRunId, expectedStatus: existing.status, expectedVersion: existing.version, targetStatus: "running", transitionedAt: now, progressCursor: null, errorCode: null, errorSummary: null });
    const receipts: SnapshotWriteReceipt[] = [];
    const fail = async (error: unknown) => { const safe = failure(error); const targetStatus = safe.revoked || (!safe.retryable && receipts.length === 0) ? "failed" : "partial"; run = await this.dependencies.runs.transition({ projectId: job.projectId, runId: job.syncRunId, expectedStatus: "running", expectedVersion: run.version, targetStatus, transitionedAt: now, progressCursor: null, errorCode: targetStatus === "failed" ? safe.code : null, errorSummary: null }); return this.result(run, { groups: receipts, errorCode: safe.code, retryable: safe.retryable, authorizationRevoked: safe.revoked, replayed: false }); };
    const context = await this.dependencies.contexts.getByProjectId(job.projectId);
    if (!context || context.projectId !== job.projectId) return fail(new Error("github_activity_not_found"));
    if (context.installation.status !== "active") return fail(new Error("github_activity_authorization_revoked"));
    if (job.webhookDelivery && (job.webhookDelivery.installationId !== context.installation.installationId || job.webhookDelivery.repositoryId !== Number(context.repository.githubObjectId) || job.webhookDelivery.repositoryFullName !== context.repository.fullName)) throw new Error("project_sync_identity_invalid");
    let token: string;
    try { token = (await this.dependencies.tokens.issue({ installationId: context.installation.installationId, signal: input.signal })).token; } catch (error) { return fail(error); }
    const request = { repository: { owner: context.repository.owner, name: context.repository.name }, installationToken: token, since: windowStart(job.requestedAt), pagination: { maxPages: 100, maxObjects: 10_000 }, signal: input.signal };
    for (const groupName of groups) {
      try {
        let items: readonly { githubObjectId: string }[];
        switch (groupName) {
          case "repository": items = [await this.dependencies.metadata.read({ context, readAt: now, signal: input.signal })]; break;
          case "commit": items = unique(await this.dependencies.reader.listCommits(request), context.repository.fullName); break;
          case "issue": items = unique(await this.dependencies.reader.listIssues(request), context.repository.fullName); break;
          case "pull_request": items = unique(await this.dependencies.reader.listPullRequests(request), context.repository.fullName); break;
          case "release": items = unique(await this.dependencies.reader.listReleases(request), context.repository.fullName); break;
          case "workflow_run": items = unique(await this.dependencies.reader.listWorkflowRuns(request), context.repository.fullName); break;
        }
        receipts.push(await this.dependencies.writer.upsertGroup({ projectId: job.projectId, groupName, items } as ProjectScopedSnapshotGroup));
      } catch (error) { return fail(error); }
    }
    run = await this.dependencies.runs.transition({ projectId: job.projectId, runId: job.syncRunId, expectedStatus: "running", expectedVersion: run.version, targetStatus: "completed", transitionedAt: now, progressCursor: null, errorCode: null, errorSummary: null });
    return this.result(run, { groups: receipts, errorCode: null, retryable: false, authorizationRevoked: false, replayed: false });
  }
}
export function isFirstSyncJob(job: BackgroundJob): boolean { return (job.triggerSource ?? "first_sync") === "first_sync"; }
