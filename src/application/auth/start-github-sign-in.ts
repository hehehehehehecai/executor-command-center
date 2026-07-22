import type { GitHubSignInGateway } from "./github-sign-in-gateway";
import { safeReturnTo } from "./safe-return-to";

export const githubOAuthStartPath = "/api/auth/github";
export const githubOAuthCallbackPath = "/auth/callback";
export const githubSignInContractVersion = "github-sign-in.v1" as const;

export type StartGitHubSignInResult =
  | { readonly kind: "success"; readonly providerUrl: string }
  | { readonly kind: "failure"; readonly code: "oauth_start_failed" };

export class StartGitHubSignIn {
  constructor(private readonly gateway: GitHubSignInGateway) {}

  async execute(input: {
    readonly trustedOrigin: string;
    readonly returnTo?: string | null;
  }): Promise<StartGitHubSignInResult> {
    try {
      const callback = new URL(githubOAuthCallbackPath, input.trustedOrigin);
      callback.searchParams.set("returnTo", safeReturnTo(input.returnTo));
      const result = await this.gateway.start({
        provider: "github",
        callbackUrl: callback.toString(),
      });

      return { kind: "success", providerUrl: result.providerUrl };
    } catch {
      return { kind: "failure", code: "oauth_start_failed" };
    }
  }
}
