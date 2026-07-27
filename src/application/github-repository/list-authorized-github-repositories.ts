import type {
  AuthorizedRepositoryList,
  CurrentGitHubInstallationQuery,
  GitHubAuthorizedRepositoryGateway,
} from "@/domain/github-repository/authorized-github-repository";

type VerifiedSessionReader = {
  getVerifiedUserId(): Promise<string | null>;
};

type Dependencies = {
  readonly sessionReader: VerifiedSessionReader;
  readonly installationQuery: CurrentGitHubInstallationQuery;
  readonly repositoryGateway: GitHubAuthorizedRepositoryGateway;
};

export class ListAuthorizedGitHubRepositories {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(): Promise<AuthorizedRepositoryList> {
    const userId =
      await this.dependencies.sessionReader.getVerifiedUserId();

    if (!userId) {
      throw new Error("unauthenticated");
    }

    let installation;

    try {
      installation =
        await this.dependencies.installationQuery.findByUserId(userId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "github_app_configuration_missing"
      ) {
        throw error;
      }
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

    return this.dependencies.repositoryGateway.listAllForInstallation(
      installation.installationId,
    );
  }
}
