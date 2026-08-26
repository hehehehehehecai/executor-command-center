import { describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookRequest } from "./github-webhook-http";
const bytes = new TextEncoder().encode('{"ok":true}');
describe("GitHub webhook HTTP boundary", () => {
  it("passes exact bytes and headers and returns stable result", async () => {
    const execute = vi.fn().mockResolvedValue({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 });
    const response = await handleGitHubWebhookRequest(new Request("https://example.test/api/github/webhook", { method: "POST", body: bytes, headers: { "content-type": "application/json", "x-github-delivery": "11111111-1111-4111-8111-111111111111", "x-github-event": "push", "x-hub-signature-256": `sha256=${"a".repeat(64)}` } }), { execute, now: () => "2026-08-06T04:00:00.000Z" });
    expect(Array.from(execute.mock.calls[0]![0].body)).toEqual(Array.from(bytes)); expect(response.status).toBe(202); expect(await response.json()).toEqual({ result: "accepted", code: "github_webhook_accepted" });
  });
  it("does not wait for background business, only queue receipt", async () => { const execute = vi.fn().mockResolvedValue({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 }); const response = await handleGitHubWebhookRequest(new Request("https://example.test", { method: "POST", body: bytes }), { execute, now: () => "2026-08-06T04:00:00.000Z" }); expect(response).toBeInstanceOf(Response); });

  it("rejects a declared oversized body before consuming the stream or calling ingestion", async () => {
    const execute = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(524_288));
        if (pulls === 3) controller.close();
      },
    });
    const response = await handleGitHubWebhookRequest(new Request("https://example.test/api/github/webhook", {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        "content-length": "1048577",
        "content-type": "application/json",
        "x-github-delivery": "11111111-1111-4111-8111-111111111111",
        "x-github-event": "push",
        "x-hub-signature-256": `sha256=${"a".repeat(64)}`,
      },
    } as RequestInit), { execute, now: () => "2026-08-06T04:00:00.000Z" });

    expect(response.status).toBe(413);
    expect(pulls).toBeLessThanOrEqual(1);
    expect(execute).not.toHaveBeenCalled();
  });
});
