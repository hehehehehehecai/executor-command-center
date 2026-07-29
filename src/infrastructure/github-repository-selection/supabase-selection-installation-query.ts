import "server-only";

import type {
  CurrentSelectionInstallation,
  CurrentSelectionInstallationQuery,
} from "@/application/github-repository-selection/selected-repository-ports";
import { z } from "zod";

type QueryOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const selectionInstallationSchema = z
  .object({
    id: z.string().uuid(),
    installation_id: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    status: z.enum(["active", "suspended", "revoked"]),
  })
  .strict();

const selectionInstallationResultSchema = z
  .array(selectionInstallationSchema)
  .max(1);

export class SupabaseSelectionInstallationQuery
  implements CurrentSelectionInstallationQuery
{
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: QueryOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async findByUserId(
    userId: string,
  ): Promise<CurrentSelectionInstallation | null> {
    const query = new URLSearchParams({
      select: "id,installation_id,status",
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

      const parsed = selectionInstallationResultSchema.safeParse(
        await response.json(),
      );

      if (!parsed.success) {
        throw parsed.error;
      }

      if (parsed.data.length === 0) {
        return null;
      }

      const installation = parsed.data[0]!;
      return {
        githubInstallationId: installation.id,
        installationId: installation.installation_id,
        status: installation.status,
      };
    } catch (error) {
      throw new Error("github_installation_lookup_failed", {
        cause: error,
      });
    }
  }
}
