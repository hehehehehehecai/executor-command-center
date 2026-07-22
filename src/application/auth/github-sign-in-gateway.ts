import type { SupabaseAuthUserSnapshot } from "./github-provider-identity-mapper";

export type GitHubOAuthStartInput = {
  readonly provider: "github";
  readonly callbackUrl: string;
};

export interface GitHubSignInGateway {
  start(input: GitHubOAuthStartInput): Promise<{ providerUrl: string }>;
  exchangeCode(code: string): Promise<void>;
  getVerifiedUser(): Promise<SupabaseAuthUserSnapshot>;
}
