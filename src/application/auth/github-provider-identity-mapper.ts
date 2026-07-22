import { validateUserIdentityInput } from "./user-identity-input";

export interface VerifiedGitHubAuthIdentity {
  readonly authUserId: string;
  readonly githubUserId: number;
  readonly githubLogin: string;
  readonly avatarUrl: string | null;
}

export interface SupabaseProviderIdentitySnapshot {
  readonly provider?: string;
  readonly provider_id?: string;
  readonly identity_data?: Readonly<Record<string, unknown>>;
}

export interface SupabaseAuthUserSnapshot {
  readonly id: string;
  readonly identities?: readonly SupabaseProviderIdentitySnapshot[] | null;
}

export type GitHubProviderIdentityErrorCode =
  | "invalid_github_provider_identity"
  | "invalid_github_user_id"
  | "invalid_github_login";

export class GitHubProviderIdentityError extends Error {
  readonly name = "GitHubProviderIdentityError";

  constructor(readonly code: GitHubProviderIdentityErrorCode) {
    super(code);
  }
}

export function mapVerifiedGitHubAuthIdentity(
  user: SupabaseAuthUserSnapshot,
): VerifiedGitHubAuthIdentity {
  const githubIdentities = (user.identities ?? []).filter(
    (identity) => identity.provider === "github",
  );

  if (githubIdentities.length !== 1) {
    throw new GitHubProviderIdentityError("invalid_github_provider_identity");
  }

  const identity = githubIdentities[0];
  const providerId = identity?.provider_id;

  if (!providerId || !/^\d+$/.test(providerId)) {
    throw new GitHubProviderIdentityError("invalid_github_user_id");
  }

  const githubUserId = Number(providerId);

  if (!Number.isSafeInteger(githubUserId) || githubUserId <= 0) {
    throw new GitHubProviderIdentityError("invalid_github_user_id");
  }

  const githubLogin = identity?.identity_data?.user_name;

  if (typeof githubLogin !== "string" || githubLogin.trim() === "") {
    throw new GitHubProviderIdentityError("invalid_github_login");
  }

  const rawAvatarUrl = identity?.identity_data?.avatar_url;
  const avatarUrl = typeof rawAvatarUrl === "string" ? rawAvatarUrl : null;

  try {
    return validateUserIdentityInput({
      authUserId: user.id,
      githubUserId,
      githubLogin,
      avatarUrl,
    });
  } catch {
    throw new GitHubProviderIdentityError(
      Number.isSafeInteger(githubUserId)
        ? "invalid_github_login"
        : "invalid_github_user_id",
    );
  }
}
