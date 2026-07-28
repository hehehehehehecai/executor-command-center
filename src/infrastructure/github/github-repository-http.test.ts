// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  createGitHubRepositoryFailureRecord,
  githubRepositoryFailureDefinitions,
  githubRepositoryFailureContract,
  githubRepositoryHttpContract,
  handleGitHubRepositoryList,
} from "./github-repository-http";

const result = {
  repositorySelection: "selected" as const,
  totalCount: 1,
  repositories: [
    {
      id: 701,
      name: "private-repository-sentinel",
      fullName: "private-owner/private-repository-sentinel",
      ownerLogin: "private-owner",
      isPrivate: true,
      isFork: false,
      isArchived: false,
      isDisabled: false,
      visibility: "private" as const,
      defaultBranch: "main",
    },
  ],
  loadedAt: "2026-07-27T05:30:00.000Z",
};

describe("github-repository-list-http.v1", () => {
  it("returns the minimal JSON with private no-store headers", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const response = await handleGitHubRepositoryList({
      request: new Request("https://executor.example.test/api/github/repositories"),
      execute,
    });

    expect(githubRepositoryHttpContract).toBe(
      "github-repository-list-http.v1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/json",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual(result);
  });

  it("passes no browser-controlled installation, URL, page, or page size to execution", async () => {
    const execute = vi.fn().mockResolvedValue({
      ...result,
      repositories: [],
      totalCount: 0,
    });
    const response = await handleGitHubRepositoryList({
      request: new Request(
        "https://executor.example.test/api/github/repositories?installation_id=999&page=8&per_page=1&url=https://evil.invalid",
        {
          headers: {
            "x-installation-id": "999",
            "x-fixture-mode": "true",
            cookie: "fixture=true",
          },
        },
      ),
      execute,
    });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith();
    expect(execute.mock.calls[0]).toHaveLength(0);
  });

  it.each([
    ["unauthenticated", 401],
    ["github_installation_not_registered", 409],
    ["github_installation_suspended", 409],
    ["github_installation_revoked", 409],
    ["github_installation_lookup_failed", 503],
    ["github_app_configuration_missing", 503],
    ["github_installation_token_rate_limited", 429],
    ["github_repository_list_rate_limited", 429],
    ["github_installation_token_timeout", 504],
    ["github_repository_list_timeout", 504],
    ["github_installation_token_forbidden", 502],
    ["github_repository_list_forbidden", 502],
    ["github_installation_token_revoke_failed", 502],
    ["github_repository_pagination_inconsistent", 502],
    ["unknown-sensitive-error", 502],
  ])("maps %s to a safe HTTP %i response", async (code, status) => {
    const onFailure = vi.fn();
    const response = await handleGitHubRepositoryList({
      request: new Request("https://executor.example.test/api/github/repositories"),
      execute: async () => {
        throw new Error(code);
      },
      onFailure,
    });
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(body).toEqual({
      error: {
        code:
          code === "unknown-sensitive-error"
            ? "github_repository_list_failed"
            : code,
        message: "Authorized GitHub repositories could not be loaded.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("unknown-sensitive-error");
    expect(onFailure).toHaveBeenCalledWith(
      code === "unknown-sensitive-error"
        ? "github_repository_list_failed"
        : code,
      status,
    );
  });
});

describe("github-repository-list-failure.v1", () => {
  it("machine-binds every minimum failure code to public lifecycle metadata", () => {
    const expectedCodes = [
      "unauthenticated",
      "github_installation_not_registered",
      "github_installation_suspended",
      "github_installation_revoked",
      "github_installation_lookup_failed",
      "github_app_configuration_missing",
      "github_app_authentication_failed",
      "github_installation_token_unauthorized",
      "github_installation_token_forbidden",
      "github_installation_token_not_found",
      "github_installation_token_rate_limited",
      "github_installation_token_timeout",
      "github_installation_token_invalid_response",
      "github_installation_token_unavailable",
      "github_installation_token_revoke_failed",
      "github_repository_list_unauthorized",
      "github_repository_list_forbidden",
      "github_repository_list_rate_limited",
      "github_repository_list_timeout",
      "github_repository_list_invalid_response",
      "github_repository_list_unavailable",
      "github_repository_list_failed",
      "github_repository_pagination_inconsistent",
      "github_repository_pagination_limit_exceeded",
    ];

    expect(Object.keys(githubRepositoryFailureDefinitions)).toEqual(
      expectedCodes,
    );
    for (const code of expectedCodes) {
      expect(githubRepositoryFailureDefinitions[code]).toMatchObject({
        publicCode: code,
        partialDataReturned: false,
        sensitiveFieldsForbidden: [
          "token",
          "app_jwt",
          "authorization",
          "repository.name",
          "repository.full_name",
          "owner.login",
          "raw_github_body",
        ],
      });
      expect(
        githubRepositoryFailureDefinitions[code].httpStatus,
      ).toBeGreaterThanOrEqual(400);
      expect(
        typeof githubRepositoryFailureDefinitions[code].retryable,
      ).toBe("boolean");
    }
  });

  it("freezes public failure metadata and produces a fully redacted record", () => {
    expect(githubRepositoryFailureContract).toBe(
      "github-repository-list-failure.v1",
    );
    const record = createGitHubRepositoryFailureRecord({
      failureId: "failure-id",
      requestId: "request-id",
      stage: "repository_page",
      failureCode: "github_repository_list_invalid_response",
      sessionValid: true,
      installationFound: true,
      installationStatus: "active",
      tokenCreated: true,
      tokenUsed: true,
      revocationAttempted: true,
      tokenRevoked: true,
      pageNumber: 2,
      expectedTotalCount: 101,
      observedTotalCount: 101,
      repositoriesCollected: 100,
      httpStatus: 502,
    });
    const serialized = JSON.stringify(record);

    expect(record).toEqual({
      contract_version: "github-repository-list-failure.v1",
      phase: "phase_4",
      failure_id: "failure-id",
      request_id: "request-id",
      stage: "repository_page",
      failure_code: "github_repository_list_invalid_response",
      session_valid: true,
      installation_found: true,
      installation_status: "active",
      token_created: true,
      token_used: true,
      revocation_attempted: true,
      token_revoked: true,
      page_number: 2,
      expected_total_count: 101,
      observed_total_count: 101,
      repositories_collected: 100,
      partial_data_returned: false,
      http_status: 502,
      safe_message: "Authorized GitHub repositories could not be loaded.",
      sensitive_marker_found: false,
    });
    expect(serialized).not.toMatch(
      /opaque-secret-token-sentinel|private-repository-sentinel|private-owner|authorization|raw_body|app_jwt/i,
    );
  });
});
