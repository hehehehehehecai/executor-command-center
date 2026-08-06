import "server-only";

import { z } from "zod";

import type {
  FirstSyncCheckpointInput,
  FirstSyncProjectContext,
  FirstSyncProjectContextReader,
  FirstSyncRunStore,
  GitHubActivitySnapshotWriter,
  ProjectScopedSnapshotGroup,
  SnapshotWriteReceipt,
} from "@/application/synchronization/first-sync-use-cases";
import type {
  CreateSyncRunInput,
  TransitionSyncRunInput,
} from "@/application/synchronization/sync-run-use-cases";
import {
  syncStatuses,
  type SyncRun,
} from "@/domain/synchronization/synchronization-state";
import { SupabaseSyncRunRepository } from "./supabase-sync-run-repository";

export const firstSyncPersistenceContract = "first-sync-persistence.v1" as const;

type Options = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const clean = (maximum: number) => z.string().trim().min(1).max(maximum);
const objectId = clean(255);
const sourceVersion = clean(255);
const repositoryFullName = clean(512);
const sha = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i);
const nullableClean = (maximum: number) => clean(maximum).nullable();

const syncRunRowSchema = z.object({
  id: uuid,
  project_id: uuid,
  idempotency_key: clean(255),
  trigger_source: clean(100),
  status: z.enum(syncStatuses),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  queued_at: timestamp,
  started_at: timestamp.nullable(),
  finished_at: timestamp.nullable(),
  last_progress_at: timestamp.nullable(),
  progress_cursor: clean(2_000).nullable(),
  error_code: clean(128).nullable(),
  error_summary: clean(500).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
}).strict();

const contextSchema = z.object({
  project_id: uuid,
  github_repository_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  owner_login: clean(255),
  repository_name: clean(255),
  repository_full_name: repositoryFullName,
  visibility: z.enum(["public", "private", "internal"]),
  is_private: z.boolean(),
  is_fork: z.boolean(),
  is_archived: z.boolean(),
  is_disabled: z.boolean(),
  default_branch: clean(255),
  repository_updated_at: timestamp,
  installation_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  installation_status: z.enum(["active", "suspended", "revoked"]),
}).strict();

const commonReadModel = {
  repositoryFullName,
  githubObjectId: objectId,
  sourceUpdatedAt: timestamp,
  sourceVersion,
} as const;

const repositoryItem = z.object({
  githubObjectId: objectId,
  repositoryFullName,
  sourceUpdatedAt: timestamp,
  sourceVersion,
  defaultBranch: clean(255),
  visibility: z.enum(["public", "private", "internal"]),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  isDisabled: z.boolean(),
}).strict();

const commitItem = z.object({
  ...commonReadModel,
  objectType: z.literal("commit"),
  message: clean(100_000),
  authoredAt: timestamp.nullable(),
  committedAt: timestamp,
  authorLogin: nullableClean(255),
}).strict();

const issueItem = z.object({
  ...commonReadModel,
  objectType: z.literal("issue"),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: clean(100_000),
  state: z.enum(["open", "closed"]),
  authorLogin: nullableClean(255),
  closedAt: timestamp.nullable(),
}).strict();

const pullRequestItem = z.object({
  ...commonReadModel,
  objectType: z.literal("pull_request"),
  number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: clean(100_000),
  state: z.enum(["open", "closed"]),
  isDraft: z.boolean(),
  headSha: sha,
  baseRef: clean(255),
  mergedAt: timestamp.nullable(),
}).strict();

const releaseItem = z.object({
  ...commonReadModel,
  objectType: z.literal("release"),
  tagName: clean(255),
  name: nullableClean(100_000),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  publishedAt: timestamp.nullable(),
}).strict();

const workflowRunItem = z.object({
  ...commonReadModel,
  objectType: z.literal("workflow_run"),
  workflowId: objectId,
  runNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.enum(["queued", "in_progress", "completed", "waiting", "requested", "pending"]),
  conclusion: z.enum([
    "success", "failure", "neutral", "cancelled", "skipped", "timed_out",
    "action_required", "stale", "startup_failure",
  ]).nullable(),
  eventName: clean(255),
  headSha: sha,
  runAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();

const groupSchema = z.discriminatedUnion("groupName", [
  z.object({ projectId: uuid, groupName: z.literal("repository"), items: z.array(repositoryItem).max(10_000) }).strict(),
  z.object({ projectId: uuid, groupName: z.literal("commit"), items: z.array(commitItem).max(10_000) }).strict(),
  z.object({ projectId: uuid, groupName: z.literal("issue"), items: z.array(issueItem).max(10_000) }).strict(),
  z.object({ projectId: uuid, groupName: z.literal("pull_request"), items: z.array(pullRequestItem).max(10_000) }).strict(),
  z.object({ projectId: uuid, groupName: z.literal("release"), items: z.array(releaseItem).max(10_000) }).strict(),
  z.object({ projectId: uuid, groupName: z.literal("workflow_run"), items: z.array(workflowRunItem).max(10_000) }).strict(),
]);

const receiptSchema = z.object({
  group_name: z.enum(["repository", "commit", "issue", "pull_request", "release", "workflow_run"]),
  attempted: z.number().int().nonnegative().max(10_000),
  accepted: z.number().int().nonnegative().max(10_000),
  rejected: z.number().int().nonnegative().max(10_000),
}).strict();

const allowedFailures = new Set([
  "sync_run_project_not_found",
  "sync_run_not_found",
  "sync_run_invalid_transition",
  "sync_run_concurrency_conflict",
  "sync_run_invalid_request",
  "first_sync_project_not_found",
  "first_sync_context_invalid",
  "first_sync_cursor_invalid",
  "github_activity_snapshot_write_invalid",
]);

function storageFailure(): Error {
  return new Error("first_sync_storage_failed");
}

function responseMessage(value: unknown): string | null {
  return typeof value === "object" && value !== null && "message" in value &&
    typeof value.message === "string" ? value.message : null;
}

function mapRun(value: unknown): SyncRun {
  const parsed = syncRunRowSchema.safeParse(value);
  if (!parsed.success) throw storageFailure();
  const row = parsed.data;
  return {
    id: row.id,
    projectId: row.project_id,
    idempotencyKey: row.idempotency_key,
    triggerSource: row.trigger_source,
    status: row.status,
    version: row.version,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastProgressAt: row.last_progress_at,
    progressCursor: row.progress_cursor,
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectContext(value: unknown): FirstSyncProjectContext | null {
  if (value === null) return null;
  const parsed = contextSchema.safeParse(value);
  if (!parsed.success) throw storageFailure();
  const row = parsed.data;
  return {
    projectId: row.project_id,
    repository: {
      githubObjectId: String(row.github_repository_id),
      owner: row.owner_login,
      name: row.repository_name,
      fullName: row.repository_full_name,
      visibility: row.visibility,
      isPrivate: row.is_private,
      isFork: row.is_fork,
      isArchived: row.is_archived,
      isDisabled: row.is_disabled,
      defaultBranch: row.default_branch,
      sourceUpdatedAt: row.repository_updated_at,
      sourceVersion: row.repository_updated_at,
    },
    installation: {
      installationId: row.installation_id,
      status: row.installation_status,
    },
  };
}

function databaseItems(input: z.infer<typeof groupSchema>): readonly Record<string, unknown>[] {
  switch (input.groupName) {
    case "repository": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      repositoryFullName: item.repositoryFullName,
      defaultBranch: item.defaultBranch,
      visibility: item.visibility,
      isPrivate: item.isPrivate,
      isFork: item.isFork,
      isArchived: item.isArchived,
      isDisabled: item.isDisabled,
    }));
    case "commit": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      message: item.message,
      authoredAt: item.authoredAt,
      committedAt: item.committedAt,
      authorLogin: item.authorLogin,
    }));
    case "issue": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      number: item.number,
      title: item.title,
      state: item.state,
      authorLogin: item.authorLogin,
      closedAt: item.closedAt,
    }));
    case "pull_request": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      number: item.number,
      title: item.title,
      state: item.state,
      isDraft: item.isDraft,
      headSha: item.headSha,
      baseRef: item.baseRef,
      mergedAt: item.mergedAt,
    }));
    case "release": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      tagName: item.tagName,
      name: item.name,
      isDraft: item.isDraft,
      isPrerelease: item.isPrerelease,
      publishedAt: item.publishedAt,
    }));
    case "workflow_run": return input.items.map((item) => ({
      githubObjectId: item.githubObjectId,
      sourceUpdatedAt: item.sourceUpdatedAt,
      sourceVersion: item.sourceVersion,
      workflowId: item.workflowId,
      runNumber: item.runNumber,
      status: item.status,
      conclusion: item.conclusion,
      eventName: item.eventName,
      headSha: item.headSha,
    }));
  }
}

export class SupabaseFirstSyncStore implements
  FirstSyncRunStore,
  FirstSyncProjectContextReader,
  GitHubActivitySnapshotWriter
{
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly syncRuns: SupabaseSyncRunRepository;

  constructor(private readonly options: Options) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
    this.syncRuns = new SupabaseSyncRunRepository(options);
  }

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(new URL(`rpc/${name}`, this.baseUrl).toString(), {
        method: "POST",
        headers: {
          apikey: this.options.serviceRoleKey,
          authorization: `Bearer ${this.options.serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw storageFailure();
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw storageFailure();
    }
    if (!response.ok) {
      const message = responseMessage(payload);
      if (message && allowedFailures.has(message)) throw new Error(message);
      throw storageFailure();
    }
    return payload;
  }

  createQueued(input: CreateSyncRunInput): Promise<SyncRun> {
    return this.syncRuns.createQueued(input);
  }

  transition(input: TransitionSyncRunInput): Promise<SyncRun> {
    return this.syncRuns.transition(input);
  }

  async getById(projectId: string, runId: string): Promise<SyncRun | null> {
    const payload = await this.rpc("get_first_sync_run", {
      p_project_id: projectId,
      p_run_id: runId,
    });
    return payload === null ? null : mapRun(payload);
  }

  async checkpoint(input: FirstSyncCheckpointInput): Promise<SyncRun> {
    return mapRun(await this.rpc("checkpoint_first_sync_run", {
      p_project_id: input.projectId,
      p_run_id: input.runId,
      p_expected_status: input.expectedStatus,
      p_expected_version: input.expectedVersion,
      p_checkpointed_at: input.checkpointedAt,
      p_progress_cursor: input.progressCursor,
    }));
  }

  async getByProjectId(projectId: string): Promise<FirstSyncProjectContext | null> {
    return projectContext(await this.rpc("read_first_sync_context", {
      p_project_id: projectId,
    }));
  }

  async upsertGroup(input: ProjectScopedSnapshotGroup): Promise<SnapshotWriteReceipt> {
    const parsed = groupSchema.safeParse(input);
    if (!parsed.success) throw new Error("github_activity_snapshot_write_invalid");
    const payload = await this.rpc("upsert_github_activity_snapshot_group", {
      p_project_id: parsed.data.projectId,
      p_group_name: parsed.data.groupName,
      p_items: databaseItems(parsed.data),
    });
    const receipt = receiptSchema.safeParse(payload);
    if (!receipt.success || receipt.data.group_name !== parsed.data.groupName) {
      throw storageFailure();
    }
    return {
      groupName: receipt.data.group_name,
      attempted: receipt.data.attempted,
      accepted: receipt.data.accepted,
      rejected: receipt.data.rejected,
    };
  }
}
