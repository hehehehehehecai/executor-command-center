// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  GitHubAuthorizedRepositoryReader,
  repositoryListContract,
} from "./github-authorized-repository-reader";
import { GitHubAuthorizedRepositoryGatewayAdapter } from "./github-authorized-repository-gateway";

function repository(
  id: number,
  fullName = `synthetic-owner/repository-${id}`,
  overrides: Record<string, unknown> = {},
) {
  const [owner, name] = fullName.split("/");
  return {
    id,
    name,
    full_name: fullName,
    owner: { login: owner },
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    visibility: "public",
    default_branch: "main",
    node_id: "forbidden-node-id",
    clone_url: "https://forbidden.invalid/repository.git",
    permissions: { admin: true },
    ...overrides,
  };
}

function page(
  totalCount: number,
  repositories: unknown[],
  status = 200,
) {
  return new Response(
    JSON.stringify({
      total_count: totalCount,
      repositories,
      extra_raw_field: "must-not-be-returned",
    }),
    { status },
  );
}

function createReader(
  fetcher: typeof fetch,
  timeoutMilliseconds = 100,
) {
  return new GitHubAuthorizedRepositoryReader({
    restApiVersion: "2026-03-10",
    clock: { now: () => new Date("2026-07-27T05:30:00.000Z") },
    fetcher,
    timeoutMilliseconds,
  });
}

describe("github-authorized-repository-list.v1 single page", () => {
  it("uses only the fixed Installation endpoint and returns the minimal DTO", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        page(1, [
          repository(701, "synthetic-owner/visible-repository", {
            private: true,
            fork: true,
            archived: true,
            disabled: true,
            visibility: "internal",
            default_branch: "trunk",
          }),
        ]),
      );

    await expect(
      createReader(fetcher).listAll("opaque-token", "selected"),
    ).resolves.toEqual({
      repositorySelection: "selected",
      totalCount: 1,
      loadedAt: "2026-07-27T05:30:00.000Z",
      repositories: [
        {
          id: 701,
          name: "visible-repository",
          fullName: "synthetic-owner/visible-repository",
          ownerLogin: "synthetic-owner",
          isPrivate: true,
          isFork: true,
          isArchived: true,
          isDisabled: true,
          visibility: "internal",
          defaultBranch: "trunk",
        },
      ],
    });
    expect(repositoryListContract).toBe(
      "github-authorized-repository-list.v1",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/installation/repositories?per_page=100&page=1",
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/vnd.github+json",
          authorization: "Bearer opaque-token",
          "x-github-api-version": "2026-03-10",
        },
      }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(
      /user\/repos|contents|issues|pulls|actions|graphql/i,
    );
  });

  it("treats zero repositories as a successful complete list", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page(0, []));

    await expect(
      createReader(fetcher).listAll("opaque", "all"),
    ).resolves.toMatchObject({
      repositorySelection: "all",
      totalCount: 0,
      repositories: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([201, 206, 204])(
    "rejects unexpected repository success status %i before pagination",
    async (status) => {
      const response = new Response(null, { status });
      const json = vi.spyOn(response, "json").mockResolvedValue({
        total_count: 101,
        repositories: Array.from({ length: 100 }, (_, index) =>
          repository(index + 1),
        ),
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

      await expect(
        createReader(fetcher).listAll("opaque", "selected"),
      ).rejects.toThrow("github_repository_list_invalid_response");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(json).not.toHaveBeenCalled();
    },
  );

  it("revokes after an unexpected repository 2xx and returns no repository data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page(0, [], 206));
    const tokenClient = {
      create: vi.fn().mockResolvedValue({
        token: "opaque",
        expiresAt: "2026-07-27T06:30:00.000Z",
        repositorySelection: "selected" as const,
      }),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
      tokenClient,
      repositoryReader: createReader(fetcher),
      operationTimeoutMilliseconds: 30_000,
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_repository_list_invalid_response",
    );
    expect(tokenClient.revoke).toHaveBeenCalledWith("opaque");
  });

  it("preserves an unexpected repository 2xx as primary when revocation also fails", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(page(0, [], 206));
    const tokenClient = {
      create: vi.fn().mockResolvedValue({
        token: "opaque",
        expiresAt: "2026-07-27T06:30:00.000Z",
        repositorySelection: "selected" as const,
      }),
      revoke: vi
        .fn()
        .mockRejectedValue(
          new Error("github_installation_token_revoke_failed"),
        ),
    };
    const onSecondaryFailure = vi.fn();
    const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
      tokenClient,
      repositoryReader: createReader(fetcher),
      operationTimeoutMilliseconds: 30_000,
      onSecondaryFailure,
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_repository_list_invalid_response",
    );
    expect(onSecondaryFailure).toHaveBeenCalledWith({
      failureCode: "github_installation_token_revoke_failed",
      primaryFailureCode: "github_repository_list_invalid_response",
    });
  });

  it.each([
    [401, "github_repository_list_unauthorized"],
    [403, "github_repository_list_forbidden"],
    [429, "github_repository_list_rate_limited"],
    [500, "github_repository_list_unavailable"],
  ])("maps HTTP %i to %s without exposing the body", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("raw-private-repository-name", { status }),
    );

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow(code);
  });

  it("maps a 403 rate limit distinctly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("sensitive", {
        status: 403,
        headers: { "retry-after": "5" },
      }),
    );

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_list_rate_limited");
  });

  it.each([
    new Response("{", { status: 200 }),
    page(-1, []),
    page(1, [{}]),
    page(1, [repository(Number.MAX_SAFE_INTEGER + 1)]),
    page(1, [repository(1, "owner/repo", { visibility: "secret" })]),
    page(101, Array.from({ length: 101 }, (_, index) => repository(index + 1))),
  ])("rejects malformed JSON, schema violations, and oversized pages", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_list_invalid_response");
  });

  it("maps timeout and network failures without retry", async () => {
    const timeout = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    await expect(
      createReader(timeout, 5).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_list_timeout");
    expect(timeout).toHaveBeenCalledTimes(1);

    const network = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("raw-network-failure"));
    await expect(
      createReader(network).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_list_unavailable");
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe("github-authorized-repository-list.v1 complete pagination", () => {
  it("loads all pages sequentially and sorts by lowercase full_name then id", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      repository(index + 1, `z-owner/repository-${index + 1}`),
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(102, firstPage))
      .mockResolvedValueOnce(
        page(102, [
          repository(102, "b-owner/beta"),
          repository(101, "A-owner/alpha"),
        ]),
      );

    const result = await createReader(fetcher).listAll(
      "opaque",
      "selected",
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toContain(
      "per_page=100&page=2",
    );
    expect(result.repositories).toHaveLength(102);
    expect(result.repositories.slice(0, 2).map((item) => item.fullName)).toEqual(
      ["A-owner/alpha", "b-owner/beta"],
    );
  });

  it("does not request a second page at the exact 100-item boundary", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      page(
        100,
        Array.from({ length: 100 }, (_, index) => repository(index + 1)),
      ),
    );

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).resolves.toMatchObject({ totalCount: 100 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed total_count and returns no partial result", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(
          101,
          Array.from({ length: 100 }, (_, index) => repository(index + 1)),
        ),
      )
      .mockResolvedValueOnce(page(100, [repository(101)]));

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_pagination_inconsistent");
  });

  it.each([
    [
      "duplicate id",
      repository(1, "owner/other"),
      "github_repository_pagination_inconsistent",
    ],
    [
      "case-insensitive full_name conflict",
      repository(101, "SYNTHETIC-OWNER/REPOSITORY-1"),
      "github_repository_pagination_inconsistent",
    ],
  ])("rejects %s without silent deduplication", async (_name, lastRepository, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(
          101,
          Array.from({ length: 100 }, (_, index) => repository(index + 1)),
        ),
      )
      .mockResolvedValueOnce(page(101, [lastRepository]));

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow(code);
  });

  it("rejects a final count mismatch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(
          101,
          Array.from({ length: 100 }, (_, index) => repository(index + 1)),
        ),
      )
      .mockResolvedValueOnce(page(101, []));

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_pagination_inconsistent");
  });

  it("rejects a page limit over 100 before requesting another page", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        page(
          10_001,
          Array.from({ length: 100 }, (_, index) => repository(index + 1)),
        ),
      );

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_pagination_limit_exceeded");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns no partial result when a middle page fails", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(
          201,
          Array.from({ length: 100 }, (_, index) => repository(index + 1)),
        ),
      )
      .mockResolvedValueOnce(
        new Response("private-repository-name", { status: 500 }),
      );

    await expect(
      createReader(fetcher).listAll("opaque", "selected"),
    ).rejects.toThrow("github_repository_list_unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
