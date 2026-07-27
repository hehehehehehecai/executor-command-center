// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  GitHubInstallationTokenClient,
  installationAccessTokenContract,
  installationTokenRevocationContract,
} from "./github-installation-token-client";

const now = new Date("2026-07-27T05:30:00.000Z");

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
