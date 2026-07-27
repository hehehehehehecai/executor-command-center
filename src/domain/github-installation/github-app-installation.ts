export type GitHubInstallationStatus =
  | "active"
  | "suspended"
  | "revoked";

export type GitHubRepositorySelection = "all" | "selected";

export interface GitHubAppInstallationSnapshot {
  readonly installationId: number;
  readonly appId: number;
  readonly accountId: number;
  readonly accountLogin: string;
  readonly accountType: string;
  readonly repositorySelection: GitHubRepositorySelection;
  readonly suspendedAt: string | null;
}

export interface GitHubAppInstallationReader {
  getInstallation(
    installationId: number,
  ): Promise<GitHubAppInstallationSnapshot>;
}
