import { describe, expect, it } from "vitest";

import { AuthUserNotFoundError } from "@/application/auth/user-identity-errors";
import type { UserIdentityInput } from "@/application/auth/user-identity-input";
import {
  SupabaseUserRepository,
  type UserIdentityRpcClient,
  type UserIdentityRpcResult,
} from "./supabase-user-repository";

const validInput: UserIdentityInput = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  githubUserId: 123456789,
  githubLogin: "executor-user",
  avatarUrl: "https://avatars.githubusercontent.com/u/123456789",
};

class RecordingRpcClient implements UserIdentityRpcClient {
  readonly inputs: UserIdentityInput[] = [];

  constructor(private readonly result: UserIdentityRpcResult) {}

  async ensureUserIdentity(input: UserIdentityInput) {
    this.inputs.push(input);
    return this.result;
  }
}

describe("SupabaseUserRepository", () => {
  it("returns the internal UUID from the atomic identity RPC", async () => {
    const rpcClient = new RecordingRpcClient({
      data: validInput.authUserId,
      error: null,
    });
    const repository = new SupabaseUserRepository(rpcClient);

    await expect(repository.ensureForAuthUser(validInput)).resolves.toEqual({
      userId: validInput.authUserId,
    });
  });

  it("validates and normalizes input before invoking persistence", async () => {
    const rpcClient = new RecordingRpcClient({
      data: validInput.authUserId,
      error: null,
    });
    const repository = new SupabaseUserRepository(rpcClient);

    await repository.ensureForAuthUser({
      ...validInput,
      githubLogin: "  renamed-user  ",
    });

    expect(rpcClient.inputs).toEqual([
      { ...validInput, githubLogin: "renamed-user" },
    ]);
  });

  it("does not invoke persistence for invalid input", async () => {
    const rpcClient = new RecordingRpcClient({ data: null, error: null });
    const repository = new SupabaseUserRepository(rpcClient);

    await expect(
      repository.ensureForAuthUser({ ...validInput, githubUserId: 0 }),
    ).rejects.toMatchObject({ code: "invalid_github_user_id" });
    expect(rpcClient.inputs).toEqual([]);
  });

  it("maps a missing Supabase Auth user to an explicit error", async () => {
    const repository = new SupabaseUserRepository(
      new RecordingRpcClient({
        data: null,
        error: { code: "P0002", message: "auth_user_not_found" },
      }),
    );

    await expect(repository.ensureForAuthUser(validInput)).rejects.toBeInstanceOf(
      AuthUserNotFoundError,
    );
  });

  it.each([
    ["identity_github_user_conflict", "github_user_already_bound"],
    ["identity_auth_user_conflict", "auth_user_already_bound"],
  ] as const)("maps %s to %s", async (databaseMessage, code) => {
    const repository = new SupabaseUserRepository(
      new RecordingRpcClient({
        data: null,
        error: { code: "P0001", message: databaseMessage },
      }),
    );

    await expect(repository.ensureForAuthUser(validInput)).rejects.toEqual(
      expect.objectContaining({ code }),
    );
  });

  it("does not expose unknown persistence details as a false conflict", async () => {
    const repository = new SupabaseUserRepository(
      new RecordingRpcClient({
        data: null,
        error: { code: "XX000", message: "database detail" },
      }),
    );

    await expect(repository.ensureForAuthUser(validInput)).rejects.toEqual(
      expect.objectContaining({
        code: "identity_persistence_failed",
      }),
    );
  });

  it("rejects a successful RPC response without a UUID", async () => {
    const repository = new SupabaseUserRepository(
      new RecordingRpcClient({ data: null, error: null }),
    );

    await expect(repository.ensureForAuthUser(validInput)).rejects.toMatchObject({
      code: "identity_persistence_failed",
    });
  });
});
