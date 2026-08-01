import "server-only";

import type { SelectedRepositoryWriter } from "@/application/github-repository-selection/selected-repository-ports";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import { z } from "zod";

type WriterOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const selectedRepositoryRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    github_installation_id: z.string().uuid(),
    github_repository_id: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    owner_login: z.string().min(1),
    name: z.string().min(1),
    full_name: z.string().min(1),
    visibility: z.enum(["public", "private", "internal"]),
    is_private: z.boolean(),
    is_fork: z.boolean(),
    is_archived: z.boolean(),
    is_disabled: z.boolean(),
    default_branch: z.string().min(1),
    selected_at: z.iso.datetime({ offset: true }),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const allowedDatabaseFailures = new Set([
  "github_repository_selection_installation_not_found",
  "github_repository_selection_installation_wrong_user",
  "github_repository_selection_installation_not_active",
  "github_repository_selection_installation_mismatch",
  "github_repository_selection_storage_failed",
  "github_repository_selection_active_project_conflict",
]);

function responseMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return null;
}

function storageFailure(cause?: unknown): Error {
  return new Error("github_repository_selection_storage_failed", {
    cause,
  });
}

function toSelectedRepository(
  row: z.infer<typeof selectedRepositoryRowSchema>,
): SelectedGitHubRepository {
  return {
    repositoryId: row.github_repository_id,
    ownerLogin: row.owner_login,
    name: row.name,
    fullName: row.full_name,
    visibility: row.visibility,
    isPrivate: row.is_private,
    isFork: row.is_fork,
    isArchived: row.is_archived,
    isDisabled: row.is_disabled,
    defaultBranch: row.default_branch,
    selectedAt: row.selected_at,
    updatedAt: row.updated_at,
    calibrationStatus: "pending",
  };
}

export class SupabaseSelectedRepositoryWriter
  implements SelectedRepositoryWriter
{
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: WriterOptions) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers() {
    return {
      apikey: this.options.serviceRoleKey,
      authorization: `Bearer ${this.options.serviceRoleKey}`,
      "content-type": "application/json",
    };
  }

  private async postRpc(
    name: string,
    body: Readonly<Record<string, unknown>>,
  ): Promise<Response> {
    try {
      return await this.fetcher(
        new URL(`rpc/${name}`, this.baseUrl).toString(),
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        },
      );
    } catch (error) {
      throw storageFailure(error);
    }
  }

  async ensureSelected(
    input: Parameters<SelectedRepositoryWriter["ensureSelected"]>[0],
  ): Promise<SelectedGitHubRepository> {
    const response = await this.postRpc(
      "ensure_selected_github_repository",
      {
        p_user_id: input.userId,
        p_github_installation_id: input.githubInstallationId,
        p_github_repository_id: input.repository.id,
        p_owner_login: input.repository.ownerLogin,
        p_name: input.repository.name,
        p_full_name: input.repository.fullName,
        p_visibility: input.repository.visibility,
        p_is_private: input.repository.isPrivate,
        p_is_fork: input.repository.isFork,
        p_is_archived: input.repository.isArchived,
        p_is_disabled: input.repository.isDisabled,
        p_default_branch: input.repository.defaultBranch,
      },
    );

    let payload: unknown;

    try {
      payload = await response.json();
    } catch (error) {
      throw storageFailure(error);
    }

    if (!response.ok) {
      const message = responseMessage(payload);

      if (message && allowedDatabaseFailures.has(message)) {
        throw new Error(message);
      }

      throw storageFailure();
    }

    const parsed = selectedRepositoryRowSchema.safeParse(payload);

    if (!parsed.success) {
      throw storageFailure(parsed.error);
    }

    return toSelectedRepository(parsed.data);
  }

  async removeSelection(
    input: Parameters<SelectedRepositoryWriter["removeSelection"]>[0],
  ): Promise<void> {
    const response = await this.postRpc(
      "remove_selected_github_repository",
      {
        p_user_id: input.userId,
        p_github_repository_id: input.repositoryId,
      },
    );

    if (!response.ok) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw storageFailure(error);
      }
      const message = responseMessage(payload);
      if (
        message === "github_repository_selection_active_project_conflict"
      ) {
        throw new Error(message);
      }
      throw storageFailure();
    }
  }
}
