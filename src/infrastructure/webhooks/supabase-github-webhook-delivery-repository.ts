import "server-only";
import type { GitHubWebhookDeliveryRepository } from "@/application/webhooks/ingest-github-webhook";

export const githubWebhookDeliveryPersistenceContract = "github-webhook-delivery.v1" as const;
type Options = { supabaseUrl: string; serviceRoleKey: string; fetcher?: typeof fetch };
export class SupabaseGitHubWebhookDeliveryRepository implements GitHubWebhookDeliveryRepository {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: Options) { this.fetcher = options.fetcher ?? fetch; }
  private async rpc(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.options.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: this.options.serviceRoleKey, authorization: `Bearer ${this.options.serviceRoleKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("github_webhook_storage_failed");
    const value: unknown = await response.json(); if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("github_webhook_storage_failed"); return value as Record<string, unknown>;
  }
  async register(input: Parameters<GitHubWebhookDeliveryRepository["register"]>[0]) {
    const value = await this.rpc("register_github_webhook_delivery", { p_delivery_id: input.deliveryId, p_body_sha256: input.bodySha256, p_event_name: input.eventName, p_action: input.action, p_installation_id: input.installationId, p_repository_id: input.repositoryId, p_repository_full_name: input.repositoryFullName, p_internal_event_id: input.internalEventId, p_supported: input.supported, p_received_at: input.receivedAt });
    if (!["new", "duplicate", "conflict"].includes(String(value.outcome)) || !["pending", "dispatching", "dispatched", "ignored", "completed"].includes(String(value.status)) || !Number.isSafeInteger(value.version) || (value.project_id !== null && typeof value.project_id !== "string")) throw new Error("github_webhook_storage_failed");
    return { outcome: value.outcome as "new" | "duplicate" | "conflict", status: value.status as "pending", version: Number(value.version), projectId: value.project_id as string | null };
  }
  async claimDispatch(input: Parameters<GitHubWebhookDeliveryRepository["claimDispatch"]>[0]) { const value = await this.rpc("claim_github_webhook_dispatch", { p_delivery_id: input.deliveryId, p_expected_version: input.expectedVersion, p_claimed_at: input.claimedAt }); if (typeof value.claimed !== "boolean" || !Number.isSafeInteger(value.version)) throw new Error("github_webhook_storage_failed"); return { claimed: value.claimed, version: Number(value.version) }; }
  async completeDispatch(input: Parameters<GitHubWebhookDeliveryRepository["completeDispatch"]>[0]) { await this.rpc("complete_github_webhook_dispatch", { p_delivery_id: input.deliveryId, p_expected_version: input.expectedVersion, p_provider_receipt_id: input.providerReceiptId, p_completed_at: input.completedAt }); }
  async completeInstallation(input: Parameters<GitHubWebhookDeliveryRepository["completeInstallation"]>[0]) { await this.rpc("complete_github_webhook_installation", { p_delivery_id: input.deliveryId, p_expected_version: input.expectedVersion, p_installation_state: input.installationState, p_completed_at: input.completedAt }); }
}
