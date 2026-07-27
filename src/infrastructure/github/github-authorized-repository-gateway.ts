import "server-only";

import type { GitHubRepositorySelection } from "@/domain/github-installation/github-app-installation";
import type {
  AuthorizedRepositoryList,
  GitHubAuthorizedRepositoryGateway,
} from "@/domain/github-repository/authorized-github-repository";
import type { InstallationAccessToken } from "./github-installation-token-client";

export const repositoryOperationTimeoutMilliseconds = 30_000;

type TokenClient = {
  create(
    installationId: number,
    operationSignal?: AbortSignal,
  ): Promise<InstallationAccessToken>;
  revoke(token: string): Promise<void>;
};

type RepositoryReader = {
  listAll(
    token: string,
    repositorySelection: GitHubRepositorySelection,
    operationSignal?: AbortSignal,
  ): Promise<AuthorizedRepositoryList>;
};

type SecondaryFailure = {
  readonly failureCode: "github_installation_token_revoke_failed";
  readonly primaryFailureCode: string;
};

type GatewayOptions = {
  readonly tokenClient: TokenClient;
  readonly repositoryReader: RepositoryReader;
  readonly operationTimeoutMilliseconds?: number;
  readonly onSecondaryFailure?: (failure: SecondaryFailure) => void;
};

const repositoryFailureCodes = new Set([
  "github_repository_list_unauthorized",
  "github_repository_list_forbidden",
  "github_repository_list_rate_limited",
  "github_repository_list_timeout",
  "github_repository_list_invalid_response",
  "github_repository_list_unavailable",
  "github_repository_pagination_inconsistent",
  "github_repository_pagination_limit_exceeded",
]);

function normalizedRepositoryFailure(error: unknown) {
  if (
    error instanceof Error &&
    repositoryFailureCodes.has(error.message)
  ) {
    return error;
  }

  return new Error("github_repository_list_failed");
}

export class GitHubAuthorizedRepositoryGatewayAdapter
  implements GitHubAuthorizedRepositoryGateway
{
  constructor(private readonly options: GatewayOptions) {}

  async listAllForInstallation(
    installationId: number,
  ): Promise<AuthorizedRepositoryList> {
    const operationController = new AbortController();
    const operationTimeout = setTimeout(
      () => operationController.abort(),
      this.options.operationTimeoutMilliseconds ??
        repositoryOperationTimeoutMilliseconds,
    );

    try {
      const accessToken = await this.options.tokenClient.create(
        installationId,
        operationController.signal,
      );
      let token: string | null = accessToken.token;
      let result: AuthorizedRepositoryList | null = null;
      let primaryFailure: Error | null = null;

      try {
        result = await this.options.repositoryReader.listAll(
          token,
          accessToken.repositorySelection,
          operationController.signal,
        );
      } catch (error) {
        primaryFailure = normalizedRepositoryFailure(error);
      } finally {
        const tokenToRevoke = token;
        token = null;

        try {
          await this.options.tokenClient.revoke(tokenToRevoke);
        } catch {
          if (primaryFailure) {
            this.options.onSecondaryFailure?.({
              failureCode:
                "github_installation_token_revoke_failed",
              primaryFailureCode: primaryFailure.message,
            });
          } else {
            primaryFailure = new Error(
              "github_installation_token_revoke_failed",
            );
          }
        }
      }

      if (primaryFailure) {
        throw primaryFailure;
      }

      if (!result) {
        throw new Error("github_repository_list_failed");
      }

      return result;
    } finally {
      clearTimeout(operationTimeout);
    }
  }
}
