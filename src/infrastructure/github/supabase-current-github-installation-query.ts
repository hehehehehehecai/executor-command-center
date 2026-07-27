import "server-only";

import type {
  CurrentGitHubInstallation,
  CurrentGitHubInstallationQuery,
} from "@/domain/github-repository/authorized-github-repository";
import { z } from "zod";

type QueryOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const installationSchema = z.object({
  installation_id: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  repository_selection: z.enum(["all", "selected"]),
  status: z.enum(["active", "suspended", "revoked"]),
});

export class SupabaseCurrentGitHubInstallationQuery
  implements CurrentGitHubInstallationQuery
{
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: QueryOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async findByUserId(
    userId: string,
  ): Promise<CurrentGitHubInstallation | null> {
    const query = new URLSearchParams({
      select: "installation_id,repository_selection,status",
      user_id: `eq.${userId}`,
      limit: "2",
    });
    const url =
      `${this.options.supabaseUrl.replace(/\/+$/, "")}` +
      `/rest/v1/github_installations?${query.toString()}`;

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: {
          apikey: this.options.serviceRoleKey,
          authorization: `Bearer ${this.options.serviceRoleKey}`,
        },
      });

      if (!response.ok) {
        throw new Error("github_installation_lookup_failed");
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload) || payload.length > 1) {
        throw new Error("github_installation_lookup_failed");
      }

      if (payload.length === 0) {
        return null;
      }

      const parsed = installationSchema.safeParse(payload[0]);

      if (!parsed.success) {
        throw new Error("github_installation_lookup_failed");
      }

      return {
        installationId: parsed.data.installation_id,
        repositorySelection: parsed.data.repository_selection,
        status: parsed.data.status,
      };
    } catch {
      throw new Error("github_installation_lookup_failed");
    }
  }
}
