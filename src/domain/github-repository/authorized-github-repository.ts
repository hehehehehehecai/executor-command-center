import type {
  GitHubInstallationStatus,
  GitHubRepositorySelection,
} from "@/domain/github-installation/github-app-installation";

export const currentGitHubInstallationQueryContract =
  "current-github-installation-query.v1" as const;
export const authorizedRepositoryListContract =
  "github-authorized-repository-list.v1" as const;

export type GitHubRepositoryVisibility =
  | "public"
  | "private"
  | "internal";

export interface AuthorizedGitHubRepository {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly ownerLogin: string;
  readonly isPrivate: boolean;
  readonly isFork: boolean;
  readonly isArchived: boolean;
  readonly isDisabled: boolean;
  readonly visibility: GitHubRepositoryVisibility;
  readonly defaultBranch: string;
}

export interface AuthorizedRepositoryList {
  readonly repositorySelection: GitHubRepositorySelection;
  readonly totalCount: number;
  readonly repositories: readonly AuthorizedGitHubRepository[];
  readonly loadedAt: string;
}

export interface CurrentGitHubInstallation {
  readonly installationId: number;
  readonly repositorySelection: GitHubRepositorySelection;
  readonly status: GitHubInstallationStatus;
}

export interface CurrentGitHubInstallationQuery {
  findByUserId(userId: string): Promise<CurrentGitHubInstallation | null>;
}

export interface GitHubAuthorizedRepositoryGateway {
  listAllForInstallation(
    installationId: number,
  ): Promise<AuthorizedRepositoryList>;
}
