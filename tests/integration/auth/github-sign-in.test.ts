import { describe, expect, it } from "vitest";

import { CompleteGitHubSignIn } from "../../../src/application/auth/complete-github-sign-in";
import type { GitHubSignInGateway } from "../../../src/application/auth/github-sign-in-gateway";
import type { UserIdentityInput } from "../../../src/application/auth/user-identity-input";
import type { UserRepository } from "../../../src/application/auth/user-repository";

const authUserId = "11111111-1111-4111-8111-111111111111";
const internalUserId = "22222222-2222-4222-8222-222222222222";

class SyntheticAuthGateway implements GitHubSignInGateway {
  login = "octo-fixture";

  async start() {
    return { providerUrl: "https://supabase.example.test/synthetic" };
  }

  async exchangeCode(code: string) {
    if (code !== "synthetic-callback-code") throw new Error("fixture_code_invalid");
  }

  async getVerifiedUser() {
    return {
      id: authUserId,
      identities: [
        {
          provider: "github",
          provider_id: "12345678",
          identity_data: { user_name: this.login },
        },
      ],
    };
  }
}

class InMemoryUserRepository implements UserRepository {
  readonly usersByGitHubId = new Map<number, { userId: string; login: string }>();

  async ensureForAuthUser(input: UserIdentityInput) {
    const existing = this.usersByGitHubId.get(input.githubUserId);
    if (existing) {
      existing.login = input.githubLogin;
      return { userId: existing.userId };
    }
    this.usersByGitHubId.set(input.githubUserId, {
      userId: internalUserId,
      login: input.githubLogin,
    });
    return { userId: internalUserId };
  }
}

describe("GitHub callback to internal identity integration", () => {
  it("creates once, repeats idempotently, and treats login as mutable display data", async () => {
    const gateway = new SyntheticAuthGateway();
    const repository = new InMemoryUserRepository();
    const useCase = new CompleteGitHubSignIn(gateway, repository);

    const first = await useCase.execute({
      code: "synthetic-callback-code",
      returnTo: "/onboarding",
    });
    gateway.login = "renamed-fixture";
    const repeated = await useCase.execute({
      code: "synthetic-callback-code",
      returnTo: "/onboarding",
    });

    expect(first).toEqual(repeated);
    expect(repository.usersByGitHubId.size).toBe(1);
    expect(repository.usersByGitHubId.get(12345678)).toEqual({
      userId: internalUserId,
      login: "renamed-fixture",
    });
  });
});
