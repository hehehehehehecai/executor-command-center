// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const execute = vi.fn();
vi.mock("./webhook-route-dependencies", () => ({ createGitHubWebhookIngestion: () => ({ execute }) }));
import { dynamic, POST } from "./route";
describe("POST /api/github/webhook", () => {
  beforeEach(() => { execute.mockReset(); execute.mockResolvedValue({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 }); });
  it("is dynamic and returns only stable result fields", async () => {
    const response = await POST(new Request("https://example.test/api/github/webhook", { method: "POST", body: '{"x":1}', headers: { "content-type": "application/json", "x-github-delivery": "11111111-1111-4111-8111-111111111111", "x-github-event": "push", "x-hub-signature-256": `sha256=${"a".repeat(64)}` } }));
    expect(dynamic).toBe("force-dynamic"); expect(response.status).toBe(202); expect(await response.json()).toEqual({ result: "accepted", code: "github_webhook_accepted" });
  });
});
