import { describe, expect, it, vi } from "vitest";
import { ExecuteProjectSynchronization, projectSynchronizationRuntimeContract } from "./project-sync-use-cases";
import type { SyncRun } from "@/domain/synchronization/synchronization-state";
import type { GitHubCommitReadModel } from "@/domain/github-activity/github-activity-read-models";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const at = "2026-08-07T02:00:00.000Z";
const targetSha = "c".repeat(40);
const job = (triggerSource: "webhook" | "reconciliation" | "manual" = "manual", push = false) => ({ version: "background-job.v1", jobType: "project.sync.requested.v1", jobId: runId, projectId, syncRunId: runId, idempotencyKey: `sync-request:${triggerSource}-001`, correlationId: `sync:${runId}`, requestedAt: at, triggerSource, webhookDelivery: triggerSource === "webhook" ? { deliveryId: "33333333-3333-4333-8333-333333333333", bodySha256: "a".repeat(64), eventName: push ? "push" : "issues", action: push ? null : "opened", installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", internalEventId: "github-webhook:33333333-3333-4333-8333-333333333333", processingVersion: 4, kind: push ? "github.push.v1" : "github.issue.v1", pushAfterSha: push ? targetSha : null } : null } as const);
function run(triggerSource: "webhook" | "reconciliation" | "manual", status: SyncRun["status"] = "queued", version = 1): SyncRun { return { id: runId, projectId, idempotencyKey: `sync-request:${triggerSource}-001`, triggerSource, status, version, queuedAt: at, startedAt: null, finishedAt: status === "completed" ? at : null, lastProgressAt: null, progressCursor: null, errorCode: null, errorSummary: null, createdAt: at, updatedAt: at }; }
function fixture(triggerSource: "webhook" | "reconciliation" | "manual" = "manual", options: { status?: SyncRun["status"]; installationStatus?: "active" | "suspended" | "revoked"; writerFailure?: string; tokenFailure?: string; commits?: GitHubCommitReadModel[] } = {}) {
  let current = run(triggerSource, options.status);
  const runs = { getById: vi.fn(async () => current), transition: vi.fn(async (input: { targetStatus: SyncRun["status"] }) => { current = { ...current, status: input.targetStatus, version: current.version + 1, finishedAt: ["completed", "partial", "failed", "cancelled"].includes(input.targetStatus) ? at : null }; return current; }) };
  const context = { projectId, repository: { githubObjectId: "91001", owner: "synthetic", name: "repository", fullName: "synthetic/repository", visibility: "private" as const, isPrivate: true, isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main", sourceUpdatedAt: at, sourceVersion: "b".repeat(64) }, installation: { installationId: 81_001, status: options.installationStatus ?? "active" } } as const;
  const reader = { listCommits: vi.fn(async () => options.commits ?? []), listIssues: vi.fn(async () => []), listPullRequests: vi.fn(async () => []), listReleases: vi.fn(async () => []), listWorkflowRuns: vi.fn(async () => []), listChecks: vi.fn(async () => []) };
  const writer = { upsertGroup: vi.fn(async (input: { groupName: "repository" | "commit" | "issue" | "pull_request" | "release" | "workflow_run"; items: readonly unknown[] }) => { if (options.writerFailure && input.groupName === "issue") throw new Error(options.writerFailure); return { groupName: input.groupName, attempted: input.items.length, accepted: input.items.length, rejected: 0 }; }) };
  const useCase = new ExecuteProjectSynchronization({ runs, contexts: { getByProjectId: vi.fn(async () => context) }, tokens: { issue: vi.fn(async () => { if (options.tokenFailure) throw new Error(options.tokenFailure); return { token: "synthetic-token", expiresAt: at }; }) }, reader, metadata: { read: vi.fn(async () => ({ githubObjectId: "91001", repositoryFullName: "synthetic/repository", sourceUpdatedAt: at, sourceVersion: "c".repeat(64), defaultBranch: "main", visibility: "private" as const, isPrivate: true, isFork: false, isArchived: false, isDisabled: false })) }, writer, clock: { now: () => new Date(at) } });
  return { useCase, runs, reader, writer };
}
describe("project-synchronization-runtime.v1", () => {
  it.each(["webhook", "reconciliation", "manual"] as const)("executes %s through reader/writer and terminal SyncRun", async (triggerSource) => { const f = fixture(triggerSource); const result = await f.useCase.execute({ job: job(triggerSource) }); expect(projectSynchronizationRuntimeContract).toBe("project-synchronization-runtime.v1"); expect(result).toMatchObject({ status: "completed", retryable: false, replayed: false }); expect(f.writer.upsertGroup).toHaveBeenCalledTimes(6); expect(f.reader.listIssues).toHaveBeenCalledTimes(1); });
  it("returns partial and retryable without leaking provider failure", async () => { const f = fixture("manual", { writerFailure: "github_activity_snapshot_write_failed" }); await expect(f.useCase.execute({ job: job() })).resolves.toMatchObject({ status: "partial", errorCode: "github_activity_snapshot_write_failed", retryable: true }); expect(f.writer.upsertGroup).toHaveBeenCalledTimes(3); });
  it("keeps a run retryable when the token fails before the first group", async () => { const f = fixture("manual", { tokenFailure: "github_activity_timeout" }); await expect(f.useCase.execute({ job: job() })).resolves.toMatchObject({ status: "partial", errorCode: "github_activity_timeout", retryable: true, groups: [] }); expect(f.writer.upsertGroup).not.toHaveBeenCalled(); });
  it("blocks revoked installation before reader and writer", async () => { const f = fixture("manual", { installationStatus: "revoked" }); await expect(f.useCase.execute({ job: job() })).resolves.toMatchObject({ status: "failed", authorizationRevoked: true }); expect(f.writer.upsertGroup).not.toHaveBeenCalled(); expect(f.reader.listIssues).not.toHaveBeenCalled(); });
  it("replays completed job and rejects a first-sync job", async () => { const f = fixture("manual", { status: "completed" }); await expect(f.useCase.execute({ job: job() })).resolves.toMatchObject({ replayed: true }); await expect(f.useCase.execute({ job: { ...job(), triggerSource: "first_sync", webhookDelivery: null } })).rejects.toThrow("project_sync_first_sync_job_invalid"); });
  it("passes a Push target only to the commit reader and completes when the exact SHA exists", async () => {
    const f = fixture("webhook", { commits: [{ githubObjectId: targetSha, repositoryFullName: "synthetic/repository", objectType: "commit", sourceUpdatedAt: at, sourceVersion: targetSha, message: "Target commit", authoredAt: at, committedAt: at, authorLogin: "synthetic" }] });
    await expect(f.useCase.execute({ job: job("webhook", true) })).resolves.toMatchObject({ status: "completed" });
    expect(f.reader.listCommits).toHaveBeenCalledWith(expect.objectContaining({ targetSha }));
    for (const reader of [f.reader.listIssues, f.reader.listPullRequests, f.reader.listReleases, f.reader.listWorkflowRuns]) expect(reader).toHaveBeenCalledWith(expect.not.objectContaining({ targetSha: expect.anything() }));
  });
  it("does not complete when a Push commit reader omits the exact target SHA", async () => {
    const otherSha = "d".repeat(40);
    const f = fixture("webhook", { commits: [{ githubObjectId: otherSha, repositoryFullName: "synthetic/repository", objectType: "commit", sourceUpdatedAt: at, sourceVersion: otherSha, message: "Other commit", authoredAt: at, committedAt: at, authorLogin: "synthetic" }] });
    await expect(f.useCase.execute({ job: job("webhook", true) })).resolves.toMatchObject({ status: "partial", errorCode: "github_activity_not_found", retryable: false });
    expect(f.writer.upsertGroup).toHaveBeenCalledTimes(1);
    expect(f.runs.transition).not.toHaveBeenCalledWith(expect.objectContaining({ targetStatus: "completed" }));
  });
  it("replays an already completed Push job without another read or snapshot write", async () => {
    const f = fixture("webhook", { status: "completed" });
    await expect(f.useCase.execute({ job: job("webhook", true) })).resolves.toMatchObject({ status: "completed", replayed: true });
    expect(f.reader.listCommits).not.toHaveBeenCalled();
    expect(f.writer.upsertGroup).not.toHaveBeenCalled();
  });
});
