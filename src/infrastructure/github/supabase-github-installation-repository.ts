import "server-only";

import type { GitHubInstallationStateRepository } from "@/application/github-installation/installation-state";
import type {
  GitHubIdentityReader,
  GitHubInstallationRepository,
} from "@/application/github-installation/register-github-installation";

type RepositoryOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

function responseMessage(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return null;
}

export class SupabaseGitHubInstallationRepository
  implements
    GitHubInstallationStateRepository,
    GitHubIdentityReader,
    GitHubInstallationRepository
{
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: RepositoryOptions) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers(contentType = false) {
    return {
      apikey: this.options.serviceRoleKey,
      authorization: `Bearer ${this.options.serviceRoleKey}`,
      ...(contentType ? { "content-type": "application/json" } : {}),
    };
  }

  private async rpc(name: string, body: Record<string, unknown>) {
    const response = await this.fetcher(
      new URL(`rpc/${name}`, this.baseUrl).toString(),
      {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify(body),
      },
    );
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    return { response, payload };
  }

  async create(
    input: Parameters<GitHubInstallationStateRepository["create"]>[0],
  ) {
    const { response, payload } = await this.rpc(
      "create_github_installation_state",
      {
        p_user_id: input.userId,
        p_state_hash: input.stateHash,
        p_return_to: input.returnTo,
        p_expires_at: input.expiresAt,
      },
    );

    if (!response.ok || typeof payload !== "string") {
      throw new Error("installation_state_persistence_failed");
    }

    return { stateRecordId: payload };
  }

  async consume(
    input: Parameters<GitHubInstallationStateRepository["consume"]>[0],
  ) {
    const { response, payload } = await this.rpc(
      "consume_github_installation_state",
      {
        p_user_id: input.userId,
        p_state_hash: input.stateHash,
      },
    );

    if (!response.ok || typeof payload !== "string") {
      const message = responseMessage(payload);
      const allowedMessages = new Set([
        "installation_state_invalid",
        "installation_state_expired",
        "installation_state_replayed",
        "installation_state_wrong_user",
      ]);

      throw new Error(
        message && allowedMessages.has(message)
          ? message
          : "installation_state_invalid",
      );
    }

    return { returnTo: payload };
  }

  async findByUserId(userId: string) {
    const { response, payload } = await this.rpc(
      "read_current_github_identity",
      { p_user_id: userId },
    );

    if (!response.ok) {
      throw new Error("current_github_identity_read_failed");
    }

    if (payload === null) {
      return null;
    }

    if (
      typeof payload !== "number" ||
      !Number.isSafeInteger(payload) ||
      payload <= 0
    ) {
      throw new Error("current_github_identity_read_failed");
    }

    return { githubUserId: payload };
  }

  async registerVerified(
    input: Parameters<GitHubInstallationRepository["registerVerified"]>[0],
  ) {
    const { response, payload } = await this.rpc(
      "register_verified_github_installation",
      {
        p_user_id: input.userId,
        p_installation_id: input.installationId,
        p_github_account_id: input.githubAccountId,
        p_github_account_login: input.githubAccountLogin,
        p_account_type: input.accountType,
        p_repository_selection: input.repositorySelection,
        p_status: input.status,
        p_suspended_at: input.suspendedAt,
        p_verified_at: input.verifiedAt,
      },
    );

    if (!response.ok) {
      const message = responseMessage(payload);
      const allowedMessages = new Set([
        "github_installation_already_bound",
        "installation_account_mismatch",
        "current_github_identity_missing",
      ]);

      throw new Error(
        message && allowedMessages.has(message)
          ? message
          : "installation_persistence_failed",
      );
    }

    if (typeof payload !== "string") {
      throw new Error("installation_persistence_failed");
    }

    return { installationRecordId: payload };
  }
}
