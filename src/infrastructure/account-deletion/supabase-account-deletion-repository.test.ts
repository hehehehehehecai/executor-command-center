import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SupabaseAccountDeletionRepository } from "./supabase-account-deletion-repository";

const options = { supabaseUrl: "https://fixture.supabase.test", serviceRoleKey: "fixture-service-role" };

describe("SupabaseAccountDeletionRepository", () => {
  it("uses only narrow RPCs and never passes arbitrary table or SQL input", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "active", outcome: "observed", safelyRetryable: false }), { status: 200 }));
    const repository = new SupabaseAccountDeletionRepository({ ...options, fetcher });
    await repository.getStatus({ actorUserId: "b3000000-0000-4000-8000-000000000001" });
    expect(fetcher).toHaveBeenCalledWith("https://fixture.supabase.test/rest/v1/rpc/get_account_deletion_status", expect.objectContaining({ method: "POST" }));
    const serialized = JSON.stringify(fetcher.mock.calls);
    expect(serialized).not.toMatch(/select\s|delete\s+from|access_token|refresh_token|email/i);
  });

  it("preserves stable database errors and redacts unknown provider payloads", async () => {
    const stable = new SupabaseAccountDeletionRepository({ ...options, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "account_deletion_cancel_window_closed" }), { status: 400 })) });
    await expect(stable.cancel({ actorUserId: "b3000000-0000-4000-8000-000000000001", operationId: "b3800000-0000-4000-8000-000000000001" })).rejects.toThrow("account_deletion_cancel_window_closed");
    const unknown = new SupabaseAccountDeletionRepository({ ...options, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "secret SQL provider payload" }), { status: 500 })) });
    await expect(unknown.claim({ operationId: "b3800000-0000-4000-8000-000000000001" })).rejects.toThrow("account_deletion_storage_failed");
  });

  it("uses only fixed recovery RPCs and binds generation plus dispatch lease token", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ outcome: "claimed", operations: [] }), { status: 200 },
    ));
    const repository = new SupabaseAccountDeletionRepository({ ...options, fetcher });
    await repository.markRetryExhausted({ operationId: "b3800000-0000-4000-8000-000000000001", generation: 2 });
    await repository.claimRecoveries({ limit: 25 });
    await repository.completeRecoveryDispatch({
      operationId: "b3800000-0000-4000-8000-000000000001",
      generation: 3,
      dispatchToken: "b3900000-0000-4000-8000-000000000001",
      outcome: "dispatched",
      errorCode: null,
    });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "https://fixture.supabase.test/rest/v1/rpc/mark_account_deletion_retry_exhausted",
      "https://fixture.supabase.test/rest/v1/rpc/claim_account_deletion_recoveries",
      "https://fixture.supabase.test/rest/v1/rpc/complete_account_deletion_recovery_dispatch",
    ]);
    expect(JSON.parse((fetcher.mock.calls[2]?.[1] as RequestInit).body as string)).toEqual({
      p_operation_id: "b3800000-0000-4000-8000-000000000001",
      p_generation: 3,
      p_dispatch_token: "b3900000-0000-4000-8000-000000000001",
      p_outcome: "dispatched",
      p_error_code: null,
    });
  });
});
