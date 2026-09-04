import "server-only";

import type { AuthIdentityAdmin } from "@/application/account-deletion/account-deletion-use-cases";

type AdminClient = {
  auth: { admin: { deleteUser(userId: string, shouldSoftDelete?: boolean): Promise<{ data: unknown; error: { status?: number; message?: string } | null }> } };
};

async function fingerprint(outcome: "deleted" | "already_absent") {
  const bytes = new TextEncoder().encode(`supabase-auth-admin:${outcome}:v1`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export class SupabaseAuthIdentityAdmin implements AuthIdentityAdmin {
  constructor(private readonly client: AdminClient) {}
  async deleteIdentity(input: { userId: string }) {
    const { error } = await this.client.auth.admin.deleteUser(input.userId, false);
    if (error && error.status !== 404) throw new Error("account_deletion_auth_identity_delete_failed");
    const outcome = error?.status === 404 ? "already_absent" as const : "deleted" as const;
    return { outcome, receiptFingerprint: await fingerprint(outcome) };
  }
}
