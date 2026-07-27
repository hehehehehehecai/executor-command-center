// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

describe("GitHub installation request log boundary", () => {
  it.each([
    "src/app/api/github/installations/start/route.ts",
    "src/app/api/github/installations/setup/route.ts",
  ])("verifies the session before parsing GitHub App configuration in %s", (routePath) => {
    const source = readFileSync(path.resolve(routePath), "utf8");
    const sessionIndex = source.indexOf(
      "await sessionReader.getVerifiedUserId()",
    );
    const githubConfigurationIndex = source.indexOf(
      "parseServerEnvironment(process.env)",
    );

    expect(sessionIndex).toBeGreaterThan(-1);
    expect(githubConfigurationIndex).toBeGreaterThan(sessionIndex);
  });

  it.each([
    "src/app/api/github/installations/start/route.ts",
    "src/app/api/github/installations/setup/route.ts",
  ])("binds the complete redacted failure record in %s", (routePath) => {
    const source = readFileSync(path.resolve(routePath), "utf8");

    for (const field of [
      "failureId",
      "installationIdPresent",
      "stateValid",
      "sessionValid",
      "githubApiCalled",
      "accountType",
      "ownershipMatch",
      "installationPersisted",
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("createGitHubInstallationFailureRecord");
  });

  it("suppresses the setup callback path so raw state is not emitted by incoming request logs", () => {
    const logging = nextConfig.logging;
    const incomingRequests =
      logging && typeof logging === "object"
        ? logging.incomingRequests
        : undefined;

    expect(incomingRequests).not.toBe(false);
    expect(typeof incomingRequests).toBe("object");
    const ignore =
      typeof incomingRequests === "object"
        ? incomingRequests.ignore ?? []
        : [];

    expect(
      ignore.some((pattern) =>
        pattern.test(
          "/api/github/installations/setup?state=synthetic_raw_state&installation_id=81001",
        ),
      ),
    ).toBe(true);
    expect(
      ignore.some((pattern) =>
        pattern.test("/api/github/installations/start?returnTo=%2Fonboarding"),
      ),
    ).toBe(false);
  });
});
