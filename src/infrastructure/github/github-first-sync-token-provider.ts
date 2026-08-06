import "server-only";

import type { FirstSyncInstallationTokenProvider } from "@/application/synchronization/first-sync-use-cases";
import type {
  GitHubInstallationTokenClient,
} from "./github-installation-token-client";

const errorMap = new Map([
  ["github_installation_token_unauthorized", "github_activity_authorization_revoked"],
  ["github_installation_token_forbidden", "github_activity_authorization_revoked"],
  ["github_installation_token_not_found", "github_activity_authorization_revoked"],
  ["github_installation_token_rate_limited", "github_activity_rate_limited"],
  ["github_installation_token_timeout", "github_activity_timeout"],
  ["github_installation_token_unavailable", "github_activity_unavailable"],
]);

export class GitHubFirstSyncTokenProvider implements FirstSyncInstallationTokenProvider {
  constructor(
    private readonly client: Pick<GitHubInstallationTokenClient, "create">,
  ) {}

  async issue(input: {
    readonly installationId: number;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly token: string; readonly expiresAt: string }> {
    try {
      const issued = await this.client.create(input.installationId, input.signal);
      return { token: issued.token, expiresAt: issued.expiresAt };
    } catch (error) {
      const source = error instanceof Error ? error.message : "";
      throw new Error(errorMap.get(source) ?? "github_activity_unavailable");
    }
  }
}
