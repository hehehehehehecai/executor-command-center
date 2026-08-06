import { describe, expect, it, vi } from "vitest";
import { SupabaseGitHubWebhookDeliveryRepository } from "./supabase-github-webhook-delivery-repository";

const options = (fetcher: typeof fetch) => ({ supabaseUrl: "https://synthetic.invalid", serviceRoleKey: "synthetic-service-role", fetcher });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("github-webhook-delivery.v1 Supabase adapter", () => {
  it("registers only digest and minimal lineage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ outcome: "new", status: "pending", version: 1, project_id: "22222222-2222-4222-8222-222222222222" }));
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));
    await repository.register({ deliveryId: "11111111-1111-4111-8111-111111111111", bodySha256: "b".repeat(64), eventName: "issues", action: "opened", installationId: 81001, repositoryId: 91001, repositoryFullName: "owner/repo", internalEventId: "github-webhook:11111111-1111-4111-8111-111111111111", supported: true, receivedAt: "2026-08-06T04:00:00.000Z" });
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body).not.toHaveProperty("rawBody"); expect(JSON.stringify(body)).not.toMatch(/signature|secret|authorization|cookie/i);
    expect(String(fetcher.mock.calls[0]![0])).toContain("register_github_webhook_delivery");
  });
  it("claims and completes with expected version", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ claimed: true, version: 2 })).mockResolvedValueOnce(response({ completed: true }));
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));
    await expect(repository.claimDispatch({ deliveryId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1, claimedAt: "2026-08-06T04:00:00.000Z" })).resolves.toEqual({ claimed: true, version: 2 });
    await repository.completeDispatch({ deliveryId: "11111111-1111-4111-8111-111111111111", expectedVersion: 2, providerReceiptId: "provider-1", completedAt: "2026-08-06T04:00:01.000Z" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("normalizes provider errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ message: "provider raw synthetic-service-role" }, 500));
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));
    await expect(repository.claimDispatch({ deliveryId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1, claimedAt: "2026-08-06T04:00:00.000Z" })).rejects.toThrow("github_webhook_storage_failed");
  });
});
