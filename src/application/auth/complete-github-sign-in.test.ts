import { describe, expect, it } from "vitest";

import {
  UserIdentityConflictError,
  UserIdentityPersistenceError,
} from "./user-identity-errors";
import type { UserRepository } from "./user-repository";
import type { GitHubSignInGateway } from "./github-sign-in-gateway";
import { CompleteGitHubSignIn } from "./complete-github-sign-in";

const authUserId = "11111111-1111-4111-8111-111111111111";
const internalUserId = "22222222-2222-4222-8222-222222222222";

function successfulGateway(): GitHubSignInGateway {
  return {
    async start() {
      throw new Error("not_used");
    },
    async exchangeCode(code) {
      if (code !== "synthetic-callback-code") throw new Error("bad_fixture");
    },
    async getVerifiedUser() {
      return {
        id: authUserId,
        identities: [
          {
            provider: "github",
            provider_id: "12345678",
            identity_data: { user_name: "octo-fixture" },
          },
        ],
      };
    },
  };
}

describe("CompleteGitHubSignIn", () => {
  it("exchanges code, validates the server user and ensures the internal identity", async () => {
    const persisted: unknown[] = [];
    const repository: UserRepository = {
      async ensureForAuthUser(input) {
        persisted.push(input);
        return { userId: internalUserId };
      },
    };

    const result = await new CompleteGitHubSignIn(
      successfulGateway(),
      repository,
    ).execute({ code: "synthetic-callback-code", returnTo: "/onboarding" });

    expect(persisted).toEqual([
      {
        authUserId,
        githubUserId: 12345678,
        githubLogin: "octo-fixture",
        avatarUrl: null,
      },
    ]);
    expect(result).toEqual({
      kind: "success",
      userId: internalUserId,
      redirectTo: "/onboarding",
    });
  });

  it.each([
    [new UserIdentityConflictError("github_user_already_bound"), "github_identity_conflict"],
    [new UserIdentityPersistenceError(), "internal_identity_persistence_failed"],
  ])("maps repository errors without leaking details", async (error, code) => {
    const repository: UserRepository = {
      async ensureForAuthUser() {
        throw error;
      },
    };

    await expect(
      new CompleteGitHubSignIn(successfulGateway(), repository).execute({
        code: "synthetic-callback-code",
        returnTo: "https://evil.example",
      }),
    ).resolves.toEqual({
      kind: "failure",
      code,
      redirectTo: "/auth/error",
    });
  });

  it("rejects a missing code before touching the gateway", async () => {
    let exchanged = false;
    const gateway = successfulGateway();
    const guardedGateway: GitHubSignInGateway = {
      ...gateway,
      async exchangeCode() {
        exchanged = true;
      },
    };
    const repository: UserRepository = {
      async ensureForAuthUser() {
        throw new Error("not_used");
      },
    };

    await expect(
      new CompleteGitHubSignIn(guardedGateway, repository).execute({ code: null }),
    ).resolves.toEqual({
      kind: "failure",
      code: "callback_missing_code",
      redirectTo: "/auth/error",
    });
    expect(exchanged).toBe(false);
  });
});
