// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { ListAuthorizedGitHubRepositories } from "./list-authorized-github-repositories";

const activeInstallation = {
  installationId: 81001,
  repositorySelection: "selected" as const,
  status: "active" as const,
};

function createUseCase(input: {
  userId?: string | null;
  installation?:
    | {
        installationId: number;
        repositorySelection: "all" | "selected";
        status: "active" | "suspended" | "revoked";
      }
    | null;
  queryFailure?: boolean;
}) {
  const gateway = {
    listAllForInstallation: vi.fn().mockResolvedValue({
      repositorySelection: "selected",
      totalCount: 0,
      repositories: [],
      loadedAt: "2026-07-27T05:30:00.000Z",
    }),
  };
  const installationQuery = {
    findByUserId: input.queryFailure
      ? vi.fn().mockRejectedValue(new Error("raw-database-error"))
      : vi.fn().mockResolvedValue(input.installation ?? null),
  };
  const useCase = new ListAuthorizedGitHubRepositories({
    sessionReader: {
      getVerifiedUserId: vi.fn().mockResolvedValue(input.userId ?? null),
    },
    installationQuery,
    repositoryGateway: gateway,
  });

  return { gateway, installationQuery, useCase };
}

describe("current-github-installation-query.v1 application boundary", () => {
  it("derives the active installation from the verified user and accepts no browser input", async () => {
    const { gateway, installationQuery, useCase } = createUseCase({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      installation: activeInstallation,
    });

    await expect(useCase.execute()).resolves.toMatchObject({
      repositorySelection: "selected",
      totalCount: 0,
      repositories: [],
    });
    expect(installationQuery.findByUserId).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(gateway.listAllForInstallation).toHaveBeenCalledWith(81001);
    expect(useCase.execute.length).toBe(0);
  });

  it("rejects an unauthenticated request before querying an installation", async () => {
    const { gateway, installationQuery, useCase } = createUseCase({
      userId: null,
    });

    await expect(useCase.execute()).rejects.toThrow("unauthenticated");
    expect(installationQuery.findByUserId).not.toHaveBeenCalled();
    expect(gateway.listAllForInstallation).not.toHaveBeenCalled();
  });

  it("maps a missing installation without creating a token", async () => {
    const { gateway, useCase } = createUseCase({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      installation: null,
    });

    await expect(useCase.execute()).rejects.toThrow(
      "github_installation_not_registered",
    );
    expect(gateway.listAllForInstallation).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended", "github_installation_suspended"],
    ["revoked", "github_installation_revoked"],
  ] as const)("rejects a %s installation before token creation", async (status, code) => {
    const { gateway, useCase } = createUseCase({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      installation: { ...activeInstallation, status },
    });

    await expect(useCase.execute()).rejects.toThrow(code);
    expect(gateway.listAllForInstallation).not.toHaveBeenCalled();
  });

  it("maps lookup details to the stable lookup failure", async () => {
    const { gateway, useCase } = createUseCase({
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      queryFailure: true,
    });

    await expect(useCase.execute()).rejects.toThrow(
      "github_installation_lookup_failed",
    );
    expect(gateway.listAllForInstallation).not.toHaveBeenCalled();
  });
});
