import { describe, expect, it, vi } from "vitest";

import { SupabaseReconciliationStore } from "./supabase-reconciliation-store";

const options = (fetcher: typeof fetch) => ({
  supabaseUrl: "https://synthetic.invalid",
  serviceRoleKey: "synthetic-service-role",
  fetcher,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

describe("sync-request-coalescing.v1 Supabase adapter", () => {
  it("maps eligible projects and six fixed digests", async () => {
    const digest = "a".repeat(64);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{
      project_id: "11111111-1111-4111-8111-111111111111",
      selected_repository_id: "22222222-2222-4222-8222-222222222222",
      installation_id: 81001,
      installation_status: "active",
      repository_id: 91001,
      repository_owner: "owner",
      repository_name: "repo",
      repository_full_name: "owner/repo",
      mapping_complete: true,
      local_facts: {
        repository: digest, commit: digest, issue: digest,
        pull_request: digest, release: digest, workflow_run: digest,
      },
    }]));
    const store = new SupabaseReconciliationStore(options(fetcher));
    await expect(store.listEligible({ snapshotSince: "2026-05-09T00:00:00.000Z" }))
      .resolves.toMatchObject([{ projectId: "11111111-1111-4111-8111-111111111111", installationStatus: "active", localFacts: { issue: digest } }]);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({
      p_snapshot_since: "2026-05-09T00:00:00.000Z",
    });
  });

  it("maps request, claim and completion without exposing provider bodies", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        outcome: "new", project_id: "11111111-1111-4111-8111-111111111111",
        sync_run_id: "33333333-3333-4333-8333-333333333333",
        sync_run_status: "queued", dispatch_status: "pending", dispatch_version: 1,
      }))
      .mockResolvedValueOnce(response({ claimed: true, version: 2 }))
      .mockResolvedValueOnce(response({ completed: true, version: 3 }));
    const store = new SupabaseReconciliationStore(options(fetcher));
    await expect(store.request({
      projectId: "11111111-1111-4111-8111-111111111111",
      triggerSource: "manual",
      requestIdentity: "manual:request-001",
      actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requestedAt: "2026-08-06T03:00:00.000Z",
    })).resolves.toMatchObject({ outcome: "new", dispatchState: "pending", dispatchVersion: 1 });
    await expect(store.claimDispatch({
      projectId: "11111111-1111-4111-8111-111111111111",
      syncRunId: "33333333-3333-4333-8333-333333333333",
      expectedVersion: 1,
      claimedAt: "2026-08-06T03:00:00.000Z",
    })).resolves.toEqual({ claimed: true, version: 2 });
    await expect(store.completeDispatch({
      projectId: "11111111-1111-4111-8111-111111111111",
      syncRunId: "33333333-3333-4333-8333-333333333333",
      expectedVersion: 2,
      providerJobId: "provider-phase7-001",
      completedAt: "2026-08-06T03:00:01.000Z",
    })).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("normalizes storage errors and never leaks a provider body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      message: "raw provider synthetic-service-role",
    }, 500));
    const store = new SupabaseReconciliationStore(options(fetcher));
    await expect(store.request({
      projectId: "11111111-1111-4111-8111-111111111111",
      triggerSource: "manual",
      requestIdentity: "manual:request-001",
      actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requestedAt: "2026-08-06T03:00:00.000Z",
    })).rejects.toThrow("reconciliation_storage_failed");
  });
});
