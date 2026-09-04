// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  GitHubInstallationTokenClient,
  installationAccessTokenContract,
  installationTokenRevocationContract,
} from "./github-installation-token-client";
import { GitHubAuthorizedRepositoryGatewayAdapter } from "./github-authorized-repository-gateway";

const now = new Date("2026-07-27T05:30:00.000Z");
const activityReadPermissions = {
  metadata: "read",
  contents: "read",
  issues: "read",
  pull_requests: "read",
  actions: "read",
  checks: "read",
} as const;

function createClient(
  fetcher: typeof fetch,
  timeoutMilliseconds = 100,
) {
  return new GitHubInstallationTokenClient({
    jwtSigner: { sign: () => "synthetic-app-jwt" },
    restApiVersion: "2026-03-10",
    clock: { now: () => now },
    fetcher,
    timeoutMilliseconds,
  });
}

describe("github-installation-access-token.v1", () => {
  it.each([
    "github_app_configuration_missing",
    "github_app_authentication_failed",
  ])("preserves the App JWT signer failure %s", async (code) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new GitHubInstallationTokenClient({
      jwtSigner: {
        sign() {
          throw new Error(code);
        },
      },
      restApiVersion: "2026-03-10",
      clock: { now: () => now },
      fetcher,
      timeoutMilliseconds: 100,
    });

    await expect(client.create(81001)).rejects.toThrow(code);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a metadata-only token at the fixed endpoint and treats it as opaque", async () => {
    const opaqueToken = "future-token-format::not-40-characters";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: opaqueToken,
          expires_at: "2026-07-27T06:30:00.000Z",
          repository_selection: "selected",
          permissions: { metadata: "read" },
        }),
        { status: 201 },
      ),
    );

    await expect(createClient(fetcher).create(81001)).resolves.toEqual({
      token: opaqueToken,
      expiresAt: "2026-07-27T06:30:00.000Z",
      repositorySelection: "selected",
    });
    expect(installationAccessTokenContract).toBe(
      "github-installation-access-token.v1",
    );

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://api.github.com/app/installations/81001/access_tokens",
    );
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer synthetic-app-jwt",
        "content-type": "application/json",
        "x-github-api-version": "2026-03-10",
      },
      body: JSON.stringify({ permissions: { metadata: "read" } }),
    });
    expect(String(init?.body)).not.toMatch(
      /repositories|repository_ids/,
    );
  });

  it("creates an activity-read token with the exact six read permissions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "synthetic-activity-token",
          expires_at: "2026-07-27T06:30:00.000Z",
          repository_selection: "selected",
          permissions: activityReadPermissions,
        }),
        { status: 201 },
      ),
    );

    await expect(
      createClient(fetcher).createActivity(81001),
    ).resolves.toEqual({
      token: "synthetic-activity-token",
      expiresAt: "2026-07-27T06:30:00.000Z",
      repositorySelection: "selected",
    });

    const [, init] = fetcher.mock.calls[0]!;
    const requestBody = JSON.parse(String(init?.body));
    expect(requestBody).toEqual({
      permissions: activityReadPermissions,
    });
    expect(requestBody).not.toHaveProperty("repositories");
    expect(requestBody).not.toHaveProperty("repository_ids");
    expect(JSON.stringify(requestBody)).not.toMatch(/"write"/);
  });

  it.each(Object.keys(activityReadPermissions))(
    "rejects an activity token response missing required %s permission without exposing its token",
    async (missingPermission) => {
      const permissions = { ...activityReadPermissions };
      delete permissions[
        missingPermission as keyof typeof permissions
      ];
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "must-not-leak-activity-token",
            expires_at: "2026-07-27T06:30:00.000Z",
            repository_selection: "selected",
            permissions,
          }),
          { status: 201 },
        ),
      );

      const error = await createClient(fetcher)
        .createActivity(81001)
        .catch((caught: unknown) => caught);

      expect(error).toEqual(
        new Error("github_installation_token_invalid_response"),
      );
      expect(String(error)).not.toContain(
        "must-not-leak-activity-token",
      );
    },
  );

  it("rejects an activity token response that upgrades a required permission to write", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "must-not-leak-write-token",
          expires_at: "2026-07-27T06:30:00.000Z",
          repository_selection: "selected",
          permissions: {
            ...activityReadPermissions,
            contents: "write",
          },
        }),
        { status: 201 },
      ),
    );

    const error = await createClient(fetcher)
      .createActivity(81001)
      .catch((caught: unknown) => caught);
    expect(error).toEqual(
      new Error("github_installation_token_invalid_response"),
    );
    expect(String(error)).not.toContain("must-not-leak-write-token");
  });

  it.each([200, 202, 204])(
    "rejects unexpected token success status %i before reading its body",
    async (status) => {
      const response = new Response(null, { status });
      const json = vi.spyOn(response, "json").mockResolvedValue({
        token: "must-not-be-created",
        expires_at: "2026-07-27T06:30:00.000Z",
        repository_selection: "selected",
        permissions: { metadata: "read" },
      });
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

      await expect(createClient(fetcher).create(81001)).rejects.toThrow(
        "github_installation_token_invalid_response",
      );
      expect(json).not.toHaveBeenCalled();
    },
  );

  it("does not read repositories or revoke when an unexpected token 2xx is rejected", async () => {
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, "json").mockResolvedValue({
      token: "must-not-be-created",
      expires_at: "2026-07-27T06:30:00.000Z",
      repository_selection: "selected",
      permissions: { metadata: "read" },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const tokenClient = createClient(fetcher);
    const revoke = vi.spyOn(tokenClient, "revoke");
    const repositoryReader = {
      listAll: vi.fn().mockResolvedValue({
        repositorySelection: "selected" as const,
        totalCount: 0,
        repositories: [],
        loadedAt: "2026-07-27T05:30:00.000Z",
      }),
    };
    const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
      tokenClient,
      repositoryReader,
      operationTimeoutMilliseconds: 30_000,
    });

    await expect(gateway.listAllForInstallation(81001)).rejects.toThrow(
      "github_installation_token_invalid_response",
    );
    expect(repositoryReader.listAll).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it.each([
    [401, "github_installation_token_unauthorized"],
    [403, "github_installation_token_forbidden"],
    [404, "github_installation_token_not_found"],
    [429, "github_installation_token_rate_limited"],
    [500, "github_installation_token_unavailable"],
  ])("maps HTTP %i to %s without exposing the body", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("raw-sensitive-github-body", { status }),
    );

    await expect(createClient(fetcher).create(81001)).rejects.toThrow(code);
    await createClient(fetcher)
      .create(81001)
      .catch((error: unknown) => {
        expect(String(error)).not.toContain("raw-sensitive-github-body");
      });
  });

  it("maps explicit 403 rate limiting separately", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("sensitive", {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );

    await expect(createClient(fetcher).create(81001)).rejects.toThrow(
      "github_installation_token_rate_limited",
    );
  });

  it.each([
    {
      token: "",
      expires_at: "2026-07-27T06:30:00.000Z",
      repository_selection: "selected",
    },
    {
      token: "opaque",
      expires_at: "2026-07-27T05:29:59.000Z",
      repository_selection: "selected",
    },
    {
      token: "opaque",
      expires_at: "invalid",
      repository_selection: "selected",
    },
    {
      token: "opaque",
      expires_at: "2026-07-27T06:30:00.000Z",
      repository_selection: "forged",
    },
    {
      token: "opaque",
      expires_at: "2026-07-27T06:30:00.000Z",
      repository_selection: "selected",
      permissions: { metadata: "write" },
    },
  ])("rejects an invalid runtime token response", async (payload) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 201 }),
    );

    await expect(createClient(fetcher).create(81001)).rejects.toThrow(
      "github_installation_token_invalid_response",
    );
  });

  it("maps malformed JSON, timeout, and network failures without retry", async () => {
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{", { status: 201 }));
    await expect(createClient(malformed).create(81001)).rejects.toThrow(
      "github_installation_token_invalid_response",
    );

    const timeout = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    await expect(createClient(timeout, 5).create(81001)).rejects.toThrow(
      "github_installation_token_timeout",
    );
    expect(timeout).toHaveBeenCalledTimes(1);

    const network = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("raw-network-failure"));
    await expect(createClient(network).create(81001)).rejects.toThrow(
      "github_installation_token_unavailable",
    );
    expect(network).toHaveBeenCalledTimes(1);
  });
});

describe("github-installation-token-revocation.v1 adapter", () => {
  it("revokes only at DELETE /installation/token with the opaque token", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createClient(fetcher);

    await expect(
      client.revoke("new::opaque::token"),
    ).resolves.toBeUndefined();
    expect(installationTokenRevocationContract).toBe(
      "github-installation-token-revocation.v1",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/installation/token",
      expect.objectContaining({
        method: "DELETE",
        redirect: "error",
        headers: {
          accept: "application/vnd.github+json",
          authorization: "Bearer new::opaque::token",
          "x-github-api-version": "2026-03-10",
        },
      }),
    );
  });

  it("maps every non-204, network error, and timeout to the stable revoke failure", async () => {
    const failures = [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("raw-sensitive-revoke-body", { status: 200 }),
        ),
      vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("raw-network-error")),
      vi.fn<typeof fetch>((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      }),
    ];

    for (const fetcher of failures) {
      await expect(createClient(fetcher, 5).revoke("opaque")).rejects.toThrow(
        "github_installation_token_revoke_failed",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
