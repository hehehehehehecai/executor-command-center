import { describe, expect, it } from "vitest";

import {
  GitHubProviderIdentityError,
  mapVerifiedGitHubAuthIdentity,
  type SupabaseAuthUserSnapshot,
} from "./github-provider-identity-mapper";

const authUserId = "11111111-1111-4111-8111-111111111111";

function githubUser(
  overrides: Partial<SupabaseAuthUserSnapshot> = {},
): SupabaseAuthUserSnapshot {
  return {
    id: authUserId,
    identities: [
      {
        provider: "github",
        provider_id: "12345678",
        identity_data: {
          user_name: "octo-fixture",
          avatar_url: "https://avatars.example.test/u/12345678",
        },
      },
    ],
    ...overrides,
  };
}

describe("github-provider-identity.v1", () => {
  it("maps the single verified GitHub provider identity", () => {
    expect(mapVerifiedGitHubAuthIdentity(githubUser())).toEqual({
      authUserId,
      githubUserId: 12345678,
      githubLogin: "octo-fixture",
      avatarUrl: "https://avatars.example.test/u/12345678",
    });
  });

  it("maps the UserIdentity shape returned by the locked Supabase auth SDK", () => {
    const sdkUser = {
      id: authUserId,
      identities: [
        {
          id: "12345678",
          user_id: authUserId,
          identity_id: "33333333-3333-4333-8333-333333333333",
          provider: "github",
          identity_data: {
            provider_id: "12345678",
            user_name: "octo-fixture",
            avatar_url: "https://avatars.example.test/u/12345678",
          },
        },
      ],
    } as unknown as SupabaseAuthUserSnapshot;

    expect(mapVerifiedGitHubAuthIdentity(sdkUser)).toEqual({
      authUserId,
      githubUserId: 12345678,
      githubLogin: "octo-fixture",
      avatarUrl: "https://avatars.example.test/u/12345678",
    });
  });

  it("uses provider_id as the stable key when login changes", () => {
    const first = mapVerifiedGitHubAuthIdentity(githubUser());
    const renamed = mapVerifiedGitHubAuthIdentity(
      githubUser({
        identities: [
          {
            provider: "github",
            provider_id: "12345678",
            identity_data: { user_name: "renamed-fixture" },
          },
        ],
      }),
    );

    expect(renamed.githubUserId).toBe(first.githubUserId);
    expect(renamed.githubLogin).toBe("renamed-fixture");
    expect(renamed.avatarUrl).toBeNull();
  });

  it.each([
    ["missing identity", { identities: [] }, "invalid_github_provider_identity"],
    [
      "non GitHub identity",
      {
        identities: [
          {
            provider: "google",
            provider_id: "12345678",
            identity_data: { user_name: "not-github" },
          },
        ],
      },
      "invalid_github_provider_identity",
    ],
    [
      "multiple GitHub identities",
      {
        identities: [
          {
            provider: "github",
            provider_id: "12345678",
            identity_data: { user_name: "one" },
          },
          {
            provider: "github",
            provider_id: "87654321",
            identity_data: { user_name: "two" },
          },
        ],
      },
      "invalid_github_provider_identity",
    ],
    [
      "missing provider id",
      {
        identities: [
          {
            provider: "github",
            identity_data: { user_name: "octo-fixture" },
          },
        ],
      },
      "invalid_github_user_id",
    ],
    [
      "non numeric provider id",
      {
        identities: [
          {
            provider: "github",
            provider_id: "not-numeric",
            identity_data: { user_name: "octo-fixture" },
          },
        ],
      },
      "invalid_github_user_id",
    ],
    [
      "unsafe provider id",
      {
        identities: [
          {
            provider: "github",
            provider_id: "9007199254740992",
            identity_data: { user_name: "octo-fixture" },
          },
        ],
      },
      "invalid_github_user_id",
    ],
    [
      "missing login",
      {
        identities: [
          {
            provider: "github",
            provider_id: "12345678",
            identity_data: {},
          },
        ],
      },
      "invalid_github_login",
    ],
  ] as const)("rejects %s", (_name, overrides, code) => {
    expect(() => mapVerifiedGitHubAuthIdentity(githubUser(overrides))).toThrow(
      expect.objectContaining<Partial<GitHubProviderIdentityError>>({ code }),
    );
  });
});
