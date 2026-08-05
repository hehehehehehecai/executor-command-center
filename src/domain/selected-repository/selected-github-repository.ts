import type { GitHubRepositoryVisibility } from "@/domain/github-repository/authorized-github-repository";

export const selectedGitHubRepositoryContract =
  "selected-github-repository.v1" as const;

export type RepositoryCalibrationStatus = "pending";

export interface SelectedGitHubRepository {
  readonly repositoryId: number;
  readonly ownerLogin: string;
  readonly name: string;
  readonly fullName: string;
  readonly visibility: GitHubRepositoryVisibility;
  readonly isPrivate: boolean;
  readonly isFork: boolean;
  readonly isArchived: boolean;
  readonly isDisabled: boolean;
  readonly defaultBranch: string;
  readonly selectedAt: string;
  readonly updatedAt: string;
  readonly calibrationStatus: RepositoryCalibrationStatus;
}
