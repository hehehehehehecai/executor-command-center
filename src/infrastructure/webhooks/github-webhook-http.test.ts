import { describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookRequest } from "./github-webhook-http";
const bytes = new TextEncoder().encode('{"ok":true}');
describe("GitHub webhook HTTP boundary", () => {
  it("passes exact bytes and headers and returns stable result", async () => {
    const execute = vi.fn().mockResolvedValue({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 });
    const response = await handleGitHubWebhookRequest(new Request("https://example.test/api/github/webhook", { method: "POST", body: bytes, headers: { "x-github-delivery": "11111111-1111-4111-8111-111111111111", "x-github-event": "push", "x-hub-signature-256": `sha256=${"a".repeat(64)}` } }), { execute, now: () => "2026-08-06T04:00:00.000Z" });
    expect(Array.from(execute.mock.calls[0]![0].body)).toEqual(Array.from(bytes)); expect(response.status).toBe(202); expect(await response.json()).toEqual({ result: "accepted", code: "github_webhook_accepted" });
  });
  it("does not wait for background business, only queue receipt", async () => { const execute = vi.fn().mockResolvedValue({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 }); const response = await handleGitHubWebhookRequest(new Request("https://example.test", { method: "POST", body: bytes }), { execute, now: () => "2026-08-06T04:00:00.000Z" }); expect(response).toBeInstanceOf(Response); });
});
