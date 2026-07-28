// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { GitHubAuthorizedRepositoryGatewayAdapter } from "./github-authorized-repository-gateway";

const completeList = {
  repositorySelection: "selected" as const,
  totalCount: 1,
  repositories: [
    {
      id: 701,
      name: "private-repository-sentinel",
      fullName: "private-owner/private-repository-sentinel",
      ownerLogin: "private-owner",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      isDisabled: false,
      visibility: "private" as const,
      defaultBranch: "main",
    },
  ],
  loadedAt: "2026-07-27T05:30:00.000Z",
};

function createGateway(input: {
  listFailure?: string;
  revokeFailure?: boolean;
  createFailure?: string;
}) {
  const tokenClient = {
    create: input.createFailure
      ? vi.fn().mockRejectedValue(new Error(input.createFailure))
      : vi.fn().mockResolvedValue({
          token: "opaque-secret-token-sentinel",
          expiresAt: "2026-07-27T06:30:00.000Z",
          repositorySelection: "selected",
        }),
    revoke: input.revokeFailure
      ? vi
          .fn()
          .mockRejectedValue(
            new Error("github_installation_token_revoke_failed"),
          )
      : vi.fn().mockResolvedValue(undefined),
  };
  const repositoryReader = {
    listAll: input.listFailure
      ? vi.fn().mockRejectedValue(new Error(input.listFailure))
      : vi.fn().mockResolvedValue(completeList),
  };
  const onSecondaryFailure = vi.fn();
  const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
    tokenClient,
    repositoryReader,
    operationTimeoutMilliseconds: 30_000,
    onSecondaryFailure,
  });

  return {
    gateway,
    onSecondaryFailure,
    repositoryReader,
    tokenClient,
  };
}

describe("Installation token lifecycle gateway", () => {
  it("revokes immediately after a complete successful list", async () => {
    const { gateway, repositoryReader, tokenClient } = createGateway({});

    await expect(gateway.listAllForInstallation(81001)).resolves.toEqual(
      completeList,
    );
    expect(tokenClient.create).toHaveBeenCalledWith(
      81001,
      expect.any(AbortSignal),
    );
    expect(repositoryReader.listAll).toHaveBeenCalledWith(
      "opaque-secret-token-sentinel",
      "selected",
      expect.any(AbortSignal),
    );
    expect(tokenClient.revoke).toHaveBeenCalledWith(
      "opaque-secret-token-sentinel",
    );
    expect(tokenClient.create.mock.invocationCallOrder[0]).toBeLessThan(
      repositoryReader.listAll.mock.invocationCallOrder[0],
    );
    expect(repositoryReader.listAll.mock.invocationCallOrder[0]).toBeLessThan(
      tokenClient.revoke.mock.invocationCallOrder[0],
    );
  });

  it("does not return successful repository data when revoke fails", async () => {
    const { gateway, onSecondaryFailure } = createGateway({
      revokeFailure: true,
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_installation_token_revoke_failed",
    );
    expect(onSecondaryFailure).not.toHaveBeenCalled();
  });

  it("preserves the list failure after successful revocation", async () => {
    const { gateway, tokenClient } = createGateway({
      listFailure: "github_repository_list_timeout",
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_repository_list_timeout",
    );
    expect(tokenClient.revoke).toHaveBeenCalledTimes(1);
  });

  it("preserves the primary list failure and records only a redacted secondary code", async () => {
    const { gateway, onSecondaryFailure, tokenClient } = createGateway({
      listFailure: "github_repository_list_unavailable",
      revokeFailure: true,
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_repository_list_unavailable",
    );
    expect(tokenClient.revoke).toHaveBeenCalledTimes(1);
    expect(onSecondaryFailure).toHaveBeenCalledWith({
      failureCode: "github_installation_token_revoke_failed",
      primaryFailureCode: "github_repository_list_unavailable",
    });
    expect(JSON.stringify(onSecondaryFailure.mock.calls)).not.toMatch(
      /opaque-secret-token-sentinel|private-repository-sentinel|private-owner/,
    );
  });

  it("does not attempt revocation when token creation failed", async () => {
    const { gateway, repositoryReader, tokenClient } = createGateway({
      createFailure: "github_installation_token_forbidden",
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_installation_token_forbidden",
    );
    expect(repositoryReader.listAll).not.toHaveBeenCalled();
    expect(tokenClient.revoke).not.toHaveBeenCalled();
  });

  it("maps an unknown reader exception to the stable list failure before revoking", async () => {
    const { gateway, tokenClient } = createGateway({
      listFailure: "raw-private-repository-error",
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_repository_list_failed",
    );
    expect(tokenClient.revoke).toHaveBeenCalledTimes(1);
  });

  it("aborts the primary operation at the frozen overall timeout and still revokes", async () => {
    vi.useFakeTimers();
    const tokenClient = {
      create: vi.fn().mockResolvedValue({
        token: "opaque",
        expiresAt: "2026-07-27T06:30:00.000Z",
        repositorySelection: "selected" as const,
      }),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    const repositoryReader = {
      listAll: vi.fn(
        (_token: string, _selection: "selected", signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new Error("github_repository_list_timeout")),
            );
          }),
      ),
    };
    const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
      tokenClient,
      repositoryReader,
      operationTimeoutMilliseconds: 30_000,
    });

    const operation = expect(
      gateway.listAllForInstallation(81001),
    ).rejects.toThrow("github_repository_list_timeout");
    await vi.advanceTimersByTimeAsync(30_000);
    await operation;
    expect(tokenClient.revoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
