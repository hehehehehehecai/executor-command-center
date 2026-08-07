import type { GitHubActivityReader } from "@/application/github-activity/github-activity-reader";
import type { JobDispatcher } from "@/application/jobs/job-dispatcher";
import type {
  CreateSyncRunInput,
  TransitionSyncRunInput,
} from "@/application/synchronization/sync-run-use-cases";
import {
  backgroundJobContract,
  parseBackgroundJob,
  type BackgroundJob,
} from "@/domain/jobs/background-job";
import type {
  GitHubCommitReadModel,
  GitHubIssueReadModel,
  GitHubPullRequestReadModel,
  GitHubReleaseReadModel,
  GitHubWorkflowRunReadModel,
} from "@/domain/github-activity/github-activity-read-models";
import {
  completeFirstSyncGroup,
  createFirstSyncCursor,
  failFirstSyncGroup,
  firstRepositorySyncContract,
  firstSyncGroupsContract,
  freezeFirstSyncWindow,
  isWithinFirstSyncWindow,
  parseFirstSyncCursor,
  remainingFirstSyncGroups,
  serializeFirstSyncCursor,
  type FirstSyncCursor,
  type FirstSyncGroupFailure,
  type FirstSyncGroupName,
} from "@/domain/synchronization/first-sync";
import {
  deriveFreshnessStatus,
  type FreshnessStatus,
  type SyncRun,
  type SyncStatus,
} from "@/domain/synchronization/synchronization-state";

export { firstRepositorySyncContract, firstSyncGroupsContract };
export const githubActivitySnapshotWriterContract =
  "github-activity-snapshot-writer.v1" as const;

export type FirstSyncRepositorySnapshot = {
  readonly githubObjectId: string;
  readonly repositoryFullName: string;
  readonly sourceUpdatedAt: string;
  readonly sourceVersion: string;
  readonly defaultBranch: string;
  readonly visibility: "public" | "private" | "internal";
  readonly isPrivate: boolean;
  readonly isFork: boolean;
  readonly isArchived: boolean;
  readonly isDisabled: boolean;
};

type SnapshotItems = {
  readonly repository: readonly FirstSyncRepositorySnapshot[];
  readonly commit: readonly GitHubCommitReadModel[];
  readonly issue: readonly GitHubIssueReadModel[];
  readonly pull_request: readonly GitHubPullRequestReadModel[];
  readonly release: readonly GitHubReleaseReadModel[];
  readonly workflow_run: readonly GitHubWorkflowRunReadModel[];
};

export type ProjectScopedSnapshotGroup = {
  [Group in FirstSyncGroupName]: {
    readonly projectId: string;
    readonly groupName: Group;
    readonly items: SnapshotItems[Group];
  }
}[FirstSyncGroupName];

export type SnapshotWriteReceipt = {
  readonly groupName: FirstSyncGroupName;
  readonly attempted: number;
  readonly accepted: number;
  readonly rejected: number;
};

export interface GitHubActivitySnapshotWriter {
  upsertGroup(input: ProjectScopedSnapshotGroup): Promise<SnapshotWriteReceipt>;
}

export type FirstSyncProjectContext = {
  readonly projectId: string;
  readonly repository: {
    readonly githubObjectId: string;
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly visibility: "public" | "private" | "internal";
    readonly isPrivate: boolean;
    readonly isFork: boolean;
    readonly isArchived: boolean;
    readonly isDisabled: boolean;
    readonly defaultBranch: string;
    readonly sourceUpdatedAt: string;
    readonly sourceVersion: string;
  };
  readonly installation: {
    readonly installationId: number;
    readonly status: "active" | "suspended" | "revoked";
  };
};

export interface FirstSyncProjectContextReader {
  getByProjectId(projectId: string): Promise<FirstSyncProjectContext | null>;
}

export interface FirstSyncInstallationTokenProvider {
  issue(input: {
    readonly installationId: number;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly token: string; readonly expiresAt: string }>;
}

export type FirstSyncCheckpointInput = {
  readonly projectId: string;
  readonly runId: string;
  readonly expectedStatus: SyncStatus;
  readonly expectedVersion: number;
  readonly checkpointedAt: string;
  readonly progressCursor: string;
};

export interface FirstSyncRunStore {
  createQueued(input: CreateSyncRunInput): Promise<SyncRun>;
  getById(projectId: string, runId: string): Promise<SyncRun | null>;
  checkpoint(input: FirstSyncCheckpointInput): Promise<SyncRun>;
  transition(input: TransitionSyncRunInput): Promise<SyncRun>;
}

export type FirstSyncDispatchReceipt = {
  readonly syncRunId: string;
  readonly jobId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly providerJobId: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly reused: boolean;
};

export type FirstSyncResult = {
  readonly syncRunId: string;
  readonly status: "completed" | "partial" | "failed";
  readonly freshnessStatus: FreshnessStatus;
  readonly groups: readonly SnapshotWriteReceipt[];
  readonly cursor: string;
  readonly failure: FirstSyncGroupFailure | null;
  readonly lastSuccessfulAt: string | null;
  readonly authorizationRevoked: boolean;
  readonly replayed: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const retryableErrors = new Set([
  "github_activity_rate_limited",
  "github_activity_timeout",
  "github_activity_unavailable",
]);
const authorizationErrors = new Set([
  "github_activity_authorization_revoked",
]);
const safeGroupErrors = new Set([
  ...retryableErrors,
  ...authorizationErrors,
  "github_activity_not_found",
  "github_activity_invalid_response",
  "github_activity_pagination_invalid",
  "github_activity_aborted",
  "github_activity_snapshot_write_failed",
]);

function invalidRequest(): never {
  throw new Error("first_sync_invalid_request");
}

function canonical(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return invalidRequest();
  return new Date(parsed).toISOString();
}

function parseStartInput(input: unknown): { projectId: string; requestId: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return invalidRequest();
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    typeof value.projectId !== "string" ||
    !uuidPattern.test(value.projectId) ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId)
  ) {
    return invalidRequest();
  }
  return { projectId: value.projectId, requestId: value.requestId };
}

function dispatchReceipt(cursor: FirstSyncCursor, reused: boolean): FirstSyncDispatchReceipt {
  return {
    syncRunId: cursor.syncRunId,
    jobId: cursor.job.jobId,
    correlationId: cursor.job.correlationId,
    idempotencyKey: cursor.job.idempotencyKey,
    providerJobId: cursor.job.providerJobId,
    windowStart: cursor.windowStart,
    windowEnd: cursor.windowEnd,
    reused,
  };
}

export class StartFirstRepositorySync {
  constructor(private readonly dependencies: {
    readonly runs: Pick<FirstSyncRunStore, "createQueued" | "checkpoint">;
    readonly contexts: FirstSyncProjectContextReader;
    readonly dispatcher: JobDispatcher;
  }) {}

  async execute(input: unknown): Promise<FirstSyncDispatchReceipt> {
    const command = parseStartInput(input);
    const idempotencyKey = `first-sync:${command.requestId}`;
    let run = await this.dependencies.runs.createQueued({
      projectId: command.projectId,
      idempotencyKey,
      triggerSource: "first_sync",
    });

    if (run.progressCursor !== null) {
      const cursor = parseFirstSyncCursor(run.progressCursor);
      if (
        cursor.projectId !== command.projectId ||
        cursor.syncRunId !== run.id ||
        cursor.requestId !== command.requestId
      ) {
        throw new Error("first_sync_cursor_invalid");
      }
      return dispatchReceipt(cursor, true);
    }
    if (run.status !== "queued") throw new Error("first_sync_run_terminal");

    const context = await this.dependencies.contexts.getByProjectId(command.projectId);
    if (context === null || context.projectId !== command.projectId) {
      throw new Error("first_sync_project_not_found");
    }

    const window = freezeFirstSyncWindow(canonical(run.queuedAt));
    const job: BackgroundJob = {
      version: backgroundJobContract,
      jobType: "project.sync.requested.v1",
      jobId: run.id,
      projectId: command.projectId,
      syncRunId: run.id,
      idempotencyKey,
      correlationId: `first-sync:${run.id}`,
      requestedAt: window.windowEnd,
      triggerSource: "first_sync",
      webhookDelivery: null,
    };
    const provider = await this.dependencies.dispatcher.dispatch(job);
    const cursor = createFirstSyncCursor({
      projectId: command.projectId,
      syncRunId: run.id,
      requestId: command.requestId,
      repositoryFullName: context.repository.fullName,
      installationId: context.installation.installationId,
      window,
      job: {
        jobId: job.jobId,
        correlationId: job.correlationId,
        idempotencyKey: job.idempotencyKey,
        providerJobId: provider.providerJobId,
      },
    });
    run = await this.dependencies.runs.checkpoint({
      projectId: command.projectId,
      runId: run.id,
      expectedStatus: "queued",
      expectedVersion: run.version,
      checkpointedAt: window.windowEnd,
      progressCursor: serializeFirstSyncCursor(cursor),
    });
    return dispatchReceipt(parseFirstSyncCursor(run.progressCursor!), false);
  }
}

function safeGroupFailure(error: unknown): { code: string; retryable: boolean; revoked: boolean } {
  const message = error instanceof Error ? error.message : "";
  if (message === "sync_run_concurrency_conflict") throw error;
  const code = safeGroupErrors.has(message) ? message : "first_sync_group_failed";
  return {
    code,
    retryable: retryableErrors.has(code),
    revoked: authorizationErrors.has(code),
  };
}

function uniqueWithinWindow<T extends { readonly githubObjectId: string; readonly sourceUpdatedAt: string; readonly repositoryFullName: string }>(
  items: readonly T[],
  cursor: FirstSyncCursor,
): readonly T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    if (item.repositoryFullName !== cursor.repositoryFullName) {
      throw new Error("github_activity_invalid_response");
    }
    if (isWithinFirstSyncWindow(item.sourceUpdatedAt, cursor)) {
      unique.set(item.githubObjectId, item);
    }
  }
  return [...unique.values()];
}

function repositorySnapshot(context: FirstSyncProjectContext): FirstSyncRepositorySnapshot {
  return {
    githubObjectId: context.repository.githubObjectId,
    repositoryFullName: context.repository.fullName,
    sourceUpdatedAt: context.repository.sourceUpdatedAt,
    sourceVersion: context.repository.sourceVersion,
    defaultBranch: context.repository.defaultBranch,
    visibility: context.repository.visibility,
    isPrivate: context.repository.isPrivate,
    isFork: context.repository.isFork,
    isArchived: context.repository.isArchived,
    isDisabled: context.repository.isDisabled,
  };
}

function groupPayload(
  projectId: string,
  groupName: FirstSyncGroupName,
  items: readonly { readonly githubObjectId: string }[],
): ProjectScopedSnapshotGroup {
  return { projectId, groupName, items } as ProjectScopedSnapshotGroup;
}

export class ExecuteFirstRepositorySync {
  constructor(private readonly dependencies: {
    readonly runs: Pick<FirstSyncRunStore, "getById" | "checkpoint" | "transition">;
    readonly contexts: FirstSyncProjectContextReader;
    readonly tokens: FirstSyncInstallationTokenProvider;
    readonly reader: GitHubActivityReader;
    readonly writer: GitHubActivitySnapshotWriter;
    readonly clock: { now(): Date };
  }) {}

  private result(input: {
    run: SyncRun;
    cursor: FirstSyncCursor;
    groups: readonly SnapshotWriteReceipt[];
    authorizationRevoked: boolean;
    replayed: boolean;
  }): FirstSyncResult {
    const lastSuccessfulAt = input.run.status === "completed" ? input.run.finishedAt : null;
    return {
      syncRunId: input.run.id,
      status: input.run.status as "completed" | "partial" | "failed",
      freshnessStatus: deriveFreshnessStatus({
        authorizationRevoked: input.authorizationRevoked,
        latestRun: input.run,
        lastSuccessfulAt,
        coverageComplete: input.run.status === "completed",
        now: canonical(this.dependencies.clock.now().toISOString()),
      }),
      groups: input.groups,
      cursor: serializeFirstSyncCursor(input.cursor),
      failure: input.cursor.failedGroup,
      lastSuccessfulAt,
      authorizationRevoked: input.authorizationRevoked,
      replayed: input.replayed,
    };
  }

  async execute(input: { readonly job: unknown; readonly signal?: AbortSignal }): Promise<FirstSyncResult> {
    const job = parseBackgroundJob(input.job);
    const existing = await this.dependencies.runs.getById(job.projectId, job.syncRunId);
    if (existing === null) throw new Error("first_sync_run_not_found");
    if (existing.idempotencyKey !== job.idempotencyKey || existing.progressCursor === null) {
      throw new Error("first_sync_cursor_invalid");
    }
    let cursor = parseFirstSyncCursor(existing.progressCursor);
    if (
      cursor.projectId !== job.projectId ||
      cursor.syncRunId !== job.syncRunId ||
      cursor.job.jobId !== job.jobId ||
      cursor.job.correlationId !== job.correlationId ||
      cursor.job.idempotencyKey !== job.idempotencyKey ||
      cursor.windowEnd !== job.requestedAt
    ) {
      throw new Error("first_sync_cursor_invalid");
    }
    if (existing.status === "completed") {
      return this.result({ run: existing, cursor, groups: [], authorizationRevoked: false, replayed: true });
    }
    if (existing.status !== "queued" && existing.status !== "partial") {
      if (existing.status === "running") throw new Error("sync_run_concurrency_conflict");
      throw new Error("first_sync_run_terminal");
    }

    const now = canonical(this.dependencies.clock.now().toISOString());
    let run = await this.dependencies.runs.transition({
      projectId: job.projectId,
      runId: job.syncRunId,
      expectedStatus: existing.status,
      expectedVersion: existing.version,
      targetStatus: "running",
      transitionedAt: now,
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
    });
    const receipts: SnapshotWriteReceipt[] = [];
    const context = await this.dependencies.contexts.getByProjectId(job.projectId);

    const terminate = async (
      groupName: FirstSyncGroupName,
      error: unknown,
    ): Promise<FirstSyncResult> => {
      const failure = safeGroupFailure(error);
      cursor = failFirstSyncGroup(cursor, groupName, failure.code, failure.retryable);
      run = await this.dependencies.runs.checkpoint({
        projectId: job.projectId,
        runId: job.syncRunId,
        expectedStatus: "running",
        expectedVersion: run.version,
        checkpointedAt: now,
        progressCursor: serializeFirstSyncCursor(cursor),
      });
      const targetStatus = failure.revoked || cursor.completedGroups.length === 0
        ? "failed"
        : "partial";
      run = await this.dependencies.runs.transition({
        projectId: job.projectId,
        runId: job.syncRunId,
        expectedStatus: "running",
        expectedVersion: run.version,
        targetStatus,
        transitionedAt: now,
        progressCursor: null,
        errorCode: targetStatus === "failed" ? failure.code : null,
        errorSummary: null,
      });
      return this.result({
        run,
        cursor,
        groups: receipts,
        authorizationRevoked: failure.revoked,
        replayed: false,
      });
    };

    if (context === null || context.projectId !== job.projectId) {
      return terminate(remainingFirstSyncGroups(cursor)[0]!, new Error("first_sync_project_not_found"));
    }
    if (
      context.repository.fullName !== cursor.repositoryFullName ||
      context.installation.installationId !== cursor.installationId
    ) {
      throw new Error("first_sync_cursor_invalid");
    }
    if (context.installation.status !== "active") {
      return terminate(remainingFirstSyncGroups(cursor)[0]!, new Error("github_activity_authorization_revoked"));
    }

    let installationToken: string | null = null;
    const token = async () => {
      if (installationToken !== null) return installationToken;
      const issued = await this.dependencies.tokens.issue({
        installationId: context.installation.installationId,
        signal: input.signal,
      });
      installationToken = issued.token;
      return installationToken;
    };
    const readRequest = async () => ({
      repository: { owner: context.repository.owner, name: context.repository.name },
      installationToken: await token(),
      since: cursor.windowStart,
      pagination: { maxPages: 100, maxObjects: 10_000 },
      signal: input.signal,
    });

    for (const groupName of remainingFirstSyncGroups(cursor)) {
      try {
        let items: readonly { readonly githubObjectId: string }[];
        switch (groupName) {
          case "repository":
            items = [repositorySnapshot(context)];
            break;
          case "commit":
            items = uniqueWithinWindow(
              await this.dependencies.reader.listCommits(await readRequest()),
              cursor,
            );
            break;
          case "issue":
            items = uniqueWithinWindow(
              await this.dependencies.reader.listIssues(await readRequest()),
              cursor,
            );
            break;
          case "pull_request":
            items = uniqueWithinWindow(
              await this.dependencies.reader.listPullRequests(await readRequest()),
              cursor,
            );
            break;
          case "release":
            items = uniqueWithinWindow(
              await this.dependencies.reader.listReleases(await readRequest()),
              cursor,
            );
            break;
          case "workflow_run":
            items = uniqueWithinWindow(
              await this.dependencies.reader.listWorkflowRuns(await readRequest()),
              cursor,
            );
            break;
        }
        const receipt = await this.dependencies.writer.upsertGroup(
          groupPayload(job.projectId, groupName, items),
        );
        if (
          receipt.groupName !== groupName ||
          receipt.attempted !== items.length ||
          receipt.accepted < 0 ||
          receipt.rejected !== 0
        ) {
          throw new Error("github_activity_snapshot_write_failed");
        }
        receipts.push(receipt);
        cursor = completeFirstSyncGroup(cursor, groupName);
        run = await this.dependencies.runs.checkpoint({
          projectId: job.projectId,
          runId: job.syncRunId,
          expectedStatus: "running",
          expectedVersion: run.version,
          checkpointedAt: now,
          progressCursor: serializeFirstSyncCursor(cursor),
        });
      } catch (error) {
        return await terminate(groupName, error);
      }
    }

    run = await this.dependencies.runs.transition({
      projectId: job.projectId,
      runId: job.syncRunId,
      expectedStatus: "running",
      expectedVersion: run.version,
      targetStatus: "completed",
      transitionedAt: now,
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
    });
    return this.result({ run, cursor, groups: receipts, authorizationRevoked: false, replayed: false });
  }
}
