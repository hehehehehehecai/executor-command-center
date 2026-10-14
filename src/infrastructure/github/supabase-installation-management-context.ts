import "server-only";
import { z } from "zod";
import type { InstallationManagementContext, InstallationManagementContextReader } from "@/application/github-installation/load-installation-management";

type Result = { data: unknown; error: unknown };
export interface InstallationManagementSessionClient {
  from(table: string): { select(columns: string): { eq(column: string, value: string): PromiseLike<Result> } };
}
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identitySchema = z.array(z.object({ user_id: z.string().uuid(), github_user_id: id })).length(1);
const installationSchema = z.array(z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), installation_id: id, github_account_id: id,
  status: z.enum(["active", "suspended", "revoked"]), last_verified_at: z.string().min(1),
  suspended_at: z.string().nullable(), revoked_at: z.string().nullable(),
})).max(1);

export class SupabaseInstallationManagementContext implements InstallationManagementContextReader {
  constructor(private readonly client: InstallationManagementSessionClient) {}
  async read(userId: string): Promise<InstallationManagementContext> {
    try {
      if (!z.string().uuid().safeParse(userId).success) throw new Error();
      const identities = await this.client.from("github_identities").select("user_id,github_user_id").eq("user_id", userId);
      if (identities.error) throw new Error();
      const identity = identitySchema.parse(identities.data)[0]!;
      if (identity.user_id !== userId) throw new Error();
      const installations = await this.client.from("github_installations").select("id,user_id,installation_id,github_account_id,status,last_verified_at,suspended_at,revoked_at").eq("user_id", userId);
      if (installations.error) throw new Error();
      const installation = installationSchema.parse(installations.data)[0];
      if (!installation) return { accountId: identity.github_user_id, installation: null };
      if (installation.user_id !== userId || installation.github_account_id !== identity.github_user_id) throw new Error();
      return { accountId: identity.github_user_id, installation: { installationId: installation.installation_id, status: installation.status, revision: JSON.stringify(installation) } };
    } catch { throw new Error("installation_context_read_failed"); }
  }
}
