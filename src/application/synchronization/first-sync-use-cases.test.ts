import { describe, expect, it, vi } from "vitest";

import type { GitHubActivityReader } from "@/application/github-activity/github-activity-reader";
import type { JobDispatcher } from "@/application/jobs/job-dispatcher";
import type { BackgroundJob } from "@/domain/jobs/background-job";
import type {
  GitHubCommitReadModel,
  GitHubIssueReadModel,
  GitHubPullRequestReadModel,
  GitHubReleaseReadModel,
  GitHubWorkflowRunReadModel,
} from "@/domain/github-activity/github-activity-read-models";
import { parseFirstSyncCursor } from "@/domain/synchronization/first-sync";
import type { SyncRun, SyncStatus } from "@/domain/synchronization/synchronization-state";

import {
  ExecuteFirstRepositorySync,
  StartFirstRepositorySync,
  firstSyncGroupsContract,
  githubActivitySnapshotWriterContract,
  type FirstSyncInstallationTokenProvider,
  type FirstSyncProjectContext,
  type FirstSyncProjectContextReader,
  type FirstSyncRunStore,
  type GitHubActivitySnapshotWriter,
  type ProjectScopedSnapshotGroup,
} from "./first-sync-use-cases";

const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";
const runA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const queuedAt = "2026-08-06T02:00:00.000Z";
const windowStart = "2026-05-08T02:00:00.000Z";

function syncRun(input: Partial<SyncRun> & Pick<SyncRun, "id" | "projectId">): SyncRun {
  return {
    idempotencyKey: "first-sync:request-001",
    triggerSource: "first_sync",
    status: "queued",
    version: 1,
    queuedAt,
    startedAt: null,
    finishedAt: null,
    lastProgressAt: null,
    progressCursor: null,
    errorCode: null,
    errorSummary: null,
    createdAt: queuedAt,
    updatedAt: queuedAt,
    ...input,
  };
}

class MemoryFirstSyncRunStore implements FirstSyncRunStore {
  readonly runs = new Map<string, SyncRun>();
  readonly transitions: Array<{ from: SyncStatus; to: SyncStatus }> = [];
  readonly checkpoints: string[] = [];

  async createQueued(input: {
    projectId: string;
    idempotencyKey: string;
    triggerSource: string;
  }): Promise<SyncRun> {
    const key = `${input.projectId}:${input.idempotencyKey}`;
    const existing = this.runs.get(key);
    if (existing) return existing;
    const created = syncRun({
      id: input.projectId === projectA ? runA : runB,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      triggerSource: input.triggerSource,
    });
    this.runs.set(key, created);
    return created;
  }

  async getById(projectId: string, runId: string): Promise<SyncRun | null> {
    return [...this.runs.values()].find(
      (run) => run.projectId === projectId && run.id === runId,
    ) ?? null;
  }

  async checkpoint(input: {
    projectId: string;
    runId: string;
    expectedStatus: SyncStatus;
    expectedVersion: number;
    checkpointedAt: string;
    progressCursor: string;
  }): Promise<SyncRun> {
    const run = await this.getById(input.projectId, input.runId);
    if (!run || run.status !== input.expectedStatus || run.version !== input.expectedVersion) {
      throw new Error("sync_run_concurrency_conflict");
    }
    const saved = {
      ...run,
      version: run.version + 1,
      progressCursor: input.progressCursor,
      lastProgressAt: input.checkpointedAt,
      updatedAt: input.checkpointedAt,
    };
    this.runs.set(`${run.projectId}:${run.idempotencyKey}`, saved);
    this.checkpoints.push(input.progressCursor);
    return saved;
  }

  async transition(input: {
    projectId: string;
    runId: string;
    expectedStatus: SyncStatus;
    expectedVersion: number;
    targetStatus: SyncStatus;
    transitionedAt: string;
    progressCursor: string | null;
    errorCode: string | null;
    errorSummary: string | null;
  }): Promise<SyncRun> {
    const run = await this.getById(input.projectId, input.runId);
    if (!run || run.status !== input.expectedStatus || run.version !== input.expectedVersion) {
      throw new Error("sync_run_concurrency_conflict");
    }
    this.transitions.push({ from: run.status, to: input.targetStatus });
    const terminal = ["completed", "failed", "cancelled"].includes(input.targetStatus);
    const saved: SyncRun = {
      ...run,
      status: input.targetStatus,
      version: run.version + 1,
      startedAt: input.targetStatus === "running" ? run.startedAt ?? input.transitionedAt : run.startedAt,
      finishedAt: terminal ? input.transitionedAt : null,
      progressCursor: input.progressCursor ?? run.progressCursor,
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
      updatedAt: input.transitionedAt,
    };
    this.runs.set(`${run.projectId}:${run.idempotencyKey}`, saved);
    return saved;
  }
}

function context(projectId = projectA, status: "active" | "suspended" | "revoked" = "active"): FirstSyncProjectContext {
  const suffix = projectId === projectA ? "a" : "b";
  return {
    projectId,
    repository: {
      githubObjectId: projectId === projectA ? "81001" : "82001",
      owner: `synthetic-owner-${suffix}`,
      name: `synthetic-repository-${suffix}`,
      fullName: `synthetic-owner-${suffix}/synthetic-repository-${suffix}`,
      visibility: "private",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      isDisabled: false,
      defaultBranch: "main",
      sourceUpdatedAt: "2026-08-05T00:00:00.000Z",
      sourceVersion: "2026-08-05T00:00:00.000Z",
    },
    installation: { installationId: projectId === projectA ? 81_001 : 82_001, status },
  };
}

function commit(id: string, sourceUpdatedAt = windowStart): GitHubCommitReadModel {
  return {
    repositoryFullName: context().repository.fullName,
    githubObjectId: id,
    objectType: "commit",
    sourceUpdatedAt,
    sourceVersion: id,
    message: `commit ${id}`,
    authoredAt: sourceUpdatedAt,
    committedAt: sourceUpdatedAt,
    authorLogin: "synthetic-author",
  };
}

function issue(id = "91001"): GitHubIssueReadModel {
  return {
    repositoryFullName: context().repository.fullName,
    githubObjectId: id,
    objectType: "issue",
    sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
    sourceVersion: "2026-06-01T00:00:00.000Z",
    number: 1,
    title: "Synthetic issue",
    state: "open",
    authorLogin: null,
    closedAt: null,
  };
}

function pullRequest(): GitHubPullRequestReadModel {
  return {
    repositoryFullName: context().repository.fullName,
    githubObjectId: "92001",
    objectType: "pull_request",
    sourceUpdatedAt: "2026-06-02T00:00:00.000Z",
    sourceVersion: "1".repeat(40),
    number: 2,
    title: "Synthetic pull request",
    state: "closed",
    isDraft: false,
    headSha: "1".repeat(40),
    baseRef: "main",
    mergedAt: "2026-06-03T00:00:00.000Z",
  };
}

function release(): GitHubReleaseReadModel {
  return {
    repositoryFullName: context().repository.fullName,
    githubObjectId: "93001",
    objectType: "release",
    sourceUpdatedAt: "2026-06-04T00:00:00.000Z",
    sourceVersion: "2026-06-04T00:00:00.000Z",
    tagName: "v1.0.0",
    name: "Synthetic release",
    isDraft: false,
    isPrerelease: false,
    publishedAt: "2026-06-04T00:00:00.000Z",
  };
}

function workflowRun(): GitHubWorkflowRunReadModel {
  return {
    repositoryFullName: context().repository.fullName,
    githubObjectId: "94001",
    objectType: "workflow_run",
    sourceUpdatedAt: "2026-06-05T00:00:00.000Z",
    sourceVersion: `${"2".repeat(40)}:1:2026-06-05T00:00:00.000Z`,
    workflowId: "95001",
    runNumber: 3,
    status: "completed",
    conclusion: "success",
    eventName: "push",
    headSha: "2".repeat(40),
    runAttempt: 1,
  };
}

function reader(overrides: Partial<GitHubActivityReader> = {}): GitHubActivityReader {
  return {
    listCommits: vi.fn().mockResolvedValue([
      commit("a".repeat(40)),
      commit("a".repeat(40)),
      commit("b".repeat(40), "2026-05-08T01:59:59.999Z"),
      commit("c".repeat(40), "2026-08-06T02:00:00.001Z"),
    ]),
    listIssues: vi.fn().mockResolvedValue([issue()]),
    listPullRequests: vi.fn().mockResolvedValue([pullRequest()]),
    listReleases: vi.fn().mockResolvedValue([release()]),
    listWorkflowRuns: vi.fn().mockResolvedValue([workflowRun()]),
    listChecks: vi.fn().mockRejectedValue(new Error("check_must_not_be_read")),
    ...overrides,
  };
}

class MemorySnapshotWriter implements GitHubActivitySnapshotWriter {
  readonly records = new Map<string, unknown>();
  readonly calls: ProjectScopedSnapshotGroup[] = [];
  failGroup: string | null = null;

  async upsertGroup(input: ProjectScopedSnapshotGroup) {
    if (this.failGroup === input.groupName) {
      throw new Error("github_activity_snapshot_write_failed");
    }
    this.calls.push(input);
    for (const item of input.items) {
      this.records.set(`${input.projectId}:${input.groupName}:${item.githubObjectId}`, item);
    }
    return {
      groupName: input.groupName,
      attempted: input.items.length,
      accepted: input.items.length,
      rejected: 0,
    };
  }
}

function setup(input: {
  contextStatus?: "active" | "suspended" | "revoked";
  reader?: GitHubActivityReader;
} = {}) {
  const runs = new MemoryFirstSyncRunStore();
  const contexts: FirstSyncProjectContextReader = {
    getByProjectId: vi.fn(async (projectId: string) => context(projectId, input.contextStatus)),
  };
  const dispatcher: JobDispatcher = {
    dispatch: vi.fn(async () => ({ providerJobId: "provider-event-001" })),
  };
  const tokens: FirstSyncInstallationTokenProvider = {
    issue: vi.fn(async () => ({ token: "synthetic-ephemeral-token", expiresAt: "2026-08-06T03:00:00.000Z" })),
  };
  const writer = new MemorySnapshotWriter();
  const activityReader = input.reader ?? reader();
  const start = new StartFirstRepositorySync({ runs, contexts, dispatcher });
  const execute = new ExecuteFirstRepositorySync({
    runs,
    contexts,
    tokens,
    reader: activityReader,
    writer,
    clock: { now: () => new Date("2026-08-06T02:30:00.000Z") },
  });
  return { runs, contexts, dispatcher, tokens, writer, activityReader, start, execute };
}

async function startJob(fixture: ReturnType<typeof setup>, projectId = projectA) {
  const receipt = await fixture.start.execute({ projectId, requestId: "request-001" });
  const dispatch = vi.mocked(fixture.dispatcher.dispatch).mock.calls[0]![0] as BackgroundJob;
  return { receipt, job: dispatch };
}

describe("StartFirstRepositorySync", () => {
  it("binds contracts and creates one project-scoped run and stable job", async () => {
    const fixture = setup();
    expect(firstSyncGroupsContract).toBe("first-sync-groups.v1");
    expect(githubActivitySnapshotWriterContract).toBe("github-activity-snapshot-writer.v1");

    const first = await fixture.start.execute({ projectId: projectA, requestId: "request-001" });
    const replay = await fixture.start.execute({ projectId: projectA, requestId: "request-001" });

    expect(first).toEqual({
      syncRunId: runA,
      jobId: runA,
      correlationId: `first-sync:${runA}`,
      idempotencyKey: "first-sync:request-001",
      providerJobId: "provider-event-001",
      windowStart,
      windowEnd: queuedAt,
      reused: false,
    });
    expect(replay).toEqual({ ...first, reused: true });
    expect(fixture.runs.runs).toHaveLength(1);
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ triggerSource: "first_sync", webhookDelivery: null }));
  });

  it("preserves the persisted queued timestamp precision for the initial checkpoint", async () => {
    const fixture = setup();
    const persistedQueuedAt = "2026-08-11T01:30:16.518718Z";
    const requestId = "request-precision";
    fixture.runs.runs.set(
      `${projectA}:first-sync:${requestId}`,
      syncRun({
        id: runA,
        projectId: projectA,
        idempotencyKey: `first-sync:${requestId}`,
        queuedAt: persistedQueuedAt,
        createdAt: persistedQueuedAt,
        updatedAt: persistedQueuedAt,
      }),
    );
    const checkpoint = vi.spyOn(fixture.runs, "checkpoint");

    const receipt = await fixture.start.execute({ projectId: projectA, requestId });
    const job = vi.mocked(fixture.dispatcher.dispatch).mock.calls[0]![0] as BackgroundJob;
    const checkpointInput = checkpoint.mock.calls[0]![0];
    const cursor = parseFirstSyncCursor(checkpointInput.progressCursor);

    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(checkpointInput.checkpointedAt).toBe(persistedQueuedAt);
    expect(receipt.windowEnd).toBe("2026-08-11T01:30:16.518Z");
    expect(job.requestedAt).toBe("2026-08-11T01:30:16.518Z");
    expect(cursor.windowEnd).toBe("2026-08-11T01:30:16.518Z");
  });

  it("isolates the same requestId across projects", async () => {
    const fixture = setup();
    const first = await fixture.start.execute({ projectId: projectA, requestId: "request-001" });
    const second = await fixture.start.execute({ projectId: projectB, requestId: "request-001" });
    expect(first.syncRunId).toBe(runA);
    expect(second.syncRunId).toBe(runB);
    expect(fixture.runs.runs).toHaveLength(2);
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed project/request identity before any side effect", async () => {
    const fixture = setup();
    await expect(fixture.start.execute({ projectId: "bad", requestId: " bad " })).rejects.toThrow(
      "first_sync_invalid_request",
    );
    expect(fixture.runs.runs).toHaveLength(0);
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });
});

describe("ExecuteFirstRepositorySync", () => {
  it("runs six groups in order, filters the window, deduplicates and completes", async () => {
    const fixture = setup();
    const { job } = await startJob(fixture);
    const result = await fixture.execute.execute({ job });

    expect(result.status).toBe("completed");
    expect(result.freshnessStatus).toBe("fresh");
    expect(result.lastSuccessfulAt).toBe("2026-08-06T02:30:00.000Z");
    expect(result.replayed).toBe(false);
    expect(fixture.writer.calls.map((call) => call.groupName)).toEqual([
      "repository", "commit", "issue", "pull_request", "release", "workflow_run",
    ]);
    expect(fixture.writer.calls[1]!.items.map((item) => item.githubObjectId)).toEqual([
      "a".repeat(40),
    ]);
    expect(parseFirstSyncCursor(result.cursor).completedGroups).toEqual([
      "repository", "commit", "issue", "pull_request", "release", "workflow_run",
    ]);
    expect(fixture.runs.transitions).toEqual([
      { from: "queued", to: "running" },
      { from: "running", to: "completed" },
    ]);
    expect(fixture.runs.checkpoints).toHaveLength(7);
    expect(fixture.activityReader.listChecks).not.toHaveBeenCalled();
  });

  it("treats empty typed groups as successful checkpoints", async () => {
    const emptyReader = reader({
      listCommits: vi.fn().mockResolvedValue([]),
      listIssues: vi.fn().mockResolvedValue([]),
      listPullRequests: vi.fn().mockResolvedValue([]),
      listReleases: vi.fn().mockResolvedValue([]),
      listWorkflowRuns: vi.fn().mockResolvedValue([]),
    });
    const fixture = setup({ reader: emptyReader });
    const { job } = await startJob(fixture);
    const result = await fixture.execute.execute({ job });
    expect(result.status).toBe("completed");
    expect(result.groups.map((group) => group.attempted)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("keeps successful groups and stops at a retryable middle-group failure", async () => {
    const activityReader = reader({
      listIssues: vi.fn().mockRejectedValue(new Error("github_activity_rate_limited")),
    });
    const fixture = setup({ reader: activityReader });
    const { job } = await startJob(fixture);
    const result = await fixture.execute.execute({ job });

    expect(result.status).toBe("partial");
    expect(result.freshnessStatus).toBe("partial");
    expect(result.failure).toEqual({
      groupName: "issue",
      code: "github_activity_rate_limited",
      retryable: true,
    });
    expect(parseFirstSyncCursor(result.cursor).completedGroups).toEqual(["repository", "commit"]);
    expect(fixture.writer.calls.map((call) => call.groupName)).toEqual(["repository", "commit"]);
    expect(activityReader.listPullRequests).not.toHaveBeenCalled();
  });

  it("recovers only unfinished groups from partial without record inflation", async () => {
    const activityReader = reader({
      listIssues: vi.fn()
        .mockRejectedValueOnce(new Error("github_activity_unavailable"))
        .mockResolvedValue([issue()]),
    });
    const fixture = setup({ reader: activityReader });
    const { job } = await startJob(fixture);
    const partial = await fixture.execute.execute({ job });
    const beforeRecovery = fixture.writer.records.size;
    const recovered = await fixture.execute.execute({ job });

    expect(partial.status).toBe("partial");
    expect(recovered.status).toBe("completed");
    expect(fixture.writer.calls.map((call) => call.groupName)).toEqual([
      "repository", "commit", "issue", "pull_request", "release", "workflow_run",
    ]);
    expect(fixture.writer.records.size).toBe(beforeRecovery + 4);
  });

  it("fails when the first group cannot be persisted", async () => {
    const fixture = setup();
    fixture.writer.failGroup = "repository";
    const { job } = await startJob(fixture);
    const result = await fixture.execute.execute({ job });
    expect(result.status).toBe("failed");
    expect(result.freshnessStatus).toBe("failed");
    expect(result.failure?.code).toBe("github_activity_snapshot_write_failed");
    expect(fixture.activityReader.listCommits).not.toHaveBeenCalled();
  });

  it.each(["revoked", "suspended"] as const)(
    "stops before token/read/write when installation is %s",
    async (contextStatus) => {
      const fixture = setup({ contextStatus });
      const { job } = await startJob(fixture);
      const result = await fixture.execute.execute({ job });
      expect(result.status).toBe("failed");
      expect(result.authorizationRevoked).toBe(true);
      expect(result.freshnessStatus).toBe("authorization_revoked");
      expect(result.failure?.code).toBe("github_activity_authorization_revoked");
      expect(fixture.tokens.issue).not.toHaveBeenCalled();
      expect(fixture.activityReader.listCommits).not.toHaveBeenCalled();
      expect(fixture.writer.calls).toHaveLength(0);
    },
  );

  it("maps token revocation and stops after the local repository group", async () => {
    const fixture = setup();
    vi.mocked(fixture.tokens.issue).mockRejectedValue(
      new Error("github_activity_authorization_revoked"),
    );
    const { job } = await startJob(fixture);
    const result = await fixture.execute.execute({ job });
    expect(result.freshnessStatus).toBe("authorization_revoked");
    expect(fixture.writer.calls.map((call) => call.groupName)).toEqual(["repository"]);
    expect(fixture.activityReader.listCommits).not.toHaveBeenCalled();
  });

  it("returns a completed replay as a no-op", async () => {
    const fixture = setup();
    const { job } = await startJob(fixture);
    await fixture.execute.execute({ job });
    const calls = fixture.writer.calls.length;
    vi.mocked(fixture.tokens.issue).mockClear();
    const replay = await fixture.execute.execute({ job });
    expect(replay.status).toBe("completed");
    expect(replay.replayed).toBe(true);
    expect(fixture.writer.calls).toHaveLength(calls);
    expect(fixture.tokens.issue).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer run on optimistic concurrency conflict", async () => {
    const fixture = setup();
    const { job } = await startJob(fixture);
    const original = fixture.runs.checkpoint.bind(fixture.runs);
    fixture.runs.checkpoint = vi.fn(async (input) => {
      if (parseFirstSyncCursor(input.progressCursor).completedGroups.length === 1) {
        throw new Error("sync_run_concurrency_conflict");
      }
      return original(input);
    });
    await expect(fixture.execute.execute({ job })).rejects.toThrow(
      "sync_run_concurrency_conflict",
    );
    const saved = await fixture.runs.getById(projectA, runA);
    expect(saved?.status).toBe("running");
  });
});
