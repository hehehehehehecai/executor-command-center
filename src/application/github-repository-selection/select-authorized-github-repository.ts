import type { GitHubAuthorizedRepositoryGateway } from "@/domain/github-repository/authorized-github-repository";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import type {
  CurrentSelectionInstallationQuery,
  SelectedRepositoryWriter,
} from "./selected-repository-ports";

type VerifiedSessionReader = {
  getVerifiedUserId(): Promise<string | null>;
};

type Dependencies = {
  readonly sessionReader: VerifiedSessionReader;
  readonly installationQuery: CurrentSelectionInstallationQuery;
  readonly repositoryGateway: GitHubAuthorizedRepositoryGateway;
  readonly writer: SelectedRepositoryWriter;
};

const writerFailureMap = new Map<string, string>([
  [
    "github_repository_selection_installation_not_found",
    "github_installation_not_registered",
  ],
  [
    "github_repository_selection_installation_wrong_user",
    "github_repository_not_authorized",
  ],
  [
    "github_repository_selection_installation_not_active",
    "github_repository_not_authorized",
  ],
  [
    "github_repository_selection_installation_mismatch",
    "github_repository_selection_storage_failed",
  ],
  [
    "github_repository_selection_storage_failed",
    "github_repository_selection_storage_failed",
  ],
]);

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class SelectAuthorizedGitHubRepository {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(input: {
    readonly repositoryId: number;
  }): Promise<SelectedGitHubRepository> {
    if (!isPositiveSafeInteger(input.repositoryId)) {
      throw new Error("github_repository_selection_invalid_request");
    }

    const userId =
      await this.dependencies.sessionReader.getVerifiedUserId();

    if (!userId) {
      throw new Error("unauthenticated");
    }

    let installation;

    try {
      installation =
        await this.dependencies.installationQuery.findByUserId(userId);
    } catch {
      throw new Error("github_installation_lookup_failed");
    }

    if (!installation) {
      throw new Error("github_installation_not_registered");
    }

    if (installation.status === "suspended") {
      throw new Error("github_installation_suspended");
    }

    if (installation.status === "revoked") {
      throw new Error("github_installation_revoked");
    }

    const liveAuthorization =
      await this.dependencies.repositoryGateway.listAllForInstallation(
        installation.installationId,
      );
    const matches = liveAuthorization.repositories.filter(
      (repository) => repository.id === input.repositoryId,
    );

    if (matches.length !== 1) {
      throw new Error("github_repository_not_authorized");
    }

    try {
      return await this.dependencies.writer.ensureSelected({
        userId,
        githubInstallationId: installation.githubInstallationId,
        repository: matches[0]!,
      });
    } catch (error) {
      const mapped =
        error instanceof Error
          ? writerFailureMap.get(error.message)
          : undefined;
      throw new Error(
        mapped ?? "github_repository_selection_storage_failed",
        { cause: error },
      );
    }
  }
}
