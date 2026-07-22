import {
  UserIdentityConflictError,
  UserIdentityPersistenceError,
} from "./user-identity-errors";
import type { UserRepository } from "./user-repository";
import {
  GitHubProviderIdentityError,
  mapVerifiedGitHubAuthIdentity,
} from "./github-provider-identity-mapper";
import type { GitHubSignInGateway } from "./github-sign-in-gateway";
import {
  defaultAuthErrorRedirect,
  safeReturnTo,
} from "./safe-return-to";

export type AuthFailureCode =
  | "oauth_start_failed"
  | "callback_provider_error"
  | "callback_missing_code"
  | "callback_exchange_failed"
  | "callback_session_unavailable"
  | "invalid_github_provider_identity"
  | "github_identity_conflict"
  | "internal_identity_persistence_failed"
  | "unsafe_return_to"
  | "auth_configuration_missing";

export type CompleteGitHubSignInResult =
  | {
      readonly kind: "success";
      readonly userId: string;
      readonly redirectTo: string;
    }
  | {
      readonly kind: "failure";
      readonly code: AuthFailureCode;
      readonly redirectTo: typeof defaultAuthErrorRedirect;
    };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const failure = (code: AuthFailureCode): CompleteGitHubSignInResult => ({
  kind: "failure",
  code,
  redirectTo: defaultAuthErrorRedirect,
});

export class CompleteGitHubSignIn {
  constructor(
    private readonly gateway: GitHubSignInGateway,
    private readonly users: UserRepository,
  ) {}

  async execute(input: {
    readonly code: string | null;
    readonly returnTo?: string | null;
    readonly providerError?: string | null;
  }): Promise<CompleteGitHubSignInResult> {
    if (input.providerError) return failure("callback_provider_error");
    if (!input.code) return failure("callback_missing_code");

    try {
      await this.gateway.exchangeCode(input.code);
    } catch {
      return failure("callback_exchange_failed");
    }

    let user;

    try {
      user = await this.gateway.getVerifiedUser();
    } catch {
      return failure("callback_session_unavailable");
    }

    let identity;

    try {
      identity = mapVerifiedGitHubAuthIdentity(user);
    } catch (error) {
      if (error instanceof GitHubProviderIdentityError) {
        return failure("invalid_github_provider_identity");
      }
      return failure("callback_session_unavailable");
    }

    try {
      const result = await this.users.ensureForAuthUser(identity);

      if (!uuidPattern.test(result.userId)) {
        return failure("internal_identity_persistence_failed");
      }

      return {
        kind: "success",
        userId: result.userId,
        redirectTo: safeReturnTo(input.returnTo),
      };
    } catch (error) {
      if (error instanceof UserIdentityConflictError) {
        return failure("github_identity_conflict");
      }
      if (error instanceof UserIdentityPersistenceError) {
        return failure("internal_identity_persistence_failed");
      }
      return failure("internal_identity_persistence_failed");
    }
  }
}
