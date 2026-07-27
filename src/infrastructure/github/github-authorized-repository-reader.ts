import "server-only";

import type { GitHubRepositorySelection } from "@/domain/github-installation/github-app-installation";
import type {
  AuthorizedGitHubRepository,
  AuthorizedRepositoryList,
} from "@/domain/github-repository/authorized-github-repository";
import { z } from "zod";

export const repositoryListContract =
  "github-authorized-repository-list.v1" as const;
export const repositoryPageSize = 100;
export const maximumRepositoryPages = 100;
export const maximumRepositories = 10_000;

type ReaderOptions = {
  readonly restApiVersion: string;
  readonly clock: { now(): Date };
  readonly fetcher?: typeof fetch;
  readonly timeoutMilliseconds?: number;
};

const repositorySchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1),
  full_name: z.string().trim().min(1),
  owner: z.object({
    login: z.string().trim().min(1),
  }),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  visibility: z.enum(["public", "private", "internal"]),
  default_branch: z.string().trim().min(1),
});

const pageSchema = z.object({
  total_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  repositories: z.array(repositorySchema),
});

const repositoryFailureCodes = new Set([
  "github_repository_list_unauthorized",
  "github_repository_list_forbidden",
  "github_repository_list_rate_limited",
  "github_repository_list_timeout",
  "github_repository_list_invalid_response",
  "github_repository_list_unavailable",
  "github_repository_pagination_inconsistent",
  "github_repository_pagination_limit_exceeded",
]);

function errorForResponse(response: Response) {
  if (response.status === 401) {
    return "github_repository_list_unauthorized";
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  ) {
    return "github_repository_list_rate_limited";
  }
  if (response.status === 403) {
    return "github_repository_list_forbidden";
  }
  return "github_repository_list_unavailable";
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function toRepository(
  input: z.infer<typeof repositorySchema>,
): AuthorizedGitHubRepository {
  return {
    id: input.id,
    name: input.name,
    fullName: input.full_name,
    ownerLogin: input.owner.login,
    isPrivate: input.private,
    isFork: input.fork,
    isArchived: input.archived,
    isDisabled: input.disabled,
    visibility: input.visibility,
    defaultBranch: input.default_branch,
  };
}

export class GitHubAuthorizedRepositoryReader {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: ReaderOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  }

  private async readPage(
    token: string,
    page: number,
    operationSignal?: AbortSignal,
  ) {
    const controller = new AbortController();
    const abortOperation = () => controller.abort();
    operationSignal?.addEventListener("abort", abortOperation, {
      once: true,
    });
    if (operationSignal?.aborted) controller.abort();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );

    try {
      const response = await this.fetcher(
        `https://api.github.com/installation/repositories?per_page=${repositoryPageSize}&page=${page}`,
        {
          method: "GET",
          redirect: "error",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "x-github-api-version": this.options.restApiVersion,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(errorForResponse(response));
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch (error) {
        if (isAbort(error, controller.signal)) throw error;
        throw new Error("github_repository_list_invalid_response");
      }

      const parsed = pageSchema.safeParse(payload);

      if (
        !parsed.success ||
        parsed.data.repositories.length > repositoryPageSize
      ) {
        throw new Error("github_repository_list_invalid_response");
      }

      return parsed.data;
    } catch (error) {
      if (isAbort(error, controller.signal)) {
        throw new Error("github_repository_list_timeout");
      }
      if (
        error instanceof Error &&
        repositoryFailureCodes.has(error.message)
      ) {
        throw error;
      }
      throw new Error("github_repository_list_unavailable");
    } finally {
      clearTimeout(timeout);
      operationSignal?.removeEventListener("abort", abortOperation);
    }
  }

  async listAll(
    token: string,
    repositorySelection: GitHubRepositorySelection,
    operationSignal?: AbortSignal,
  ): Promise<AuthorizedRepositoryList> {
    const firstPage = await this.readPage(token, 1, operationSignal);
    const totalCount = firstPage.total_count;
    const expectedPages = Math.ceil(totalCount / repositoryPageSize);

    if (
      expectedPages > maximumRepositoryPages ||
      totalCount > maximumRepositories
    ) {
      throw new Error("github_repository_pagination_limit_exceeded");
    }

    const repositories = [...firstPage.repositories];

    for (let page = 2; page <= expectedPages; page += 1) {
      const nextPage = await this.readPage(
        token,
        page,
        operationSignal,
      );

      if (nextPage.total_count !== totalCount) {
        throw new Error("github_repository_pagination_inconsistent");
      }
      repositories.push(...nextPage.repositories);
    }

    if (repositories.length !== totalCount) {
      throw new Error("github_repository_pagination_inconsistent");
    }

    const ids = new Set<number>();
    const fullNames = new Set<string>();

    for (const repository of repositories) {
      const normalizedFullName = repository.full_name.toLowerCase();

      if (
        ids.has(repository.id) ||
        fullNames.has(normalizedFullName)
      ) {
        throw new Error("github_repository_pagination_inconsistent");
      }
      ids.add(repository.id);
      fullNames.add(normalizedFullName);
    }

    const mapped = repositories.map(toRepository).sort((left, right) => {
      const leftFullName = left.fullName.toLowerCase();
      const rightFullName = right.fullName.toLowerCase();
      const fullNameOrder =
        leftFullName < rightFullName
          ? -1
          : leftFullName > rightFullName
            ? 1
            : 0;

      return fullNameOrder || left.id - right.id;
    });

    return {
      repositorySelection,
      totalCount,
      repositories: mapped,
      loadedAt: this.options.clock.now().toISOString(),
    };
  }
}
