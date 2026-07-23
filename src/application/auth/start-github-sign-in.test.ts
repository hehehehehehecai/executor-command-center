import { describe, expect, it } from "vitest";

import type { GitHubSignInGateway } from "./github-sign-in-gateway";
import { StartGitHubSignIn } from "./start-github-sign-in";

describe("StartGitHubSignIn", () => {
  it("starts GitHub OAuth with a trusted callback and preserved local returnTo", async () => {
    const received: unknown[] = [];
    const gateway: GitHubSignInGateway = {
      async start(input) {
        received.push(input);
        return { providerUrl: "https://supabase.example.test/authorize?synthetic=1" };
      },
      async exchangeCode() {
        throw new Error("not_used");
      },
      async getVerifiedUser() {
        throw new Error("not_used");
      },
    };

    const result = await new StartGitHubSignIn(gateway).execute({
      trustedOrigin: "https://executor.example.test",
      returnTo: "/projects?tab=active",
    });

    expect(received).toEqual([
      {
        provider: "github",
        callbackUrl:
          "https://executor.example.test/auth/callback?returnTo=%2Fprojects%3Ftab%3Dactive",
      },
    ]);
    expect(result).toEqual({
      kind: "success",
      providerUrl: "https://supabase.example.test/authorize?synthetic=1",
    });
  });

  it("replaces an unsafe returnTo and maps gateway failure safely", async () => {
    const gateway: GitHubSignInGateway = {
      async start() {
        throw new Error("provider_url?code=synthetic-secret");
      },
      async exchangeCode() {
        throw new Error("not_used");
      },
      async getVerifiedUser() {
        throw new Error("not_used");
      },
    };

    await expect(
      new StartGitHubSignIn(gateway).execute({
        trustedOrigin: "https://executor.example.test",
        returnTo: "https://evil.example",
      }),
    ).resolves.toEqual({ kind: "failure", code: "oauth_start_failed" });
  });
});
