import type { JobDispatcher } from "@/application/jobs/job-dispatcher";
import {
  backgroundJobContract,
  type BackgroundJob,
  type WebhookDeliveryLineage,
} from "@/domain/jobs/background-job";
import {
  compareRepositoryFacts,
  freezeDailyReconciliationWindow,
  type ReconciliationDecision,
  type ReconciliationFactGroup,
  type ReconciliationWindow,
  type RepositoryVersionFacts,
} from "@/domain/synchronization/reconciliation";

export type ReconciliationProject = {
  readonly projectId: string;
  readonly selectedRepositoryId: string;
  readonly installationId: number | null;
  readonly installationStatus: "active" | "suspended" | "revoked" | "missing";
  readonly repositoryId: number | null;
  readonly repositoryOwner: string | null;
  readonly repositoryName: string | null;
  readonly repositoryFullName: string | null;
  readonly mappingComplete: boolean;
  readonly localFacts: RepositoryVersionFacts;
};

export interface ReconciliationProjectReader {
  listEligible(input: { readonly snapshotSince: string }): Promise<readonly ReconciliationProject[]>;
}

export interface RepositoryReconciliationReader {
  readMinimalFacts(
    project: ReconciliationProject,
    input: { readonly snapshotSince: string; readonly signal?: AbortSignal },
  ): Promise<RepositoryVersionFacts>;
}

export type SyncRequestReceipt = {
  readonly outcome: "new" | "coalesced" | "duplicate" | "authorization_revoked" | "suspended" | "forbidden" | "not_found";
  readonly projectId: string;
  readonly syncRunId: string | null;
  readonly syncRunStatus: "queued" | "running" | "partial" | "completed" | "failed" | "cancelled" | null;
  readonly dispatchState: "pending" | "dispatching" | "dispatched" | null;
  readonly dispatchVersion: number | null;
};

export interface SyncRequestStore {
  request(input: {
    readonly projectId: string;
    readonly triggerSource: "webhook" | "reconciliation" | "manual";
    readonly requestIdentity: string;
    readonly actorUserId: string | null;
    readonly requestedAt: string;
  }): Promise<SyncRequestReceipt>;
  claimDispatch(input: {
    readonly projectId: string;
    readonly syncRunId: string;
    readonly expectedVersion: number;
    readonly claimedAt: string;
  }): Promise<{ readonly claimed: boolean; readonly version: number }>;
  completeDispatch(input: {
    readonly projectId: string;
    readonly syncRunId: string;
    readonly expectedVersion: number;
    readonly providerJobId: string;
    readonly completedAt: string;
  }): Promise<void>;
}

export type SyncRequestResult = {
  readonly result: "accepted" | "coalesced" | "duplicate" | "authorization_revoked" | "suspended" | "forbidden" | "not_found" | "failed";
  readonly code: string;
  readonly syncRunId: string | null;
  readonly providerJobId: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const safeReadErrors = new Set([
  "github_activity_authorization_revoked",
  "github_activity_rate_limited",
  "github_activity_not_found",
  "github_activity_timeout",
  "github_activity_invalid_response",
  "github_activity_pagination_invalid",
  "github_activity_unavailable",
  "reconciliation_repository_not_found",
]);

function canonical(value: string): boolean {
  if (!timestamp.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function stableFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return safeReadErrors.has(message) ? message : "reconciliation_failed";
}

export class ProjectSyncRequestCoordinator {
  constructor(private readonly dependencies: {
    readonly store: SyncRequestStore;
    readonly dispatcher: JobDispatcher;
  }) {}

  async execute(input: {
    readonly projectId: string;
    readonly triggerSource: "webhook" | "reconciliation" | "manual";
    readonly requestIdentity: string;
    readonly actorUserId: string | null;
    readonly requestedAt: string;
    readonly webhookDelivery?: WebhookDeliveryLineage | null;
  }): Promise<SyncRequestResult> {
    const receipt = await this.dependencies.store.request(input);
    if (receipt.outcome === "authorization_revoked") return { result: "authorization_revoked", code: "manual_resync_authorization_revoked", syncRunId: null, providerJobId: null };
    if (receipt.outcome === "suspended") return { result: "suspended", code: "manual_resync_suspended", syncRunId: null, providerJobId: null };
    if (receipt.outcome === "forbidden") return { result: "forbidden", code: "manual_resync_forbidden", syncRunId: null, providerJobId: null };
    if (receipt.outcome === "not_found") return { result: "not_found", code: "manual_resync_not_found", syncRunId: null, providerJobId: null };
    if (receipt.syncRunId === null) throw new Error("sync_request_invalid_receipt");
    if (receipt.dispatchState === null || receipt.dispatchState === "dispatched") {
      const replay = receipt.outcome === "duplicate" ? "duplicate" : "coalesced";
      return { result: replay, code: `manual_resync_${replay}`, syncRunId: receipt.syncRunId, providerJobId: null };
    }
    if (receipt.dispatchVersion === null) throw new Error("sync_request_invalid_receipt");
    const claim = await this.dependencies.store.claimDispatch({
      projectId: input.projectId,
      syncRunId: receipt.syncRunId,
      expectedVersion: receipt.dispatchVersion,
      claimedAt: input.requestedAt,
    });
    if (!claim.claimed) {
      return { result: "coalesced", code: "manual_resync_coalesced", syncRunId: receipt.syncRunId, providerJobId: null };
    }
    const job: BackgroundJob = {
      version: backgroundJobContract,
      jobType: "project.sync.requested.v1",
      jobId: receipt.syncRunId,
      projectId: input.projectId,
      syncRunId: receipt.syncRunId,
      idempotencyKey: `sync-request:${input.requestIdentity}`,
      correlationId: `sync:${receipt.syncRunId}`,
      requestedAt: input.requestedAt,
      triggerSource: input.triggerSource,
      webhookDelivery: input.webhookDelivery ?? null,
    };
    let providerJobId: string;
    try {
      ({ providerJobId } = await this.dependencies.dispatcher.dispatch(job));
    } catch {
      throw new Error("sync_dispatch_failed");
    }
    await this.dependencies.store.completeDispatch({
      projectId: input.projectId,
      syncRunId: receipt.syncRunId,
      expectedVersion: claim.version,
      providerJobId,
      completedAt: input.requestedAt,
    });
    return { result: "accepted", code: "manual_resync_accepted", syncRunId: receipt.syncRunId, providerJobId };
  }
}

type DailyProjectResult = {
  readonly projectId: string;
  readonly decision: ReconciliationDecision["decision"] | "failed";
  readonly changedGroups: readonly ReconciliationFactGroup[];
  readonly syncResult?: SyncRequestResult["result"];
  readonly syncRunId?: string | null;
  readonly code?: string;
};

export class RunDailyRepositoryReconciliation {
  constructor(private readonly dependencies: {
    readonly projects: ReconciliationProjectReader;
    readonly reader: RepositoryReconciliationReader;
    readonly coordinator: ProjectSyncRequestCoordinator;
  }) {}

  async execute(input: { readonly scheduledAt: string; readonly signal?: AbortSignal }): Promise<{
    readonly window: ReconciliationWindow;
    readonly projects: readonly DailyProjectResult[];
  }> {
    const window = freezeDailyReconciliationWindow(input.scheduledAt);
    const projects = await this.dependencies.projects.listEligible({ snapshotSince: window.snapshotSince });
    const results: DailyProjectResult[] = [];
    for (const project of projects) {
      if (project.installationStatus === "missing" || !project.mappingComplete) {
        results.push({ projectId: project.projectId, decision: "blocked", changedGroups: [] });
        continue;
      }
      if (project.installationStatus === "revoked") {
        results.push({ projectId: project.projectId, decision: "authorization_revoked", changedGroups: [] });
        continue;
      }
      if (project.installationStatus === "suspended") {
        results.push({ projectId: project.projectId, decision: "blocked", changedGroups: [] });
        continue;
      }
      let remote: RepositoryVersionFacts;
      try {
        remote = await this.dependencies.reader.readMinimalFacts(project, {
          snapshotSince: window.snapshotSince,
          signal: input.signal,
        });
      } catch (error) {
        results.push({ projectId: project.projectId, decision: "failed", changedGroups: [], code: stableFailure(error) });
        continue;
      }
      const decision = compareRepositoryFacts({
        installationStatus: "active",
        mappingComplete: project.mappingComplete,
        local: project.localFacts,
        remote,
      });
      if (decision.decision !== "difference") {
        results.push({ projectId: project.projectId, ...decision });
        continue;
      }
      try {
        const sync = await this.dependencies.coordinator.execute({
          projectId: project.projectId,
          triggerSource: "reconciliation",
          requestIdentity: window.requestIdentity,
          actorUserId: null,
          requestedAt: input.scheduledAt,
        });
        results.push({ projectId: project.projectId, ...decision, syncResult: sync.result, syncRunId: sync.syncRunId });
      } catch (error) {
        results.push({ projectId: project.projectId, decision: "failed", changedGroups: decision.changedGroups, code: stableFailure(error) });
      }
    }
    return { window, projects: results };
  }
}

type VerifiedSessionReader = { getVerifiedUserId(): Promise<string | null> };

export class ManualRepositoryResync {
  constructor(private readonly dependencies: {
    readonly session: VerifiedSessionReader;
    readonly coordinator: ProjectSyncRequestCoordinator;
  }) {}

  async execute(input: {
    readonly projectId: string;
    readonly requestId: string;
    readonly requestedAt: string;
  }): Promise<SyncRequestResult | { readonly result: "rejected"; readonly code: string; readonly syncRunId: null; readonly providerJobId: null }> {
    if (!uuid.test(input.projectId) || !requestId.test(input.requestId) || !canonical(input.requestedAt)) {
      return { result: "rejected", code: "manual_resync_invalid_request", syncRunId: null, providerJobId: null };
    }
    const actorUserId = await this.dependencies.session.getVerifiedUserId();
    if (!actorUserId || !uuid.test(actorUserId)) {
      return { result: "rejected", code: "manual_resync_unauthenticated", syncRunId: null, providerJobId: null };
    }
    try {
      return await this.dependencies.coordinator.execute({
        projectId: input.projectId,
        triggerSource: "manual",
        requestIdentity: `manual:${input.requestId}`,
        actorUserId,
        requestedAt: input.requestedAt,
      });
    } catch {
      return { result: "failed", code: "manual_resync_failed", syncRunId: null, providerJobId: null };
    }
  }
}
