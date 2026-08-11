import "server-only";

import type { GitHubRepositorySelection } from "@/domain/github-installation/github-app-installation";
import { z } from "zod";

export const installationAccessTokenContract =
  "github-installation-access-token.v1" as const;
export const installationTokenRevocationContract =
  "github-installation-token-revocation.v1" as const;

export interface InstallationAccessToken {
  readonly token: string;
  readonly expiresAt: string;
  readonly repositorySelection: GitHubRepositorySelection;
}

type TokenClientOptions = {
  readonly jwtSigner: { sign(): string };
  readonly restApiVersion: string;
  readonly clock: { now(): Date };
  readonly fetcher?: typeof fetch;
  readonly timeoutMilliseconds?: number;
};

const tokenResponseBaseSchema = z.object({
  token: z.string().refine((value) => value.trim().length > 0),
  expires_at: z.iso.datetime({ offset: true }),
  repository_selection: z.enum(["all", "selected"]),
});

const metadataTokenResponseSchema = tokenResponseBaseSchema.extend({
  permissions: z
    .object({
      metadata: z.literal("read"),
    })
    .optional(),
});

const activityTokenResponseSchema = tokenResponseBaseSchema.extend({
  permissions: z
    .object({
      metadata: z.literal("read"),
      contents: z.literal("read"),
      issues: z.literal("read"),
      pull_requests: z.literal("read"),
      actions: z.literal("read"),
    })
    .strict(),
});

const metadataOnlyPermissions = { metadata: "read" } as const;
const activityReadPermissions = {
  metadata: "read",
  contents: "read",
  issues: "read",
  pull_requests: "read",
  actions: "read",
} as const;

const tokenFailureCodes = new Set([
  "github_app_configuration_missing",
  "github_app_authentication_failed",
  "github_installation_token_unauthorized",
  "github_installation_token_forbidden",
  "github_installation_token_not_found",
  "github_installation_token_rate_limited",
  "github_installation_token_timeout",
  "github_installation_token_invalid_response",
  "github_installation_token_unavailable",
]);

function tokenErrorForResponse(response: Response) {
  if (response.status === 401) {
    return "github_installation_token_unauthorized";
  }
  if (response.status === 404) {
    return "github_installation_token_not_found";
  }
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  ) {
    return "github_installation_token_rate_limited";
  }
  if (response.status === 403) {
    return "github_installation_token_forbidden";
  }
  return "github_installation_token_unavailable";
}

function isAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export class GitHubInstallationTokenClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: TokenClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  }

  async create(
    installationId: number,
    operationSignal?: AbortSignal,
  ): Promise<InstallationAccessToken> {
    return this.createForProfile(
      installationId,
      "metadata-only",
      operationSignal,
    );
  }

  async createActivity(
    installationId: number,
    operationSignal?: AbortSignal,
  ): Promise<InstallationAccessToken> {
    return this.createForProfile(
      installationId,
      "activity-read",
      operationSignal,
    );
  }

  private async createForProfile(
    installationId: number,
    profile: "metadata-only" | "activity-read",
    operationSignal?: AbortSignal,
  ): Promise<InstallationAccessToken> {
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      throw new Error("github_installation_token_unavailable");
    }

    const controller = new AbortController();
    const abortOperation = () => controller.abort();
    operationSignal?.addEventListener("abort", abortOperation, {
      once: true,
    });
    if (operationSignal?.aborted) controller.abort();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );

    try {
      const response = await this.fetcher(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.options.jwtSigner.sign()}`,
            "content-type": "application/json",
            "x-github-api-version": this.options.restApiVersion,
          },
          body: JSON.stringify({
            permissions:
              profile === "activity-read"
                ? activityReadPermissions
                : metadataOnlyPermissions,
          }),
          signal: controller.signal,
        },
      );

      if (response.status !== 201) {
        if (response.status >= 200 && response.status < 300) {
          throw new Error(
            "github_installation_token_invalid_response",
          );
        }
        throw new Error(tokenErrorForResponse(response));
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch (error) {
        if (isAbort(error, controller.signal)) throw error;
        throw new Error("github_installation_token_invalid_response");
      }

      const parsed =
        profile === "activity-read"
          ? activityTokenResponseSchema.safeParse(payload)
          : metadataTokenResponseSchema.safeParse(payload);
      const expiresAt = parsed.success
        ? Date.parse(parsed.data.expires_at)
        : Number.NaN;

      if (
        !parsed.success ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= this.options.clock.now().getTime()
      ) {
        throw new Error("github_installation_token_invalid_response");
      }

      return {
        token: parsed.data.token,
        expiresAt: parsed.data.expires_at,
        repositorySelection: parsed.data.repository_selection,
      };
    } catch (error) {
      if (isAbort(error, controller.signal)) {
        throw new Error("github_installation_token_timeout");
      }
      if (
        error instanceof Error &&
        tokenFailureCodes.has(error.message)
      ) {
        throw error;
      }
      throw new Error("github_installation_token_unavailable");
    } finally {
      clearTimeout(timeout);
      operationSignal?.removeEventListener("abort", abortOperation);
    }
  }

  async revoke(token: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMilliseconds,
    );

    try {
      const response = await this.fetcher(
        "https://api.github.com/installation/token",
        {
          method: "DELETE",
          redirect: "error",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "x-github-api-version": this.options.restApiVersion,
          },
          signal: controller.signal,
        },
      );

      if (response.status !== 204) {
        throw new Error("github_installation_token_revoke_failed");
      }
    } catch {
      throw new Error("github_installation_token_revoke_failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}
