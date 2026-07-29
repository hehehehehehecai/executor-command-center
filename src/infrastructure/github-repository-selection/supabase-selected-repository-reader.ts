import "server-only";

import type { SelectedRepositoryReader } from "@/application/github-repository-selection/selected-repository-ports";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import { z } from "zod";

type SelectionQueryResult = {
  readonly data: unknown;
  readonly error: unknown;
};

type SessionSupabaseClient = {
  from(table: "selected_repositories"): {
    select(columns: string): PromiseLike<SelectionQueryResult>;
  };
};

const selectedRepositoryProjection = [
  "github_repository_id",
  "owner_login",
  "name",
  "full_name",
  "visibility",
  "is_private",
  "is_fork",
  "is_archived",
  "is_disabled",
  "default_branch",
  "selected_at",
  "updated_at",
].join(",");

const selectedRepositoryReadRowSchema = z
  .object({
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
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const selectedRepositoryReadSchema = z.array(
  selectedRepositoryReadRowSchema,
);

function toSelectedRepository(
  row: z.infer<typeof selectedRepositoryReadRowSchema>,
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

function lookupFailure(cause?: unknown): Error {
  return new Error("github_repository_selection_lookup_failed", {
    cause,
  });
}

export class SupabaseSelectedRepositoryReader
  implements SelectedRepositoryReader
{
  constructor(private readonly client: SessionSupabaseClient) {}

  async listOwn(): Promise<readonly SelectedGitHubRepository[]> {
    let result: SelectionQueryResult;

    try {
      result = await this.client
        .from("selected_repositories")
        .select(selectedRepositoryProjection);
    } catch (error) {
      throw lookupFailure(error);
    }

    if (result.error) {
      throw lookupFailure(result.error);
    }

    const parsed = selectedRepositoryReadSchema.safeParse(result.data);

    if (!parsed.success) {
      throw lookupFailure(parsed.error);
    }

    const repositoryIds = new Set<number>();

    for (const row of parsed.data) {
      if (repositoryIds.has(row.github_repository_id)) {
        throw lookupFailure();
      }
      repositoryIds.add(row.github_repository_id);
    }

    return parsed.data.map(toSelectedRepository);
  }
}
