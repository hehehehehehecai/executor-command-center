import { describe, expect, it } from "vitest";

import {
  handleGitHubOAuthCallback,
  handleGitHubOAuthStart,
} from "./github-auth-http";

describe("GitHub auth HTTP handlers", () => {
  it("redirects OAuth Start to the provider URL returned by the use case", async () => {
    const response = await handleGitHubOAuthStart({
      request: new Request(
        "https://untrusted.example/api/auth/github?returnTo=%2Fonboarding",
      ),
      execute: async (input) => {
        expect(input).toEqual({
          trustedOrigin: "https://executor.example.test",
          returnTo: "/onboarding",
        });
        return {
          kind: "success",
          providerUrl: "https://supabase.example.test/authorize?synthetic=1",
        };
      },
      trustedOrigin: "https://executor.example.test",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://supabase.example.test/authorize?synthetic=1",
    );
    expect(() =>
      response.headers.set("cache-control", "private, no-store"),
    ).not.toThrow();
  });

  it("redirects a valid callback to the trusted application origin", async () => {
    const response = await handleGitHubOAuthCallback({
      request: new Request(
        "https://untrusted.example/auth/callback?code=synthetic-code&returnTo=%2Fonboarding",
      ),
      execute: async (input) => {
        expect(input).toEqual({
          code: "synthetic-code",
          providerError: null,
          returnTo: "/onboarding",
        });
        return {
          kind: "success",
          userId: "22222222-2222-4222-8222-222222222222",
          redirectTo: "/onboarding",
        };
      },
      trustedOrigin: "https://executor.example.test",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://executor.example.test/onboarding",
    );
  });

  it("does not forward browser-forged identity fields to the callback use case", async () => {
    let received: unknown;
    await handleGitHubOAuthCallback({
      request: new Request(
        "https://untrusted.example/auth/callback?code=synthetic-code&userId=forged&githubUserId=999&login=forged",
      ),
      execute: async (input) => {
        received = input;
        return {
          kind: "failure",
          code: "callback_session_unavailable",
          redirectTo: "/auth/error",
        };
      },
      trustedOrigin: "https://executor.example.test",
    });

    expect(received).toEqual({
      code: "synthetic-code",
      providerError: null,
      returnTo: null,
    });
  });

  it("maps callback provider errors to a fixed safe error path", async () => {
    const response = await handleGitHubOAuthCallback({
      request: new Request(
        "https://untrusted.example/auth/callback?error=access_denied&error_description=secret-detail",
      ),
      execute: async () => ({
        kind: "failure",
        code: "callback_provider_error",
        redirectTo: "/auth/error",
      }),
      trustedOrigin: "https://executor.example.test",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://executor.example.test/auth/error",
    );
    expect(await response.text()).not.toContain("secret-detail");
  });
});
