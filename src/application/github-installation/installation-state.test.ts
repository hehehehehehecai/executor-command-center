import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ConsumeGitHubInstallationState,
  CreateGitHubInstallationState,
  githubInstallationStateContract,
  type GitHubInstallationStateRepository,
} from "./installation-state";

const fixedNow = new Date("2026-07-23T04:00:00.000Z");
const fixedBytes = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
);

class MemoryStateRepository implements GitHubInstallationStateRepository {
  readonly created: Array<{
    userId: string;
    stateHash: string;
    returnTo: string;
    expiresAt: string;
  }> = [];
  readonly consumed: Array<{ userId: string; stateHash: string }> = [];
  consumeResult = "/onboarding";

  async create(input: {
    userId: string;
    stateHash: string;
    returnTo: string;
    expiresAt: string;
  }) {
    this.created.push(input);
    return { stateRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  }

  async consume(input: { userId: string; stateHash: string }) {
    this.consumed.push(input);
    return { returnTo: this.consumeResult };
  }
}

describe("github-installation-state.v1", () => {
  it("creates a 32-byte base64url state while persisting only its SHA-256 hash", async () => {
    const repository = new MemoryStateRepository();
    const useCase = new CreateGitHubInstallationState(repository, {
      now: () => fixedNow,
      randomBytes: () => fixedBytes,
    });

    const result = await useCase.execute({
      userId: "11111111-1111-4111-8111-111111111111",
      returnTo: "/onboarding?step=installation",
    });

    const expectedRawState = Buffer.from(fixedBytes).toString("base64url");
    expect(githubInstallationStateContract).toEqual({
      contractVersion: "github-installation-state.v1",
      rawStateBytes: 32,
      encoding: "base64url",
      storedValue: "sha256(raw_state)",
      hashAlgorithm: "sha256",
      ttlMilliseconds: 600_000,
      singleUse: true,
      userBound: true,
      returnToValidated: true,
    });
    expect(result).toEqual({
      rawState: expectedRawState,
      returnTo: "/onboarding?step=installation",
    });
    expect(repository.created).toEqual([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        stateHash: createHash("sha256")
          .update(expectedRawState, "utf8")
          .digest("hex"),
        returnTo: "/onboarding?step=installation",
        expiresAt: "2026-07-23T04:10:00.000Z",
      },
    ]);
    expect(JSON.stringify(repository.created)).not.toContain(expectedRawState);
  });

  it("falls back to the safe onboarding path for an unsafe returnTo", async () => {
    const repository = new MemoryStateRepository();
    const useCase = new CreateGitHubInstallationState(repository, {
      now: () => fixedNow,
      randomBytes: () => fixedBytes,
    });

    await useCase.execute({
      userId: "11111111-1111-4111-8111-111111111111",
      returnTo: "//evil.example/steal",
    });

    expect(repository.created[0]?.returnTo).toBe("/onboarding");
  });

  it("rejects a random provider that supplies fewer than 32 bytes", async () => {
    const repository = new MemoryStateRepository();
    const useCase = new CreateGitHubInstallationState(repository, {
      now: () => fixedNow,
      randomBytes: () => new Uint8Array(31),
    });

    await expect(
      useCase.execute({
        userId: "11111111-1111-4111-8111-111111111111",
        returnTo: "/onboarding",
      }),
    ).rejects.toThrow("installation_state_generation_failed");
    expect(repository.created).toEqual([]);
  });

  it("rejects a random provider that supplies more than 32 bytes", async () => {
    const repository = new MemoryStateRepository();
    const useCase = new CreateGitHubInstallationState(repository, {
      now: () => fixedNow,
      randomBytes: () => new Uint8Array(33),
    });

    await expect(
      useCase.execute({
        userId: "11111111-1111-4111-8111-111111111111",
        returnTo: "/onboarding",
      }),
    ).rejects.toThrow("installation_state_generation_failed");
    expect(repository.created).toEqual([]);
  });

  it("hashes the callback state before asking the repository to consume it", async () => {
    const repository = new MemoryStateRepository();
    const useCase = new ConsumeGitHubInstallationState(repository);
    const validRawState = "a".repeat(43);

    await expect(
      useCase.execute({
        userId: "11111111-1111-4111-8111-111111111111",
        rawState: validRawState,
      }),
    ).resolves.toEqual({ returnTo: "/onboarding" });

    expect(repository.consumed).toEqual([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        stateHash: createHash("sha256")
          .update(validRawState, "utf8")
          .digest("hex"),
      },
    ]);
  });

  it.each([
    [null, "installation_state_missing"],
    ["", "installation_state_missing"],
    ["not base64url!", "installation_state_invalid"],
    ["a".repeat(4_096), "installation_state_invalid"],
  ])(
    "rejects a missing or malformed callback state: %s",
    async (rawState, expectedCode) => {
      const repository = new MemoryStateRepository();
      const useCase = new ConsumeGitHubInstallationState(repository);

      await expect(
        useCase.execute({
          userId: "11111111-1111-4111-8111-111111111111",
          rawState,
        }),
      ).rejects.toThrow(expectedCode);
      expect(repository.consumed).toEqual([]);
    },
  );
});
