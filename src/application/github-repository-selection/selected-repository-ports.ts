import type { AuthorizedGitHubRepository } from "@/domain/github-repository/authorized-github-repository";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";

export interface SelectedRepositoryWriter {
  ensureSelected(input: {
    readonly userId: string;
    readonly githubInstallationId: string;
    readonly repository: AuthorizedGitHubRepository;
  }): Promise<SelectedGitHubRepository>;

  removeSelection(input: {
    readonly userId: string;
    readonly repositoryId: number;
  }): Promise<void>;
}

export interface SelectedRepositoryReader {
  listOwn(): Promise<readonly SelectedGitHubRepository[]>;
}

export interface CurrentSelectionInstallation {
  readonly githubInstallationId: string;
  readonly installationId: number;
  readonly status: "active" | "suspended" | "revoked";
}

export interface CurrentSelectionInstallationQuery {
  findByUserId(
    userId: string,
  ): Promise<CurrentSelectionInstallation | null>;
}
