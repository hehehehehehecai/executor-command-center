import "server-only";

import { z } from "zod";

import type {
  ReconciliationProject,
  ReconciliationProjectReader,
  SyncRequestReceipt,
  SyncRequestStore,
} from "@/application/synchronization/reconciliation-use-cases";

type Options = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const uuid = z.string().uuid();
const clean = (maximum: number) => z.string().trim().min(1).max(maximum);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const facts = z.object({
  repository: digest,
  commit: digest,
  issue: digest,
  pull_request: digest,
  release: digest,
  workflow_run: digest,
}).strict();
const projectSchema = z.object({
  project_id: uuid,
  selected_repository_id: uuid,
  installation_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  installation_status: z.enum(["active", "suspended", "revoked", "missing"]),
  repository_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  repository_owner: clean(255).nullable(),
  repository_name: clean(255).nullable(),
  repository_full_name: clean(512).nullable(),
  mapping_complete: z.boolean(),
  local_facts: facts,
}).strict();
const requestSchema = z.object({
  outcome: z.enum(["new", "coalesced", "duplicate", "authorization_revoked", "suspended", "forbidden", "not_found"]),
  project_id: uuid,
  sync_run_id: uuid.nullable(),
  sync_run_status: z.enum(["queued", "running", "partial", "completed", "failed", "cancelled"]).nullable(),
  dispatch_status: z.enum(["pending", "dispatching", "dispatched"]).nullable(),
  dispatch_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();
const claimSchema = z.object({
  claimed: z.boolean(),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
const completeSchema = z.object({
  completed: z.literal(true),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
const allowedFailures = new Set([
  "sync_request_invalid",
  "sync_dispatch_invalid",
  "sync_dispatch_not_found",
  "sync_dispatch_concurrency_conflict",
]);

function failure(): Error {
  return new Error("reconciliation_storage_failed");
}

function message(value: unknown): string | null {
  return typeof value === "object" && value !== null && "message" in value
    && typeof value.message === "string" ? value.message : null;
}

function mapProject(row: z.infer<typeof projectSchema>): ReconciliationProject {
  return {
    projectId: row.project_id,
    selectedRepositoryId: row.selected_repository_id,
    installationId: row.installation_id,
    installationStatus: row.installation_status,
    repositoryId: row.repository_id,
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    repositoryFullName: row.repository_full_name,
    mappingComplete: row.mapping_complete,
    localFacts: row.local_facts,
  };
}

function mapReceipt(row: z.infer<typeof requestSchema>): SyncRequestReceipt {
  return {
    outcome: row.outcome,
    projectId: row.project_id,
    syncRunId: row.sync_run_id,
    syncRunStatus: row.sync_run_status,
    dispatchState: row.dispatch_status,
    dispatchVersion: row.dispatch_version,
  };
}

export class SupabaseReconciliationStore implements ReconciliationProjectReader, SyncRequestStore {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: Options) {
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
      throw failure();
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw failure();
    }
    if (!response.ok) {
      const safe = message(payload);
      if (safe && allowedFailures.has(safe)) throw new Error(safe);
      throw failure();
    }
    return payload;
  }

  async listEligible(input: { readonly snapshotSince: string }): Promise<readonly ReconciliationProject[]> {
    const parsed = z.array(projectSchema).safeParse(await this.rpc(
      "list_reconciliation_projects",
      { p_snapshot_since: input.snapshotSince },
    ));
    if (!parsed.success) throw failure();
    return parsed.data.map(mapProject);
  }

  async request(input: Parameters<SyncRequestStore["request"]>[0]): Promise<SyncRequestReceipt> {
    const parsed = requestSchema.safeParse(await this.rpc("request_project_sync", {
      p_project_id: input.projectId,
      p_trigger_source: input.triggerSource,
      p_request_identity: input.requestIdentity,
      p_actor_user_id: input.actorUserId,
      p_requested_at: input.requestedAt,
    }));
    if (!parsed.success) throw failure();
    return mapReceipt(parsed.data);
  }

  async claimDispatch(input: Parameters<SyncRequestStore["claimDispatch"]>[0]) {
    const parsed = claimSchema.safeParse(await this.rpc("claim_project_sync_dispatch", {
      p_project_id: input.projectId,
      p_sync_run_id: input.syncRunId,
      p_expected_version: input.expectedVersion,
      p_claimed_at: input.claimedAt,
    }));
    if (!parsed.success) throw failure();
    return parsed.data;
  }

  async completeDispatch(input: Parameters<SyncRequestStore["completeDispatch"]>[0]): Promise<void> {
    const parsed = completeSchema.safeParse(await this.rpc("complete_project_sync_dispatch", {
      p_project_id: input.projectId,
      p_sync_run_id: input.syncRunId,
      p_expected_version: input.expectedVersion,
      p_provider_job_id: input.providerJobId,
      p_completed_at: input.completedAt,
    }));
    if (!parsed.success) throw failure();
  }
}
