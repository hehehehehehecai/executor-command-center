import { describe, expect, it, vi } from "vitest";
import { SelectAuthorizedGitHubRepository } from "./select-authorized-github-repository";

const userId = "a5000000-0000-4000-8000-000000000001";
const githubInstallationId =
  "a5100000-0000-4000-8000-000000000001";

const authorizedRepository = {
  id: 9_600_001,
  ownerLogin: "live-owner",
  name: "live-repository",
  fullName: "live-owner/live-repository",
  isPrivate: true,
  isFork: false,
  isArchived: false,
  isDisabled: false,
  visibility: "private" as const,
  defaultBranch: "main",
};

const selectedRepository = {
  repositoryId: 9_600_001,
  ownerLogin: "live-owner",
  name: "live-repository",
  fullName: "live-owner/live-repository",
  visibility: "private" as const,
  isPrivate: true,
  isFork: false,
  isArchived: false,
  isDisabled: false,
  defaultBranch: "main",
  selectedAt: "2026-07-29T01:00:00.000Z",
  updatedAt: "2026-07-29T01:00:01.000Z",
  calibrationStatus: "pending" as const,
};

function dependencies(
  overrides: {
    readonly userId?: string | null;
    readonly installation?: {
      readonly githubInstallationId: string;
      readonly installationId: number;
      readonly status: "active" | "suspended" | "revoked";
    } | null;
    readonly repositories?: readonly (typeof authorizedRepository)[];
    readonly gatewayError?: Error;
    readonly writerError?: Error;
  } = {},
) {
  const order: string[] = [];
  const sessionReader = {
    getVerifiedUserId: vi.fn(async () => {
      order.push("session");
      return overrides.userId === undefined ? userId : overrides.userId;
    }),
  };
  const installationQuery = {
    findByUserId: vi.fn(async () => {
      order.push("installation");
      return overrides.installation === undefined
        ? {
            githubInstallationId,
            installationId: 9_800_001,
            status: "active" as const,
          }
        : overrides.installation;
    }),
  };
  const repositoryGateway = {
    listAllForInstallation: vi.fn(async () => {
      order.push("live-authorization");
      if (overrides.gatewayError) throw overrides.gatewayError;
      const repositories =
        overrides.repositories ?? [authorizedRepository];
      return {
        repositorySelection: "selected" as const,
        totalCount: repositories.length,
        repositories,
        loadedAt: "2026-07-29T01:00:00.000Z",
      };
    }),
  };
  const writer = {
    ensureSelected: vi.fn(async () => {
      order.push("writer");
      if (overrides.writerError) throw overrides.writerError;
      return selectedRepository;
    }),
    removeSelection: vi.fn(),
  };

  return {
    order,
    sessionReader,
    installationQuery,
    repositoryGateway,
    writer,
  };
}

describe("SelectAuthorizedGitHubRepository", () => {
  it("performs live authorization before one atomic write using only the live DTO", async () => {
    const deps = dependencies();

    await expect(
      new SelectAuthorizedGitHubRepository(deps).execute({
        repositoryId: 9_600_001,
      }),
    ).resolves.toEqual(selectedRepository);

    expect(deps.order).toEqual([
      "session",
      "installation",
      "live-authorization",
      "writer",
    ]);
    expect(deps.repositoryGateway.listAllForInstallation).toHaveBeenCalledWith(
      9_800_001,
    );
    expect(deps.writer.ensureSelected).toHaveBeenCalledTimes(1);
    expect(deps.writer.ensureSelected).toHaveBeenCalledWith({
      userId,
      githubInstallationId,
      repository: authorizedRepository,
    });
  });

  it.each([
    ["suspended", "github_installation_suspended"],
    ["revoked", "github_installation_revoked"],
  ] as const)(
    "rejects %s before GitHub or database access",
    async (status, failureCode) => {
      const deps = dependencies({
        installation: {
          githubInstallationId,
          installationId: 9_800_001,
          status,
        },
      });

      await expect(
        new SelectAuthorizedGitHubRepository(deps).execute({
          repositoryId: 9_600_001,
        }),
      ).rejects.toThrow(failureCode);
      expect(deps.repositoryGateway.listAllForInstallation).not.toHaveBeenCalled();
      expect(deps.writer.ensureSelected).not.toHaveBeenCalled();
    },
  );

  it("rejects missing session or installation before any write", async () => {
    const unauthenticated = dependencies({ userId: null });
    await expect(
      new SelectAuthorizedGitHubRepository(unauthenticated).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow("unauthenticated");
    expect(unauthenticated.installationQuery.findByUserId).not.toHaveBeenCalled();
    expect(unauthenticated.writer.ensureSelected).not.toHaveBeenCalled();

    const missingInstallation = dependencies({ installation: null });
    await expect(
      new SelectAuthorizedGitHubRepository(missingInstallation).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow("github_installation_not_registered");
    expect(
      missingInstallation.repositoryGateway.listAllForInstallation,
    ).not.toHaveBeenCalled();
    expect(missingInstallation.writer.ensureSelected).not.toHaveBeenCalled();
  });

  it.each([
    "github_installation_token_unavailable",
    "github_repository_list_failed",
    "github_installation_token_revoke_failed",
  ])("performs zero writes when live authorization fails with %s", async (code) => {
    const deps = dependencies({ gatewayError: new Error(code) });

    await expect(
      new SelectAuthorizedGitHubRepository(deps).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow(code);
    expect(deps.writer.ensureSelected).not.toHaveBeenCalled();
  });

  it("uses strict numeric identity and fails closed on zero or duplicate matches", async () => {
    const missing = dependencies({ repositories: [] });
    await expect(
      new SelectAuthorizedGitHubRepository(missing).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow("github_repository_not_authorized");
    expect(missing.writer.ensureSelected).not.toHaveBeenCalled();

    const duplicate = dependencies({
      repositories: [
        authorizedRepository,
        { ...authorizedRepository, fullName: "duplicate/id" },
      ],
    });
    await expect(
      new SelectAuthorizedGitHubRepository(duplicate).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow("github_repository_not_authorized");
    expect(duplicate.writer.ensureSelected).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs before session, GitHub, or database calls", async () => {
    for (const repositoryId of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const deps = dependencies();
      await expect(
        new SelectAuthorizedGitHubRepository(deps).execute({
          repositoryId,
        }),
      ).rejects.toThrow("github_repository_selection_invalid_request");
      expect(deps.sessionReader.getVerifiedUserId).not.toHaveBeenCalled();
      expect(deps.repositoryGateway.listAllForInstallation).not.toHaveBeenCalled();
      expect(deps.writer.ensureSelected).not.toHaveBeenCalled();
    }
  });

  it.each([
    [
      "github_repository_selection_installation_not_found",
      "github_installation_not_registered",
    ],
    [
      "github_repository_selection_installation_wrong_user",
      "github_repository_not_authorized",
    ],
    [
      "github_repository_selection_installation_not_active",
      "github_repository_not_authorized",
    ],
    [
      "github_repository_selection_installation_mismatch",
      "github_repository_selection_storage_failed",
    ],
    [
      "github_repository_selection_storage_failed",
      "github_repository_selection_storage_failed",
    ],
  ])("maps exact RPC race %s to public failure %s", async (internal, publicCode) => {
    const deps = dependencies({ writerError: new Error(internal) });

    await expect(
      new SelectAuthorizedGitHubRepository(deps).execute({
        repositoryId: 9_600_001,
      }),
    ).rejects.toThrow(publicCode);
  });
});
