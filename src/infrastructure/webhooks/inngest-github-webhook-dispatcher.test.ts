import { describe, expect, it, vi } from "vitest";
import { InngestGitHubWebhookDispatcher, mapGitHubWebhookToInngestEvent } from "./inngest-github-webhook-dispatcher";
const event = { version: "github-webhook-event.v1", eventId: "github-webhook:11111111-1111-4111-8111-111111111111", idempotencyKey: "github-webhook:11111111-1111-4111-8111-111111111111", deliveryId: "11111111-1111-4111-8111-111111111111", kind: "github.issue.v1", action: "opened", projectId: "22222222-2222-4222-8222-222222222222", installationId: 81001, repositoryId: 91001, githubObjectId: "101", receivedAt: "2026-08-06T04:00:00.000Z" } as const;
describe("github-webhook-dispatcher.v1", () => {
  it("maps stable provider identity", () => expect(mapGitHubWebhookToInngestEvent(event)).toEqual({ id: event.eventId, name: "executor/github.webhook.received.v1", data: event }));
  it("maps one receipt", async () => { const send = vi.fn().mockResolvedValue({ ids: ["provider-1"] }); await expect(new InngestGitHubWebhookDispatcher({ send } as never).dispatch(event)).resolves.toEqual({ providerReceiptId: "provider-1" }); });
  it("rejects invalid receipt and redacts provider error", async () => { const send = vi.fn().mockResolvedValue({ ids: [] }); await expect(new InngestGitHubWebhookDispatcher({ send } as never).dispatch(event)).rejects.toThrow("github_webhook_dispatch_receipt_invalid"); });
});
