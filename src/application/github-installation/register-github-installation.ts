import type {
  GitHubAppInstallationReader,
  GitHubInstallationStatus,
  GitHubRepositorySelection,
} from "@/domain/github-installation/github-app-installation";
import {
  ConsumeGitHubInstallationState,
  type GitHubInstallationStateRepository,
} from "./installation-state";

export const githubInstallationRegistrationContractVersion =
  "github-installation-registration.v1" as const;
export const githubInstallationStorageContractVersion =
  "github-installation-storage.v1" as const;

export interface GitHubIdentityReader {
  findByUserId(
    userId: string,
  ): Promise<{ githubUserId: number } | null>;
}

export interface GitHubInstallationRepository {
  registerVerified(input: {
    userId: string;
    installationId: number;
    githubAccountId: number;
    githubAccountLogin: string;
    accountType: "User";
    repositorySelection: GitHubRepositorySelection;
    status: "active" | "suspended";
    suspendedAt: string | null;
    verifiedAt: string;
  }): Promise<{ installationRecordId: string }>;
}

type RegistrationDependencies = {
  readonly stateRepository: GitHubInstallationStateRepository;
  readonly installationReader: GitHubAppInstallationReader;
  readonly identityReader: GitHubIdentityReader;
  readonly installationRepository: GitHubInstallationRepository;
  readonly configuredAppId: string;
  readonly clock: { now(): Date };
};

function parseInstallationId(value: string | null) {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error("installation_id_invalid");
  }

  const installationId = Number(value);

  if (!Number.isSafeInteger(installationId)) {
    throw new Error("installation_id_invalid");
  }

  return installationId;
}

function parseConfiguredAppId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("github_app_configuration_missing");
  }

  const appId = Number(value);

  if (!Number.isSafeInteger(appId)) {
    throw new Error("github_app_configuration_missing");
  }

  return appId;
}

export class CompleteGitHubInstallationRegistration {
  private readonly stateConsumer: ConsumeGitHubInstallationState;

  constructor(private readonly dependencies: RegistrationDependencies) {
    this.stateConsumer = new ConsumeGitHubInstallationState(
      dependencies.stateRepository,
    );
  }

  async execute(input: {
    readonly userId: string;
    readonly rawState: string | null;
    readonly installationId: string | null;
  }): Promise<{
    installationRecordId: string;
    installationStatus: Exclude<GitHubInstallationStatus, "revoked">;
    redirectTo: string;
  }> {
    const { returnTo } = await this.stateConsumer.execute({
      userId: input.userId,
      rawState: input.rawState,
    });
    const installationId = parseInstallationId(input.installationId);
    const snapshot =
      await this.dependencies.installationReader.getInstallation(
        installationId,
      );

    if (snapshot.installationId !== installationId) {
      throw new Error("installation_id_mismatch");
    }

    if (snapshot.appId !== parseConfiguredAppId(
      this.dependencies.configuredAppId,
    )) {
      throw new Error("installation_app_mismatch");
    }

    if (snapshot.accountType !== "User") {
      throw new Error("unsupported_installation_account_type");
    }

    const identity = await this.dependencies.identityReader.findByUserId(
      input.userId,
    );

    if (!identity) {
      throw new Error("current_github_identity_missing");
    }

    if (snapshot.accountId !== identity.githubUserId) {
      throw new Error("installation_account_mismatch");
    }

    const status = snapshot.suspendedAt === null ? "active" : "suspended";
    const result =
      await this.dependencies.installationRepository.registerVerified({
        userId: input.userId,
        installationId,
        githubAccountId: snapshot.accountId,
        githubAccountLogin: snapshot.accountLogin,
        accountType: "User",
        repositorySelection: snapshot.repositorySelection,
        status,
        suspendedAt: snapshot.suspendedAt,
        verifiedAt: this.dependencies.clock.now().toISOString(),
      });

    return {
      installationRecordId: result.installationRecordId,
      installationStatus: status,
      redirectTo: returnTo,
    };
  }
}
