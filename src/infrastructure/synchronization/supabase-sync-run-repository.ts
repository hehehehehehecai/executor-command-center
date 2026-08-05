import "server-only";

import type {
  CreateSyncRunInput,
  SyncRunRepository,
  TransitionSyncRunInput,
} from "@/application/synchronization/sync-run-use-cases";
import {
  syncStatuses,
  type SyncRun,
} from "@/domain/synchronization/synchronization-state";
import { z } from "zod";

export const syncRunsPersistenceContract = "sync-runs.v1" as const;

interface RepositoryOptions {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
}

const syncRunRowSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  idempotency_key: z.string().min(1).max(255),
  trigger_source: z.string().min(1).max(100),
  status: z.enum(syncStatuses),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  queued_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  last_progress_at: z.iso.datetime({ offset: true }).nullable(),
  progress_cursor: z.string().min(1).max(2000).nullable(),
  error_code: z.string().min(1).max(128).nullable(),
  error_summary: z.string().min(1).max(500).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).strict();

const allowedFailures = new Set([
  "sync_run_project_not_found",
  "sync_run_not_found",
  "sync_run_invalid_transition",
  "sync_run_concurrency_conflict",
  "sync_run_invalid_request",
]);

function storageFailure(): Error {
  return new Error("sync_run_storage_failed");
}

function responseMessage(value: unknown): string | null {
  return typeof value === "object" && value !== null && "message" in value &&
    typeof value.message === "string" ? value.message : null;
}

function mapRow(value: unknown): SyncRun {
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

export class SupabaseSyncRunRepository implements SyncRunRepository {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RepositoryOptions) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
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

  async createQueued(input: CreateSyncRunInput): Promise<SyncRun> {
    return mapRow(await this.rpc("create_sync_run", {
      p_project_id: input.projectId,
      p_idempotency_key: input.idempotencyKey,
      p_trigger_source: input.triggerSource,
    }));
  }

  async getLatest(projectId: string): Promise<SyncRun | null> {
    const payload = await this.rpc("get_latest_sync_run", { p_project_id: projectId });
    return payload === null ? null : mapRow(payload);
  }

  async transition(input: TransitionSyncRunInput): Promise<SyncRun> {
    return mapRow(await this.rpc("transition_sync_run", {
      p_project_id: input.projectId,
      p_run_id: input.runId,
      p_expected_status: input.expectedStatus,
      p_expected_version: input.expectedVersion,
      p_target_status: input.targetStatus,
      p_transitioned_at: input.transitionedAt,
      p_progress_cursor: input.progressCursor,
      p_error_code: input.errorCode,
      p_error_summary: input.errorSummary,
    }));
  }
}
