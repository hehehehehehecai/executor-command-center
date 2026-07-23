import "server-only";

import type {
  GitHubAppInstallationReader,
  GitHubAppInstallationSnapshot,
} from "@/domain/github-installation/github-app-installation";
import { z } from "zod";

export const githubInstallationResponseSchemaVersion =
  "github-installation-response.v1" as const;

const safePositiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const installationResponseSchema = z.object({
  id: safePositiveInteger,
  app_id: safePositiveInteger,
  account: z.object({
    id: safePositiveInteger,
    login: z.string().trim().min(1).max(255),
    type: z.string().trim().min(1),
  }),
  repository_selection: z.enum(["all", "selected"]),
  suspended_at: z.iso.datetime({ offset: true }).nullable(),
});

type GitHubAppInstallationReaderOptions = {
  readonly jwtSigner: { sign(): string };
  readonly restApiVersion: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMilliseconds?: number;
};

async function hasOfficialRateLimitMessage(
  response: Response,
  signal: AbortSignal,
) {
  const maximumBytes = 4_096;
  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    return false;
  }

  const reader = response.body?.getReader();

  if (!reader) {
    return false;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return false;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
      message?: unknown;
    };
    const message =
      typeof payload.message === "string"
        ? payload.message.toLowerCase()
        : "";

    return (
      message.includes("secondary rate limit") ||
      message.includes("api rate limit exceeded")
    );
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    return false;
  }
}

async function errorForResponse(
  response: Response,
  signal: AbortSignal,
) {
  if (response.status === 404) return "github_installation_not_found";
  if (response.status === 401) return "github_app_authentication_failed";
  if (response.status === 429) {
    return "github_api_rate_limited";
  }
  if (response.status === 403) {
    if (
      response.headers.get("x-ratelimit-remaining") === "0" ||
      response.headers.has("retry-after") ||
      await hasOfficialRateLimitMessage(response, signal)
    ) {
      return "github_api_rate_limited";
    }

    return "github_api_forbidden";
  }
  return "github_api_unavailable";
}

export class GitHubAppInstallationReaderAdapter
  implements GitHubAppInstallationReader
{
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(
    private readonly options: GitHubAppInstallationReaderOptions,
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  }

  async getInstallation(
    installationId: number,
  ): Promise<GitHubAppInstallationSnapshot> {
    if (
      !Number.isSafeInteger(installationId) ||
      installationId <= 0
    ) {
      throw new Error("installation_id_invalid");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.options.restApiVersion)) {
      throw new Error("github_app_configuration_missing");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );

    try {
      const response = await this.fetcher(
        `https://api.github.com/app/installations/${installationId}`,
        {
          method: "GET",
          redirect: "error",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.options.jwtSigner.sign()}`,
            "x-github-api-version": this.options.restApiVersion,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          await errorForResponse(response, controller.signal),
        );
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw error;
        }
        throw new Error("github_api_invalid_response");
      }

      const parsed = installationResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error("github_api_invalid_response");
      }

      return {
        installationId: parsed.data.id,
        appId: parsed.data.app_id,
        accountId: parsed.data.account.id,
        accountLogin: parsed.data.account.login,
        accountType: parsed.data.account.type,
        repositorySelection: parsed.data.repository_selection,
        suspendedAt: parsed.data.suspended_at,
      };
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new Error("github_api_timeout");
      }

      if (
        error instanceof Error &&
        new Set([
          "installation_id_invalid",
          "github_app_configuration_missing",
          "github_app_authentication_failed",
          "github_installation_not_found",
          "github_api_forbidden",
          "github_api_rate_limited",
          "github_api_timeout",
          "github_api_invalid_response",
          "github_api_unavailable",
        ]).has(error.message)
      ) {
        throw error;
      }

      throw new Error("github_api_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}
