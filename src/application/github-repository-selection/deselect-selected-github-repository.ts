import type { SelectedRepositoryWriter } from "./selected-repository-ports";

type VerifiedSessionReader = {
  getVerifiedUserId(): Promise<string | null>;
};

type Dependencies = {
  readonly sessionReader: VerifiedSessionReader;
  readonly writer: SelectedRepositoryWriter;
};

export class DeselectSelectedGitHubRepository {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: { readonly repositoryId: number }): Promise<void> {
    if (
      !Number.isSafeInteger(input.repositoryId) ||
      input.repositoryId <= 0
    ) {
      throw new Error("github_repository_selection_invalid_request");
    }

    const userId =
      await this.dependencies.sessionReader.getVerifiedUserId();

    if (!userId) {
      throw new Error("unauthenticated");
    }

    try {
      await this.dependencies.writer.removeSelection({
        userId,
        repositoryId: input.repositoryId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "github_repository_selection_active_project_conflict"
      ) {
        throw new Error(
          "github_repository_selection_active_project_conflict",
          { cause: error },
        );
      }
      throw new Error("github_repository_deselection_failed", {
        cause: error,
      });
    }
  }
}
