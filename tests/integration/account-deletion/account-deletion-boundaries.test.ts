import { describe, expect, it, vi } from "vitest";

import { ExecuteDueAccountDeletion } from "@/application/account-deletion/account-deletion-use-cases";
import { SupabaseAuthIdentityAdmin } from "@/infrastructure/account-deletion/supabase-auth-identity-admin";

describe("account deletion business/Auth boundary", () => {
  it("does not call Auth Admin until the business cleanup receipt succeeds", async () => {
    const deleteUser = vi.fn();
    const authAdmin = new SupabaseAuthIdentityAdmin({ auth: { admin: { deleteUser } } });
    const complete = vi.fn().mockResolvedValue({ status: "deletion_failed" });
    const useCase = new ExecuteDueAccountDeletion({
      repository: {
        claim: vi.fn().mockResolvedValue({ outcome: "claimed", operationId: "b3800000-0000-4000-8000-000000000001", userId: "b3000000-0000-4000-8000-000000000001", leaseToken: "b3900000-0000-4000-8000-000000000001" }),
        cleanupBusinessData: vi.fn().mockRejectedValue(new Error("rollback")), complete,
      },
      authAdmin,
    });
    await useCase.execute({ operationId: "b3800000-0000-4000-8000-000000000001" });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ outcome: "business_failed" }));
  });
});
