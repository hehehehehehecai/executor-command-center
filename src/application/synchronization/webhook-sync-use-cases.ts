import type { JobDispatcher } from "@/application/jobs/job-dispatcher";
import type { ProjectSynchronizationResult } from "@/application/synchronization/project-sync-use-cases";
import type { SyncRequestStore } from "@/application/synchronization/reconciliation-use-cases";
import { parseWebhookInternalEvent, type GitHubWebhookDeliveryProcessingRepository, type GitHubWebhookDeliveryRepository, type GitHubWebhookProcessingErrorCode } from "@/application/webhooks/ingest-github-webhook";
import { backgroundJobContract, parseBackgroundJob, type BackgroundJob, type WebhookDeliveryLineage } from "@/domain/jobs/background-job";

export const webhookSynchronizationRuntimeContract = "github-webhook-synchronization-runtime.v1" as const;
const processingErrors = new Set<GitHubWebhookProcessingErrorCode>(["github_activity_rate_limited", "github_activity_timeout", "github_activity_unavailable", "github_activity_snapshot_write_failed", "sync_run_concurrency_conflict", "github_webhook_processing_failed"]);

function safeProcessingCode(error: unknown): GitHubWebhookProcessingErrorCode {
  const message = error instanceof Error ? error.message : "";
  return processingErrors.has(message as GitHubWebhookProcessingErrorCode) ? message as GitHubWebhookProcessingErrorCode : "github_webhook_processing_failed";
}

export class WebhookSynchronizationRuntime {
  constructor(private readonly dependencies: {
    readonly requests: SyncRequestStore;
    readonly deliveries: GitHubWebhookDeliveryRepository & GitHubWebhookDeliveryProcessingRepository;
    readonly dispatcher: JobDispatcher;
    readonly executor: { execute(input: { job: unknown; signal?: AbortSignal }): Promise<ProjectSynchronizationResult> };
    readonly clock: { now(): Date };
  }) {}

  private async observe(event: ReturnType<typeof parseWebhookInternalEvent>) {
    return this.dependencies.deliveries.register({ deliveryId: event.deliveryId, bodySha256: event.bodySha256, eventName: event.eventName, action: event.action, installationId: event.installationId, repositoryId: event.repositoryId, repositoryFullName: event.repositoryFullName, internalEventId: event.eventId, supported: true, receivedAt: event.receivedAt });
  }

  async request(input: unknown): Promise<{ outcome: "accepted" | "duplicate" | "coalesced"; syncRunId: string | null; providerJobId: string | null }> {
    const event = parseWebhookInternalEvent(input);
    const observed = await this.observe(event);
    if (observed.outcome === "conflict" || observed.projectId !== event.projectId) throw new Error("github_webhook_delivery_conflict");
    if (observed.status === "completed") return { outcome: "duplicate", syncRunId: null, providerJobId: null };
    if (!["dispatched", "processing", "failed"].includes(observed.status)) throw new Error("github_webhook_dispatch_not_ready");
    const requestIdentity = `webhook:${event.deliveryId}`;
    const receipt = await this.dependencies.requests.request({ projectId: event.projectId, triggerSource: "webhook", requestIdentity, actorUserId: null, requestedAt: event.receivedAt });
    if (!receipt.syncRunId) {
      if (receipt.outcome === "authorization_revoked" || receipt.outcome === "suspended") return { outcome: "coalesced", syncRunId: null, providerJobId: null };
      throw new Error("github_webhook_sync_request_failed");
    }
    if (receipt.syncRunStatus !== "queued" && receipt.syncRunStatus !== "running" && receipt.syncRunStatus !== "partial") return { outcome: "duplicate", syncRunId: receipt.syncRunId, providerJobId: null };
    if (receipt.dispatchVersion === null || receipt.dispatchState === null || receipt.dispatchState === "dispatched") return { outcome: "coalesced", syncRunId: receipt.syncRunId, providerJobId: null };
    const dispatchClaim = await this.dependencies.requests.claimDispatch({ projectId: event.projectId, syncRunId: receipt.syncRunId, expectedVersion: receipt.dispatchVersion, claimedAt: event.receivedAt });
    if (!dispatchClaim.claimed) return { outcome: "coalesced", syncRunId: receipt.syncRunId, providerJobId: null };
    const processingClaim = await this.dependencies.deliveries.claimProcessing({ deliveryId: event.deliveryId, syncRunId: receipt.syncRunId, expectedVersion: observed.version, claimedAt: event.receivedAt });
    if (!processingClaim.claimed) return { outcome: "duplicate", syncRunId: receipt.syncRunId, providerJobId: null };
    const lineage: WebhookDeliveryLineage = { deliveryId: event.deliveryId, bodySha256: event.bodySha256, eventName: event.eventName, action: event.action, installationId: event.installationId, repositoryId: event.repositoryId, repositoryFullName: event.repositoryFullName, internalEventId: event.eventId, processingVersion: processingClaim.version };
    const job: BackgroundJob = { version: backgroundJobContract, jobType: "project.sync.requested.v1", jobId: receipt.syncRunId, projectId: event.projectId, syncRunId: receipt.syncRunId, idempotencyKey: `sync-request:${requestIdentity}`, correlationId: `sync:${receipt.syncRunId}`, requestedAt: event.receivedAt, triggerSource: "webhook", webhookDelivery: lineage };
    try {
      const provider = await this.dependencies.dispatcher.dispatch(job);
      await this.dependencies.requests.completeDispatch({ projectId: event.projectId, syncRunId: receipt.syncRunId, expectedVersion: dispatchClaim.version, providerJobId: provider.providerJobId, completedAt: event.receivedAt });
      return { outcome: "accepted", syncRunId: receipt.syncRunId, providerJobId: provider.providerJobId };
    } catch (error) {
      await this.dependencies.deliveries.failProcessing({ deliveryId: event.deliveryId, syncRunId: receipt.syncRunId, expectedVersion: processingClaim.version, safeErrorCode: "github_webhook_processing_failed", failedAt: event.receivedAt });
      throw new Error("github_webhook_processing_failed", { cause: error });
    }
  }

  async execute(input: { readonly job: unknown; readonly signal?: AbortSignal }): Promise<ProjectSynchronizationResult> {
    const parsedJob = parseBackgroundJob(input.job);
    if (parsedJob.triggerSource !== "webhook" || !parsedJob.webhookDelivery) throw new Error("github_webhook_job_invalid");
    const observed = await this.dependencies.deliveries.register({ deliveryId: parsedJob.webhookDelivery.deliveryId, bodySha256: parsedJob.webhookDelivery.bodySha256, eventName: parsedJob.webhookDelivery.eventName, action: parsedJob.webhookDelivery.action, installationId: parsedJob.webhookDelivery.installationId, repositoryId: parsedJob.webhookDelivery.repositoryId, repositoryFullName: parsedJob.webhookDelivery.repositoryFullName, internalEventId: parsedJob.webhookDelivery.internalEventId, supported: true, receivedAt: parsedJob.requestedAt });
    if (observed.outcome === "conflict" || observed.projectId !== parsedJob.projectId) throw new Error("github_webhook_delivery_conflict");
    let processingVersion = observed.version;
    if (observed.status !== "processing" && observed.status !== "completed") {
      const claim = await this.dependencies.deliveries.claimProcessing({ deliveryId: parsedJob.webhookDelivery.deliveryId, syncRunId: parsedJob.syncRunId, expectedVersion: observed.version, claimedAt: this.dependencies.clock.now().toISOString() });
      if (!claim.claimed) throw new Error("sync_run_concurrency_conflict");
      processingVersion = claim.version;
    } else if (observed.status === "processing" && observed.version !== parsedJob.webhookDelivery.processingVersion) {
      throw new Error("sync_run_concurrency_conflict");
    }
    let result: ProjectSynchronizationResult;
    try { result = await this.dependencies.executor.execute(input); }
    catch (error) {
      if (observed.status !== "completed") await this.dependencies.deliveries.failProcessing({ deliveryId: parsedJob.webhookDelivery.deliveryId, syncRunId: parsedJob.syncRunId, expectedVersion: processingVersion, safeErrorCode: safeProcessingCode(error), failedAt: this.dependencies.clock.now().toISOString() });
      throw new Error(safeProcessingCode(error), { cause: error });
    }
    if (observed.status === "completed") return result;
    if (result.status === "completed" || (result.status === "partial" && !result.retryable)) {
      await this.dependencies.deliveries.completeProcessing({ deliveryId: parsedJob.webhookDelivery.deliveryId, syncRunId: parsedJob.syncRunId, expectedVersion: processingVersion, completedAt: this.dependencies.clock.now().toISOString() });
      return result;
    }
    const code = processingErrors.has(result.errorCode as GitHubWebhookProcessingErrorCode) ? result.errorCode as GitHubWebhookProcessingErrorCode : "github_webhook_processing_failed";
    await this.dependencies.deliveries.failProcessing({ deliveryId: parsedJob.webhookDelivery.deliveryId, syncRunId: parsedJob.syncRunId, expectedVersion: processingVersion, safeErrorCode: code, failedAt: this.dependencies.clock.now().toISOString() });
    if (result.retryable) throw new Error(code);
    return result;
  }

}
