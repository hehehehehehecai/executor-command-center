import { githubWebhookEventContract, parseGitHubWebhookEvent, parseGitHubWebhookHeaders, type GitHubWebhookInstallationState } from "@/domain/webhooks/github-webhook";

export const githubWebhookIngestionContract = "github-webhook-ingestion.v1" as const;
export const githubWebhookDispatcherContract = "github-webhook-dispatcher.v1" as const;
export const githubWebhookDeliveryProcessingContract = "github-webhook-delivery-processing.v1" as const;
export const githubWebhookMaxBodyBytes = 1_048_576;

export type WebhookResult = { readonly result: "accepted" | "duplicate" | "ignored" | "rejected"; readonly code: string; readonly httpStatus: number };
export type WebhookInternalEvent = { readonly version: typeof githubWebhookEventContract; readonly eventId: string; readonly idempotencyKey: string; readonly deliveryId: string; readonly bodySha256?: string; readonly eventName?: string; readonly kind: string; readonly action: string | null; readonly projectId: string; readonly installationId: number; readonly repositoryId: number; readonly repositoryFullName?: string; readonly githubObjectId: string; readonly receivedAt: string; readonly processingVersion?: number };
export type VerifiedWebhookInternalEvent = WebhookInternalEvent & Required<Pick<WebhookInternalEvent, "bodySha256" | "eventName" | "repositoryFullName" | "processingVersion">>;
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
const sha256 = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safe = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,255}$/;
const internalEventKeys = ["version", "eventId", "idempotencyKey", "deliveryId", "bodySha256", "eventName", "kind", "action", "projectId", "installationId", "repositoryId", "repositoryFullName", "githubObjectId", "receivedAt", "processingVersion"].sort();
const result = (resultValue: WebhookResult["result"], code: string, httpStatus: number): WebhookResult => ({ result: resultValue, code, httpStatus });

export function parseWebhookInternalEvent(input: unknown): VerifiedWebhookInternalEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("github_webhook_event_invalid");
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.length !== internalEventKeys.length || keys.some((key, index) => key !== internalEventKeys[index])) throw new Error("github_webhook_event_invalid");
  if (value.version !== githubWebhookEventContract
    || typeof value.eventId !== "string" || !safe.test(value.eventId)
    || value.idempotencyKey !== value.eventId
    || typeof value.deliveryId !== "string" || !safe.test(value.deliveryId)
    || typeof value.bodySha256 !== "string" || !sha256.test(value.bodySha256)
    || typeof value.eventName !== "string" || !safe.test(value.eventName)
    || typeof value.kind !== "string" || !safe.test(value.kind)
    || (value.action !== null && (typeof value.action !== "string" || !safe.test(value.action)))
    || typeof value.projectId !== "string" || !uuid.test(value.projectId)
    || !Number.isSafeInteger(value.installationId) || Number(value.installationId) <= 0
    || !Number.isSafeInteger(value.repositoryId) || Number(value.repositoryId) <= 0
    || typeof value.repositoryFullName !== "string" || !safe.test(value.repositoryFullName) || !value.repositoryFullName.includes("/")
    || typeof value.githubObjectId !== "string" || !safe.test(value.githubObjectId)
    || typeof value.receivedAt !== "string" || !canonicalTimestamp.test(value.receivedAt)
    || !Number.isSafeInteger(value.processingVersion) || Number(value.processingVersion) <= 0
  ) throw new Error("github_webhook_event_invalid");
  return value as VerifiedWebhookInternalEvent;
}

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
    const event: WebhookInternalEvent = { version: githubWebhookEventContract, eventId: internalEventId, idempotencyKey: internalEventId, deliveryId: input.deliveryId, bodySha256: verification.bodySha256, eventName: input.eventName, kind: fact.kind, action: fact.action, projectId: registered.projectId, installationId: fact.installationId, repositoryId: fact.repositoryId, repositoryFullName: fact.repositoryFullName!, githubObjectId: fact.githubObjectId, receivedAt: input.receivedAt, processingVersion: claim.version };
    let receipt: { providerReceiptId: string };
    try { receipt = await this.dependencies.dispatcher.dispatch(event); } catch { return result("rejected", "github_webhook_dispatch_unavailable", 503); }
    try { await this.dependencies.repository.completeDispatch({ deliveryId: input.deliveryId, expectedVersion: claim.version, providerReceiptId: receipt.providerReceiptId, completedAt: input.receivedAt }); }
    catch { return result("rejected", "github_webhook_repository_unavailable", 503); }
    return result("accepted", "github_webhook_accepted", 202);
  }
}
