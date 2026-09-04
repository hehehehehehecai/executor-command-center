import { describe, expect, it, vi } from "vitest";
import {
  githubWebhookDeliveryProcessingContract,
  SupabaseGitHubWebhookDeliveryRepository,
} from "./supabase-github-webhook-delivery-repository";

const options = (fetcher: typeof fetch) => ({ supabaseUrl: "https://synthetic.invalid", serviceRoleKey: "synthetic-service-role", fetcher });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("github-webhook-delivery.v1 Supabase adapter", () => {
  it("binds the processing adapter to github-webhook-delivery-processing.v1", () => {
    expect(githubWebhookDeliveryProcessingContract).toBe(
      "github-webhook-delivery-processing.v1",
    );
  });

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

  it("claims, completes and fails ordinary processing through versioned RPCs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ claimed: true, status: "processing", version: 4 }))
      .mockResolvedValueOnce(response({ outcome: "completed", status: "completed", version: 5 }))
      .mockResolvedValueOnce(response({ outcome: "failed", status: "failed", version: 6 }));
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));
    const deliveryId = "11111111-1111-4111-8111-111111111111";
    const syncRunId = "22222222-2222-4222-8222-222222222222";

    await expect(repository.claimProcessing({
      deliveryId,
      syncRunId,
      expectedVersion: 3,
      claimedAt: "2026-08-07T02:00:03.000Z",
    })).resolves.toEqual({ claimed: true, status: "processing", version: 4 });
    await expect(repository.completeProcessing({
      deliveryId,
      syncRunId,
      expectedVersion: 4,
      completedAt: "2026-08-07T02:00:04.000Z",
    })).resolves.toEqual({ outcome: "completed", status: "completed", version: 5 });
    await expect(repository.failProcessing({
      deliveryId,
      syncRunId,
      expectedVersion: 5,
      safeErrorCode: "github_activity_timeout",
      failedAt: "2026-08-07T02:00:05.000Z",
    })).resolves.toEqual({ outcome: "failed", status: "failed", version: 6 });

    const calls = fetcher.mock.calls.map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    }));
    expect(calls).toEqual([
      {
        url: "https://synthetic.invalid/rest/v1/rpc/claim_github_webhook_processing",
        body: {
          p_delivery_id: deliveryId,
          p_sync_run_id: syncRunId,
          p_expected_version: 3,
          p_claimed_at: "2026-08-07T02:00:03.000Z",
        },
      },
      {
        url: "https://synthetic.invalid/rest/v1/rpc/complete_github_webhook_processing",
        body: {
          p_delivery_id: deliveryId,
          p_sync_run_id: syncRunId,
          p_expected_version: 4,
          p_completed_at: "2026-08-07T02:00:04.000Z",
        },
      },
      {
        url: "https://synthetic.invalid/rest/v1/rpc/fail_github_webhook_processing",
        body: {
          p_delivery_id: deliveryId,
          p_sync_run_id: syncRunId,
          p_expected_version: 5,
          p_safe_error_code: "github_activity_timeout",
          p_failed_at: "2026-08-07T02:00:05.000Z",
        },
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(
      /raw_payload|raw_body|signature|secret|authorization|cookie|error_summary|cause/i,
    );
  });

  it("maps duplicate processing completion without inventing a second result", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ outcome: "duplicate", status: "completed", version: 5 }));
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));

    await expect(repository.completeProcessing({
      deliveryId: "11111111-1111-4111-8111-111111111111",
      syncRunId: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 4,
      completedAt: "2026-08-07T02:00:05.000Z",
    })).resolves.toEqual({ outcome: "duplicate", status: "completed", version: 5 });
  });

  it("rejects malformed processing receipts with a stable safe error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ claimed: "yes", status: "processing", version: "4", raw: "provider body" }),
    );
    const repository = new SupabaseGitHubWebhookDeliveryRepository(options(fetcher));

    await expect(repository.claimProcessing({
      deliveryId: "11111111-1111-4111-8111-111111111111",
      syncRunId: "22222222-2222-4222-8222-222222222222",
      expectedVersion: 3,
      claimedAt: "2026-08-07T02:00:03.000Z",
    })).rejects.toThrow("github_webhook_storage_failed");
  });
});
