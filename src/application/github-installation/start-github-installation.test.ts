import { describe, expect, it } from "vitest";

import type { GitHubInstallationStateRepository } from "./installation-state";
import { StartGitHubInstallation } from "./start-github-installation";

const userId = "11111111-1111-4111-8111-111111111111";

class StateRepository implements GitHubInstallationStateRepository {
  readonly created: Parameters<GitHubInstallationStateRepository["create"]>[0][] =
    [];

  async create(
    input: Parameters<GitHubInstallationStateRepository["create"]>[0],
  ) {
    this.created.push(input);
    return { stateRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  }

  async consume(): Promise<{ returnTo: string }> {
    throw new Error("not_used");
  }
}

describe("GitHub App installation start", () => {
  it("revalidates the user and returns the fixed official installation URL with state", async () => {
    const calls: string[] = [];
    const repository = new StateRepository();
    const useCase = new StartGitHubInstallation({
      sessionReader: {
        async getVerifiedUserId() {
          calls.push("get-user");
          return userId;
        },
      },
      stateRepository: repository,
      configuredAppSlug: "executor-fixture-app",
      clock: { now: () => new Date("2026-07-23T07:00:00.000Z") },
      randomBytes: () => new Uint8Array(32).fill(7),
    });

    const result = await useCase.execute({
      returnTo: "/onboarding?step=installation",
    });

    expect(calls).toEqual(["get-user"]);
    const url = new URL(result.installationUrl);
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe(
      "/apps/executor-fixture-app/installations/new",
    );
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect([...url.searchParams.keys()]).toEqual(["state"]);
    expect(result.callbackState).toBe(url.searchParams.get("state"));
    expect(repository.created).toHaveLength(1);
  });

  it("rejects unauthenticated start before creating state", async () => {
    const repository = new StateRepository();
    const useCase = new StartGitHubInstallation({
      sessionReader: { getVerifiedUserId: async () => null },
      stateRepository: repository,
      configuredAppSlug: "executor-fixture-app",
    });

    await expect(useCase.execute({ returnTo: "/onboarding" })).rejects.toThrow(
      "unauthenticated",
    );
    expect(repository.created).toEqual([]);
  });

  it("rejects missing server configuration before creating state", async () => {
    const repository = new StateRepository();
    const useCase = new StartGitHubInstallation({
      sessionReader: { getVerifiedUserId: async () => userId },
      stateRepository: repository,
      configuredAppSlug: "",
    });

    await expect(useCase.execute({ returnTo: "/onboarding" })).rejects.toThrow(
      "github_app_configuration_missing",
    );
    expect(repository.created).toEqual([]);
  });

  it("never accepts a browser-provided App slug or installation URL", async () => {
    const repository = new StateRepository();
    const useCase = new StartGitHubInstallation({
      sessionReader: { getVerifiedUserId: async () => userId },
      stateRepository: repository,
      configuredAppSlug: "executor-fixture-app",
      randomBytes: () => new Uint8Array(32).fill(3),
    });

    const result = await useCase.execute({
      returnTo:
        "/onboarding?appSlug=attacker-app&installationUrl=https://evil.example",
    });

    expect(result.installationUrl).toContain(
      "github.com/apps/executor-fixture-app/installations/new",
    );
    expect(result.installationUrl).not.toContain("attacker-app");
    expect(result.installationUrl).not.toContain("evil.example");
  });
});
