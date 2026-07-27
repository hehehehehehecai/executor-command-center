// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  GitHubAppInstallationReaderAdapter,
  githubInstallationResponseSchemaVersion,
} from "./github-app-installation-reader";

const activeFixture = {
  id: 81001,
  app_id: 900001,
  account: {
    id: 71001,
    login: "synthetic-installation-user",
    type: "User",
  },
  repository_selection: "selected",
  suspended_at: null,
  access_tokens_url:
    "https://api.github.example.invalid/app/installations/81001/access_tokens",
  repositories_url:
    "https://api.github.example.invalid/installation/repositories",
};

function createReader(
  fetcher: typeof fetch,
  input: { timeoutMilliseconds?: number } = {},
) {
  return new GitHubAppInstallationReaderAdapter({
    jwtSigner: { sign: () => "synthetic-app-jwt" },
    restApiVersion: "2026-03-10",
    fetcher,
    timeoutMilliseconds: input.timeoutMilliseconds ?? 100,
  });
}

describe("GitHub App single-installation reader", () => {
  it("calls only GET /app/installations/{id} with frozen headers and maps minimal fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(activeFixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(createReader(fetcher).getInstallation(81001)).resolves.toEqual(
      {
        installationId: 81001,
        appId: 900001,
        accountId: 71001,
        accountLogin: "synthetic-installation-user",
        accountType: "User",
        repositorySelection: "selected",
        suspendedAt: null,
      },
    );

    expect(githubInstallationResponseSchemaVersion).toBe(
      "github-installation-response.v1",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/app/installations/81001");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer synthetic-app-jwt",
        "x-github-api-version": "2026-03-10",
      },
    });
    expect(String(url)).not.toContain("repositories");
    expect(String(url)).not.toContain("access_tokens");
  });

  it.each([
    [404, "github_installation_not_found"],
    [401, "github_app_authentication_failed"],
    [403, "github_api_forbidden"],
    [429, "github_api_rate_limited"],
    [500, "github_api_unavailable"],
  ])("maps HTTP %i to %s without exposing the response body", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("raw-sensitive-github-error", { status }),
    );

    await expect(createReader(fetcher).getInstallation(81001)).rejects.toThrow(
      code,
    );
    await createReader(fetcher)
      .getInstallation(81001)
      .catch((error: unknown) => {
        expect(String(error)).not.toContain("raw-sensitive-github-error");
      });
  });

  it("maps GitHub's 403 rate-limit response without exposing its body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("raw-sensitive-rate-limit-error", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
        },
      }),
    );

    await expect(createReader(fetcher).getInstallation(81001)).rejects.toThrow(
      "github_api_rate_limited",
    );
  });

  it.each([
    "You have exceeded a secondary rate limit.",
    "API rate limit exceeded for this GitHub App.",
  ])("maps an official 403 rate-limit message without exposing it: %s", async (message) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(createReader(fetcher).getInstallation(81001)).rejects.toThrow(
      "github_api_rate_limited",
    );
  });

  it.each([
    ["malformed JSON", new Response("{", { status: 200 })],
    [
      "unsafe numeric identifier",
      new Response(
        JSON.stringify({ ...activeFixture, id: Number.MAX_SAFE_INTEGER + 1 }),
        { status: 200 },
      ),
    ],
    [
      "unsupported repository selection",
      new Response(
        JSON.stringify({ ...activeFixture, repository_selection: "unknown" }),
        { status: 200 },
      ),
    ],
    [
      "missing account",
      new Response(JSON.stringify({ ...activeFixture, account: undefined }), {
        status: 200,
      }),
    ],
  ])("maps %s to github_api_invalid_response", async (_caseName, response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(createReader(fetcher).getInstallation(81001)).rejects.toThrow(
      "github_api_invalid_response",
    );
  });

  it("maps an aborted fixed timeout and performs no retry", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    await expect(
      createReader(fetcher, { timeoutMilliseconds: 5 }).getInstallation(81001),
    ).rejects.toThrow("github_api_timeout");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the fixed timeout active while reading a response body", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          const complete = setTimeout(() => {
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(activeFixture)),
            );
            controller.close();
          }, 50);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(complete);
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });

      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    await expect(
      createReader(fetcher, { timeoutMilliseconds: 5 }).getInstallation(81001),
    ).rejects.toThrow("github_api_timeout");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an unsafe installation id without calling GitHub: %s",
    async (installationId) => {
      const fetcher = vi.fn<typeof fetch>();

      await expect(
        createReader(fetcher).getInstallation(installationId),
      ).rejects.toThrow("installation_id_invalid");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
