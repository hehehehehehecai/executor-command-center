import { describe, expect, it, vi } from "vitest";

import { SupabaseAuthIdentityAdmin } from "./supabase-auth-identity-admin";

const userId = "b3000000-0000-4000-8000-000000000001";

describe("SupabaseAuthIdentityAdmin", () => {
  it("hard-deletes only the supplied synthetic identity and emits a fingerprint", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    const adapter = new SupabaseAuthIdentityAdmin({ auth: { admin: { deleteUser } } });
    const result = await adapter.deleteIdentity({ userId });
    expect(deleteUser).toHaveBeenCalledWith(userId, false);
    expect(result.outcome).toBe("deleted");
    expect(result.receiptFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain(userId);
  });

  it("maps provider not-found to idempotent already_absent", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: { status: 404, message: "User not found" } });
    const adapter = new SupabaseAuthIdentityAdmin({ auth: { admin: { deleteUser } } });
    await expect(adapter.deleteIdentity({ userId })).resolves.toMatchObject({ outcome: "already_absent" });
  });

  it("fails closed without returning the raw provider response", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: { status: 503, message: "secret provider body" } });
    const adapter = new SupabaseAuthIdentityAdmin({ auth: { admin: { deleteUser } } });
    await expect(adapter.deleteIdentity({ userId })).rejects.toThrow("account_deletion_auth_identity_delete_failed");
  });
});
