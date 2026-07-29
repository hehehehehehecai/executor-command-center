// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  githubRepositorySelectionFailureContract,
  githubRepositorySelectionHttpContract,
  handleRepositoryDeselection,
  handleRepositorySelection,
  handleSelectedRepositoryList,
  parseMutationOrigin,
} from "./github-repository-selection-http";

const appOrigin = "https://executor.example.test";
const selectedRepository = {
  repositoryId: 9_600_001,
  ownerLogin: "private-owner-sentinel",
  name: "private-repository-sentinel",
  fullName: "private-owner-sentinel/private-repository-sentinel",
  visibility: "private" as const,
  isPrivate: true,
  isFork: false,
  isArchived: false,
  isDisabled: false,
  defaultBranch: "main",
  selectedAt: "2026-07-29T01:00:00.000Z",
  updatedAt: "2026-07-29T01:00:01.000Z",
  calibrationStatus: "pending" as const,
};

function postRequest(body: unknown, origin = appOrigin) {
  return new Request(
    "https://executor.example.test/api/github/repository-selections",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify(body),
    },
  );
}

function deleteRequest(origin = appOrigin) {
  return new Request(
    "https://executor.example.test/api/github/repository-selections/9600001",
    {
      method: "DELETE",
      headers: { origin },
    },
  );
}

function expectPrivateHeaders(response: Response, mutation: boolean) {
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("pragma")).toBe("no-cache");
  const vary = new Set(
    response.headers
      .get("vary")
      ?.split(",")
      .map((value) => value.trim().toLowerCase()),
  );
  expect(vary.has("cookie")).toBe(true);
  expect(vary.has("origin")).toBe(mutation);
}

describe("github-repository-selection-http.v1", () => {
  it("returns GET selections with private no-store headers and no Origin requirement", async () => {
    const execute = vi.fn().mockResolvedValue([selectedRepository]);
    const response = await handleSelectedRepositoryList({ execute });

    expect(githubRepositorySelectionHttpContract).toBe(
      "github-repository-selection-http.v1",
    );
    expect(response.status).toBe(200);
    expectPrivateHeaders(response, false);
    await expect(response.json()).resolves.toEqual({
      selectedRepositories: [selectedRepository],
    });
    expect(execute).toHaveBeenCalledWith();
  });

  it("accepts only the exact same Origin and strict POST repositoryId", async () => {
    const execute = vi.fn().mockResolvedValue(selectedRepository);
    const response = await handleRepositorySelection({
      request: postRequest({ repositoryId: 9_600_001 }),
      appOrigin,
      execute,
    });

    expect(response.status).toBe(200);
    expectPrivateHeaders(response, true);
    await expect(response.json()).resolves.toEqual({
      selectionState: "selected",
      selectedRepository,
    });
    expect(execute).toHaveBeenCalledWith(9_600_001);
  });

  it.each([
    undefined,
    "null",
    "https://evil.example.test",
    "http://executor.example.test",
    "https://EXECUTOR.example.test",
    "https://executor.example.test:443",
    "https://executor.example.test/",
    " https://executor.example.test",
    "https://executor.example.test ",
    "https://executor.example.test, https://evil.example.test",
  ])("rejects non-exact mutation Origin %s before execution", async (origin) => {
    const execute = vi.fn();
    const headers = new Headers({ "content-type": "application/json" });
    if (origin !== undefined) headers.set("origin", origin);
    const request = new Request(
      "https://executor.example.test/api/github/repository-selections",
      {
        method: "POST",
        headers,
        body: '{"repositoryId":',
      },
    );
    if (origin !== undefined && origin.trim() !== origin) {
      Object.defineProperty(request, "headers", {
        value: {
          get(name: string) {
            if (name.toLowerCase() === "origin") return origin;
            if (name.toLowerCase() === "content-type") {
              return "application/json";
            }
            return null;
          },
        },
      });
    }

    const response = await handleRepositorySelection({
      request,
      appOrigin,
      execute,
    });

    expect(response.status).toBe(403);
    expectPrivateHeaders(response, true);
    expect(execute).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "origin_forbidden",
        message: "GitHub repository selection could not be completed.",
      },
    });
  });

  it.each([
    {},
    { repositoryId: "9600001" },
    { repositoryId: 0 },
    { repositoryId: -1 },
    { repositoryId: 1.5 },
    { repositoryId: Number.MAX_SAFE_INTEGER + 1 },
    { repositoryId: 9_600_001, name: "browser-forgery" },
  ])("rejects invalid strict POST body without execution: %j", async (body) => {
    const execute = vi.fn();
    const response = await handleRepositorySelection({
      request: postRequest(body),
      appOrigin,
      execute,
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and non-JSON content types after Origin validation", async () => {
    const execute = vi.fn();
    const malformed = new Request(
      "https://executor.example.test/api/github/repository-selections",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: appOrigin,
        },
        body: '{"repositoryId":',
      },
    );
    const text = new Request(
      "https://executor.example.test/api/github/repository-selections",
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: appOrigin,
        },
        body: '{"repositoryId":9600001}',
      },
    );

    expect(
      (await handleRepositorySelection({
        request: malformed,
        appOrigin,
        execute,
      })).status,
    ).toBe(400);
    expect(
      (await handleRepositorySelection({
        request: text,
        appOrigin,
        execute,
      })).status,
    ).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    "0",
    "01",
    "+1",
    "-1",
    " 1",
    "1 ",
    "1.0",
    "1e3",
    "９６００００１",
    "9007199254740992",
  ])("rejects strict DELETE route parameter %s without execution", async (value) => {
    const execute = vi.fn();
    const response = await handleRepositoryDeselection({
      request: deleteRequest(),
      appOrigin,
      repositoryId: value,
      execute,
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns an empty 204 for existing or missing idempotent deletion", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const response = await handleRepositoryDeselection({
      request: deleteRequest(),
      appOrigin,
      repositoryId: "9600001",
      execute,
    });

    expect(response.status).toBe(204);
    expectPrivateHeaders(response, true);
    expect(await response.text()).toBe("");
    expect(execute).toHaveBeenCalledWith(9_600_001);
  });

  it.each([
    ["unauthenticated", 401],
    ["github_repository_selection_invalid_request", 400],
    ["origin_forbidden", 403],
    ["github_installation_not_registered", 409],
    ["github_installation_suspended", 409],
    ["github_installation_revoked", 409],
    ["github_repository_not_authorized", 409],
    ["github_installation_token_rate_limited", 429],
    ["github_repository_list_rate_limited", 429],
    ["github_installation_token_timeout", 504],
    ["github_repository_list_timeout", 504],
    ["github_installation_lookup_failed", 503],
    ["github_repository_selection_storage_failed", 503],
    ["github_repository_selection_lookup_failed", 503],
    ["github_repository_deselection_failed", 503],
    ["github_repository_list_forbidden", 502],
    ["github_installation_token_revoke_failed", 502],
    ["unknown-database-sentinel", 503],
  ])("maps %s to safe HTTP %i", async (code, status) => {
    const response = await handleRepositorySelection({
      request: postRequest({ repositoryId: 9_600_001 }),
      appOrigin,
      execute: async () => {
        throw new Error(code);
      },
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(status);
    expectPrivateHeaders(response, true);
    expect(serialized).not.toContain("unknown-database-sentinel");
    expect(serialized).not.toMatch(
      /private-owner-sentinel|private-repository-sentinel|sqlstate|postgres|service-role-key/i,
    );
  });

  it("safely merges Vary and preserves multiple Set-Cookie values", async () => {
    const responseHeaders = new Headers({
      vary: "Accept-Encoding, Cookie",
    });
    responseHeaders.append(
      "set-cookie",
      "session-one=one; Path=/; HttpOnly",
    );
    responseHeaders.append(
      "set-cookie",
      "session-two=two; Path=/; HttpOnly",
    );

    const response = await handleRepositorySelection({
      request: postRequest({ repositoryId: 9_600_001 }),
      appOrigin,
      execute: vi.fn().mockResolvedValue(selectedRepository),
      responseHeaders,
    });
    const vary = response.headers.get("vary") ?? "";
    const cookies = response.headers.getSetCookie();

    expect(vary).toContain("Accept-Encoding");
    expect(vary.match(/Cookie/gi)).toHaveLength(1);
    expect(vary.match(/Origin/gi)).toHaveLength(1);
    expect(cookies).toEqual([
      "session-one=one; Path=/; HttpOnly",
      "session-two=two; Path=/; HttpOnly",
    ]);
    expectPrivateHeaders(response, true);
  });

  it("validates APP_ORIGIN as an unambiguous absolute HTTP(S) origin", () => {
    expect(parseMutationOrigin("https://executor.example.test")).toBe(
      "https://executor.example.test",
    );
    expect(parseMutationOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    for (const value of [
      "",
      "executor.example.test",
      "ftp://executor.example.test",
      "https://user:password@executor.example.test",
      "https://executor.example.test/path",
      "https://executor.example.test?query=1",
      "https://executor.example.test#fragment",
    ]) {
      expect(() => parseMutationOrigin(value)).toThrow(
        "github_repository_selection_configuration_missing",
      );
    }
    expect(() =>
      parseMutationOrigin("http://executor.example.test", "production"),
    ).toThrow("github_repository_selection_configuration_missing");
  });

  it("freezes the failure contract without hardcoding sensitive scans", () => {
    expect(githubRepositorySelectionFailureContract).toBe(
      "github-repository-selection-failure.v1",
    );
  });
});
