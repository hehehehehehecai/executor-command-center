import { githubWebhookEventContract, parseGitHubWebhookEvent, parseGitHubWebhookHeaders, type GitHubWebhookInstallationState } from "@/domain/webhooks/github-webhook";

export const githubWebhookIngestionContract = "github-webhook-ingestion.v1" as const;
export const githubWebhookDispatcherContract = "github-webhook-dispatcher.v1" as const;
export const githubWebhookDeliveryProcessingContract = "github-webhook-delivery-processing.v1" as const;
export const githubWebhookMaxBodyBytes = 1_048_576;

export type WebhookResult = { readonly result: "accepted" | "duplicate" | "ignored" | "rejected"; readonly code: string; readonly httpStatus: number };
export type WebhookInternalEvent = { readonly version: typeof githubWebhookEventContract; readonly eventId: string; readonly idempotencyKey: string; readonly deliveryId: string; readonly kind: string; readonly action: string | null; readonly projectId: string; readonly installationId: number; readonly repositoryId: number; readonly githubObjectId: string; readonly receivedAt: string };
export interface GitHubWebhookCryptography { verify(input: { body: Uint8Array; signature: string }): { valid: boolean; bodySha256: string }; }
export interface GitHubWebhookDispatcher { dispatch(event: WebhookInternalEvent): Promise<{ providerReceiptId: string }>; }
export type DeliveryStatus = "pending" | "dispatching" | "dispatched" | "processing" | "failed" | "ignored" | "completed";
export type GitHubWebhookProcessingErrorCode =
  | "github_activity_rate_limited"
  | "github_activity_timeout"
  | "github_activity_unavailable"
  | "github_activity_snapshot_write_failed"
  | "sync_run_concurrency_conflict"
  | "github_webhook_processing_failed";
export interface GitHubWebhookDeliveryRepository {
  register(input: { deliveryId: string; bodySha256: string; eventName: string; action: string | null; installationId: number | null; repositoryId: number | null; repositoryFullName: string | null; internalEventId: string; supported: boolean; receivedAt: string }): Promise<{ outcome: "new" | "duplicate" | "conflict"; status: DeliveryStatus; version: number; projectId: string | null }>;
  claimDispatch(input: { deliveryId: string; expectedVersion: number; claimedAt: string }): Promise<{ claimed: boolean; version: number }>;
  completeDispatch(input: { deliveryId: string; expectedVersion: number; providerReceiptId: string; completedAt: string }): Promise<void>;
  completeInstallation(input: { deliveryId: string; expectedVersion: number; installationState: GitHubWebhookInstallationState; completedAt: string }): Promise<void>;
}
export interface GitHubWebhookDeliveryProcessingRepository {
  claimProcessing(input: { deliveryId: string; syncRunId: string; expectedVersion: number; claimedAt: string }): Promise<{ claimed: boolean; status: DeliveryStatus; version: number }>;
  completeProcessing(input: { deliveryId: string; syncRunId: string; expectedVersion: number; completedAt: string }): Promise<{ outcome: "completed" | "duplicate"; status: "completed"; version: number }>;
  failProcessing(input: { deliveryId: string; syncRunId: string; expectedVersion: number; safeErrorCode: GitHubWebhookProcessingErrorCode; failedAt: string }): Promise<{ outcome: "failed"; status: "failed"; version: number }>;
}

const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const result = (resultValue: WebhookResult["result"], code: string, httpStatus: number): WebhookResult => ({ result: resultValue, code, httpStatus });

export class IngestGitHubWebhook {
  constructor(private readonly dependencies: { cryptography: GitHubWebhookCryptography; repository: GitHubWebhookDeliveryRepository; dispatcher: GitHubWebhookDispatcher; parseJson?: (body: Uint8Array) => unknown }) {}
  async execute(input: { body: Uint8Array; signature: string; deliveryId: string; eventName: string; receivedAt: string }): Promise<WebhookResult> {
    if (input.body.byteLength > githubWebhookMaxBodyBytes) return result("rejected", "github_webhook_body_too_large", 413);
    if (!canonicalTimestamp.test(input.receivedAt)) return result("rejected", "github_webhook_request_invalid", 400);
    try { parseGitHubWebhookHeaders(input); } catch { return result("rejected", "github_webhook_headers_invalid", 400); }
    const verification = this.dependencies.cryptography.verify({ body: input.body, signature: input.signature });
    if (!verification.valid) return result("rejected", "github_webhook_signature_invalid", 401);
    let payload: unknown;
    try { payload = (this.dependencies.parseJson ?? ((body) => JSON.parse(new TextDecoder().decode(body)) as unknown))(input.body); } catch { return result("rejected", "github_webhook_json_invalid", 400); }
    let fact: ReturnType<typeof parseGitHubWebhookEvent>;
    try { fact = parseGitHubWebhookEvent(input.eventName, payload); } catch { return result("rejected", "github_webhook_payload_invalid", 400); }
    const internalEventId = `github-webhook:${input.deliveryId}`;
    let registered: Awaited<ReturnType<GitHubWebhookDeliveryRepository["register"]>>;
    try {
      registered = await this.dependencies.repository.register({ deliveryId: input.deliveryId, bodySha256: verification.bodySha256, eventName: input.eventName, action: fact.action, installationId: fact.installationId, repositoryId: fact.repositoryId, repositoryFullName: fact.repositoryFullName, internalEventId, supported: fact.supported, receivedAt: input.receivedAt });
    } catch { return result("rejected", "github_webhook_repository_unavailable", 503); }
    if (registered.outcome === "conflict") return result("rejected", "github_webhook_delivery_conflict", 409);
    if (registered.status === "ignored") return registered.outcome === "duplicate" ? result("duplicate", "github_webhook_duplicate", 200) : result("ignored", "github_webhook_ignored", 200);
    if (registered.status === "dispatched" || registered.status === "completed") return result("duplicate", "github_webhook_duplicate", 200);
    if (!fact.supported) return result("ignored", "github_webhook_ignored", 200);
    if (fact.kind === "github.installation.v1") {
      try { await this.dependencies.repository.completeInstallation({ deliveryId: input.deliveryId, expectedVersion: registered.version, installationState: fact.installationState!, completedAt: input.receivedAt }); }
      catch { return result("rejected", "github_webhook_repository_unavailable", 503); }
      return result("accepted", "github_webhook_accepted", 202);
    }
    if (!registered.projectId || !fact.repositoryId) return result("ignored", "github_webhook_ignored", 200);
    const claim = await this.dependencies.repository.claimDispatch({ deliveryId: input.deliveryId, expectedVersion: registered.version, claimedAt: input.receivedAt });
    if (!claim.claimed) return result("duplicate", "github_webhook_duplicate", 200);
    const event: WebhookInternalEvent = { version: githubWebhookEventContract, eventId: internalEventId, idempotencyKey: internalEventId, deliveryId: input.deliveryId, kind: fact.kind, action: fact.action, projectId: registered.projectId, installationId: fact.installationId, repositoryId: fact.repositoryId, githubObjectId: fact.githubObjectId, receivedAt: input.receivedAt };
    let receipt: { providerReceiptId: string };
    try { receipt = await this.dependencies.dispatcher.dispatch(event); } catch { return result("rejected", "github_webhook_dispatch_unavailable", 503); }
    try { await this.dependencies.repository.completeDispatch({ deliveryId: input.deliveryId, expectedVersion: claim.version, providerReceiptId: receipt.providerReceiptId, completedAt: input.receivedAt }); }
    catch { return result("rejected", "github_webhook_repository_unavailable", 503); }
    return result("accepted", "github_webhook_accepted", 202);
  }
}
