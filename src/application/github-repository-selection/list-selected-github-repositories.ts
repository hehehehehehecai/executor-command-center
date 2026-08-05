import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import type { SelectedRepositoryReader } from "./selected-repository-ports";

type VerifiedSessionReader = {
  getVerifiedUserId(): Promise<string | null>;
};

type Dependencies = {
  readonly sessionReader: VerifiedSessionReader;
  readonly reader: SelectedRepositoryReader;
};

function compareSelectedRepositories(
  left: SelectedGitHubRepository,
  right: SelectedGitHubRepository,
): number {
  const leftName = left.fullName.toLowerCase();
  const rightName = right.fullName.toLowerCase();

  if (leftName < rightName) return -1;
  if (leftName > rightName) return 1;
  return left.repositoryId - right.repositoryId;
}

export class ListSelectedGitHubRepositories {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(): Promise<readonly SelectedGitHubRepository[]> {
    const userId =
      await this.dependencies.sessionReader.getVerifiedUserId();

    if (!userId) {
      throw new Error("unauthenticated");
    }

    try {
      const selectedRepositories =
        await this.dependencies.reader.listOwn();
      return [...selectedRepositories].sort(compareSelectedRepositories);
    } catch (error) {
      throw new Error("github_repository_selection_lookup_failed", {
        cause: error,
      });
    }
  }
}
