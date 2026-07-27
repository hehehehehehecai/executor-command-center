// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  createGitHubInstallationFailureRecord,
  handleGitHubInstallationSetup,
  handleGitHubInstallationStart,
} from "./github-installation-http";

describe("GitHub installation HTTP boundary", () => {
  it("builds the complete redacted Phase 3 failure record without sensitive fields", () => {
    const record = createGitHubInstallationFailureRecord({
      failureId: "failure-fixture-id",
      stage: "installation_setup",
      requestId: "request-fixture-id",
      failureCode: "installation_account_mismatch",
      installationIdPresent: true,
      stateValid: true,
      sessionValid: true,
      githubApiCalled: true,
      accountType: "User",
      ownershipMatch: false,
      installationPersisted: false,
    });

    expect(record).toEqual({
      contract_version: "github-installation-registration.v1",
      failure_id: "failure-fixture-id",
      phase: "phase_3",
      stage: "installation_setup",
      request_id: "request-fixture-id",
      failure_code: "installation_account_mismatch",
      installation_id_present: true,
      state_valid: true,
      session_valid: true,
      github_api_called: true,
      account_type: "User",
      ownership_match: false,
      installation_persisted: false,
      safe_message: "GitHub App installation registration failed.",
      sensitive_fields_redacted: true,
    });
    expect(JSON.stringify(record)).not.toMatch(
      /private_key|authorization|raw_state|session_cookie|service_role/i,
    );
  });

  it("redirects a successful start to the fixed GitHub installation URL", async () => {
    const execute = vi.fn().mockResolvedValue({
      installationUrl:
        "https://github.com/apps/executor-fixture-app/installations/new?state=synthetic_state",
    });

    const response = await handleGitHubInstallationStart({
      request: new Request(
        "https://executor.example.test/api/github/installations/start?returnTo=%2Fonboarding",
      ),
      trustedOrigin: "https://executor.example.test",
      execute,
    });

    expect(execute).toHaveBeenCalledWith({ returnTo: "/onboarding" });
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBe(
      "https://github.com/apps/executor-fixture-app/installations/new?state=synthetic_state",
    );
  });

  it("maps unauthenticated start to the generic auth error without leaking query data", async () => {
    const onFailure = vi.fn();
    const response = await handleGitHubInstallationStart({
      request: new Request(
        "https://executor.example.test/api/github/installations/start?returnTo=%2Fprivate%3Fsecret%3Dvalue",
      ),
      trustedOrigin: "https://executor.example.test",
      execute: async () => {
        throw new Error("unauthenticated");
      },
      onFailure,
    });

    expect(response.headers.get("location")).toBe(
      "https://executor.example.test/auth/error",
    );
    expect(onFailure).toHaveBeenCalledWith("unauthenticated");
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain("secret");
  });

  it("passes only state and installation_id candidates to setup execution", async () => {
    const execute = vi.fn().mockResolvedValue({
      redirectTo: "/onboarding",
      installationStatus: "active",
      installationRecordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const response = await handleGitHubInstallationSetup({
      request: new Request(
        "https://executor.example.test/api/github/installations/setup?state=synthetic_state&installation_id=81001&setup_action=install&user_id=forged",
      ),
      trustedOrigin: "https://executor.example.test",
      execute,
    });

    expect(execute).toHaveBeenCalledWith({
      rawState: "synthetic_state",
      installationId: "81001",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://executor.example.test/onboarding",
    );
  });

  it("rejects a forged installation_id through a generic failure redirect", async () => {
    const onFailure = vi.fn();
    const execute = vi.fn().mockRejectedValue(
      new Error("installation_id_invalid"),
    );
    const response = await handleGitHubInstallationSetup({
      request: new Request(
        "https://executor.example.test/api/github/installations/setup?state=synthetic_state&installation_id=9007199254740992",
      ),
      trustedOrigin: "https://executor.example.test",
      execute,
      onFailure,
    });

    expect(response.headers.get("location")).toBe(
      "https://executor.example.test/onboarding?installation=configuration_failed",
    );
    expect(onFailure).toHaveBeenCalledWith("installation_id_invalid");
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain(
      "9007199254740992",
    );
  });
});
