import { describe, expect, it } from "vitest";

import { SupabaseGitHubSignInGateway } from "./supabase-github-sign-in-gateway";

describe("SupabaseGitHubSignInGateway", () => {
  it("uses Supabase GitHub OAuth without repository scopes", async () => {
    const calls: unknown[] = [];
    const gateway = new SupabaseGitHubSignInGateway({
      auth: {
        async signInWithOAuth(input) {
          calls.push(input);
          return {
            data: {
              provider: "github",
              url: "https://supabase.example.test/authorize?synthetic=1",
            },
            error: null,
          };
        },
        async exchangeCodeForSession() {
          throw new Error("not_used");
        },
        async getUser() {
          throw new Error("not_used");
        },
      },
    });

    await expect(
      gateway.start({
        provider: "github",
        callbackUrl: "https://executor.example.test/auth/callback",
      }),
    ).resolves.toEqual({
      providerUrl: "https://supabase.example.test/authorize?synthetic=1",
    });
    expect(calls).toEqual([
      {
        provider: "github",
        options: {
          redirectTo: "https://executor.example.test/auth/callback",
          skipBrowserRedirect: true,
        },
      },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/repo|installation|scope/i);
  });

  it("exchanges the code and revalidates the user with getUser", async () => {
    const calls: string[] = [];
    const gateway = new SupabaseGitHubSignInGateway({
      auth: {
        async signInWithOAuth() {
          throw new Error("not_used");
        },
        async exchangeCodeForSession(code) {
          calls.push(`exchange:${code}`);
          return { data: {}, error: null };
        },
        async getUser() {
          calls.push("getUser");
          return {
            data: {
              user: {
                id: "11111111-1111-4111-8111-111111111111",
                identities: [
                  {
                    provider: "github",
                    provider_id: "12345678",
                    identity_data: { user_name: "octo-fixture" },
                  },
                ],
              },
            },
            error: null,
          };
        },
      },
    });

    await gateway.exchangeCode("synthetic-code");
    await expect(gateway.getVerifiedUser()).resolves.toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
    });
    expect(calls).toEqual(["exchange:synthetic-code", "getUser"]);
  });

  it("fails when Supabase returns no provider URL or verified user", async () => {
    const gateway = new SupabaseGitHubSignInGateway({
      auth: {
        async signInWithOAuth() {
          return { data: { provider: "github", url: null }, error: null };
        },
        async exchangeCodeForSession() {
          return { data: {}, error: new Error("synthetic exchange failure") };
        },
        async getUser() {
          return { data: { user: null }, error: null };
        },
      },
    });

    await expect(
      gateway.start({ provider: "github", callbackUrl: "https://example.test" }),
    ).rejects.toThrow("oauth_start_failed");
    await expect(gateway.exchangeCode("synthetic-code")).rejects.toThrow(
      "callback_exchange_failed",
    );
    await expect(gateway.getVerifiedUser()).rejects.toThrow(
      "callback_session_unavailable",
    );
  });
});
