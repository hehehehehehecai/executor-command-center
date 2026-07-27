import { describe, expect, it } from "vitest";

import type {
  GitHubAppInstallationReader,
  GitHubAppInstallationSnapshot,
} from "@/domain/github-installation/github-app-installation";
import {
  CompleteGitHubInstallationRegistration,
  githubInstallationRegistrationContractVersion,
  githubInstallationStorageContractVersion,
  type GitHubIdentityReader,
  type GitHubInstallationRepository,
} from "./register-github-installation";
import type { GitHubInstallationStateRepository } from "./installation-state";

const userId = "11111111-1111-4111-8111-111111111111";
const validRawState = "a".repeat(43);
const activeSnapshot: GitHubAppInstallationSnapshot = {
  installationId: 81001,
  appId: 900001,
  accountId: 71001,
  accountLogin: "synthetic-user",
  accountType: "User",
  repositorySelection: "selected",
  suspendedAt: null,
};

class StateRepository implements GitHubInstallationStateRepository {
  readonly calls: string[];

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async create(): Promise<{ stateRecordId: string }> {
    throw new Error("not_used");
  }

  async consume() {
    this.calls.push("consume-state");
    return { returnTo: "/onboarding?installation=connected" };
  }
}

class InstallationReader implements GitHubAppInstallationReader {
  constructor(
    private readonly calls: string[],
    readonly snapshot: GitHubAppInstallationSnapshot = activeSnapshot,
  ) {}

  async getInstallation() {
    this.calls.push("read-installation");
    return this.snapshot;
  }
}

class IdentityReader implements GitHubIdentityReader {
  constructor(
    private readonly calls: string[],
    readonly githubUserId: number | null = 71001,
  ) {}

  async findByUserId() {
    this.calls.push("read-identity");
    return this.githubUserId === null
      ? null
      : { githubUserId: this.githubUserId };
  }
}

class InstallationRepository implements GitHubInstallationRepository {
  readonly inputs: Parameters<GitHubInstallationRepository["registerVerified"]>[0][] =
    [];

  constructor(private readonly calls: string[]) {}

  async registerVerified(
    input: Parameters<GitHubInstallationRepository["registerVerified"]>[0],
  ) {
    this.calls.push("register-installation");
    this.inputs.push(input);
    return {
      installationRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
  }
}

function createUseCase(input: {
  snapshot?: GitHubAppInstallationSnapshot;
  githubUserId?: number | null;
  configuredAppId?: string;
} = {}) {
  const calls: string[] = [];
  const repository = new InstallationRepository(calls);
  const useCase = new CompleteGitHubInstallationRegistration({
    stateRepository: new StateRepository(calls),
    installationReader: new InstallationReader(calls, input.snapshot),
    identityReader: new IdentityReader(calls, input.githubUserId),
    installationRepository: repository,
    configuredAppId: input.configuredAppId ?? "900001",
    clock: { now: () => new Date("2026-07-23T06:00:00.000Z") },
  });

  return { calls, repository, useCase };
}

describe("github-installation-registration.v1 ownership verification", () => {
  it("consumes state, verifies a personal installation, then stores it in strict order", async () => {
    const { calls, repository, useCase } = createUseCase();

    await expect(
      useCase.execute({
        userId,
        rawState: validRawState,
        installationId: "81001",
      }),
    ).resolves.toEqual({
      installationRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      installationStatus: "active",
      redirectTo: "/onboarding?installation=connected",
    });

    expect(githubInstallationRegistrationContractVersion).toBe(
      "github-installation-registration.v1",
    );
    expect(githubInstallationStorageContractVersion).toBe(
      "github-installation-storage.v1",
    );
    expect(calls).toEqual([
      "consume-state",
      "read-installation",
      "read-identity",
      "register-installation",
    ]);
    expect(repository.inputs).toEqual([
      {
        userId,
        installationId: 81001,
        githubAccountId: 71001,
        githubAccountLogin: "synthetic-user",
        accountType: "User",
        repositorySelection: "selected",
        status: "active",
        suspendedAt: null,
        verifiedAt: "2026-07-23T06:00:00.000Z",
      },
    ]);
  });

  it("maps a suspended installation without treating it as revoked", async () => {
    const suspendedAt = "2026-07-23T05:30:00.000Z";
    const { repository, useCase } = createUseCase({
      snapshot: { ...activeSnapshot, suspendedAt },
    });

    const result = await useCase.execute({
      userId,
      rawState: validRawState,
      installationId: "81001",
    });

    expect(result.installationStatus).toBe("suspended");
    expect(repository.inputs[0]).toMatchObject({
      status: "suspended",
      suspendedAt,
    });
  });

  it.each([
    [
      "returned installation id mismatch",
      { snapshot: { ...activeSnapshot, installationId: 81002 } },
      "installation_id_mismatch",
      ["consume-state", "read-installation"],
    ],
    [
      "configured app id mismatch",
      { snapshot: { ...activeSnapshot, appId: 900002 } },
      "installation_app_mismatch",
      ["consume-state", "read-installation"],
    ],
    [
      "organization installation",
      { snapshot: { ...activeSnapshot, accountType: "Organization" } },
      "unsupported_installation_account_type",
      ["consume-state", "read-installation"],
    ],
    [
      "missing internal GitHub identity",
      { githubUserId: null },
      "current_github_identity_missing",
      ["consume-state", "read-installation", "read-identity"],
    ],
    [
      "account id mismatch",
      { githubUserId: 71002 },
      "installation_account_mismatch",
      ["consume-state", "read-installation", "read-identity"],
    ],
  ] as const)(
    "rejects %s without any storage write",
    async (_caseName, options, expectedError, expectedCalls) => {
      const { calls, repository, useCase } = createUseCase(options);

      await expect(
        useCase.execute({
          userId,
          rawState: validRawState,
          installationId: "81001",
        }),
      ).rejects.toThrow(expectedError);
      expect(calls).toEqual(expectedCalls);
      expect(repository.inputs).toEqual([]);
    },
  );

  it.each([null, "", "0", "-1", "1.5", "9007199254740992", "12x"])(
    "consumes state before rejecting unsafe installation id %s",
    async (installationId) => {
      const { calls, repository, useCase } = createUseCase();

      await expect(
        useCase.execute({
          userId,
          rawState: validRawState,
          installationId,
        }),
      ).rejects.toThrow("installation_id_invalid");
      expect(calls).toEqual(["consume-state"]);
      expect(repository.inputs).toEqual([]);
    },
  );
});
