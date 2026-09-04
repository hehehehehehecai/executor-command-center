import type { Inngest } from "inngest";
import type { GitHubWebhookDispatcher, WebhookInternalEvent } from "@/application/webhooks/ingest-github-webhook";
const providerId = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;
export function mapGitHubWebhookToInngestEvent(event: WebhookInternalEvent) { return { id: event.eventId, name: "executor/github.webhook.received.v1" as const, data: event }; }
export class InngestGitHubWebhookDispatcher implements GitHubWebhookDispatcher {
  constructor(private readonly client: Pick<Inngest, "send">) {}
  async dispatch(event: WebhookInternalEvent) { let receipt: unknown; try { receipt = await this.client.send(mapGitHubWebhookToInngestEvent(event)); } catch { throw new Error("github_webhook_dispatch_failed"); } const ids = typeof receipt === "object" && receipt !== null && "ids" in receipt ? (receipt as { ids?: unknown }).ids : null; if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string" || !providerId.test(ids[0])) throw new Error("github_webhook_dispatch_receipt_invalid"); return { providerReceiptId: ids[0] }; }
}
