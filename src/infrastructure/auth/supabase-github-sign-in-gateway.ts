import type { GitHubSignInGateway } from "@/application/auth/github-sign-in-gateway";
import type { SupabaseAuthUserSnapshot } from "@/application/auth/github-provider-identity-mapper";

type SupabaseAuthClient = {
  readonly auth: {
    signInWithOAuth(input: {
      provider: "github";
      options: { redirectTo: string; skipBrowserRedirect: true };
    }): Promise<{
      data: { provider?: string; url: string | null };
      error: unknown | null;
    }>;
    exchangeCodeForSession(code: string): Promise<{
      data: unknown;
      error: unknown | null;
    }>;
    getUser(): Promise<{
      data: { user: SupabaseAuthUserSnapshot | null };
      error: unknown | null;
    }>;
  };
};

export class SupabaseGitHubSignInGateway implements GitHubSignInGateway {
  constructor(private readonly client: SupabaseAuthClient) {}

  async start(input: {
    readonly provider: "github";
    readonly callbackUrl: string;
  }) {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: input.provider,
      options: {
        redirectTo: input.callbackUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) throw new Error("oauth_start_failed");
    return { providerUrl: data.url };
  }

  async exchangeCode(code: string) {
    const { error } = await this.client.auth.exchangeCodeForSession(code);
    if (error) throw new Error("callback_exchange_failed");
  }

  async getVerifiedUser() {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new Error("callback_session_unavailable");
    return data.user;
  }
}
