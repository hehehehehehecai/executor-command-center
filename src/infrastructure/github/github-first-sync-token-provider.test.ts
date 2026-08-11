import { beforeAll, describe, expect, it, vi } from "vitest";

import type { FirstSyncInstallationTokenProvider } from "@/application/synchronization/first-sync-use-cases";

vi.mock("server-only", () => ({}));

type Module = {
  GitHubFirstSyncTokenProvider: new (client: {
    createActivity(installationId: number, signal?: AbortSignal): Promise<{
      token: string;
      expiresAt: string;
      repositorySelection: "all" | "selected";
    }>;
  }) => FirstSyncInstallationTokenProvider;
};

let adapter: Module;

beforeAll(async () => {
  adapter = await import("./github-first-sync-token-provider");
});

describe("GitHubFirstSyncTokenProvider", () => {
  it("uses the activity-read profile and returns only the ephemeral token and expiry", async () => {
    const createActivity = vi.fn().mockResolvedValue({
      token: "synthetic-ephemeral-token",
      expiresAt: "2026-08-06T03:00:00.000Z",
      repositorySelection: "selected",
    });
    const provider = new adapter.GitHubFirstSyncTokenProvider({
      createActivity,
    });
    await expect(provider.issue({ installationId: 81_001 })).resolves.toEqual({
      token: "synthetic-ephemeral-token",
      expiresAt: "2026-08-06T03:00:00.000Z",
    });
    expect(createActivity).toHaveBeenCalledWith(81_001, undefined);
  });

  it.each([
    ["github_installation_token_unauthorized", "github_activity_authorization_revoked"],
    ["github_installation_token_forbidden", "github_activity_authorization_revoked"],
    ["github_installation_token_not_found", "github_activity_authorization_revoked"],
    ["github_installation_token_rate_limited", "github_activity_rate_limited"],
    ["github_installation_token_timeout", "github_activity_timeout"],
    ["github_installation_token_unavailable", "github_activity_unavailable"],
  ])("maps %s to %s without a cause", async (source, target) => {
    const provider = new adapter.GitHubFirstSyncTokenProvider({
      createActivity: vi.fn().mockRejectedValue(new Error(source)),
    });
    const error = await provider.issue({ installationId: 81_001 }).catch((caught) => caught);
    expect(error).toEqual(new Error(target));
    expect(error.cause).toBeUndefined();
  });
});
