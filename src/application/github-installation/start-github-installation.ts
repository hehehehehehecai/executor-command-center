import { randomBytes as nodeRandomBytes } from "node:crypto";

import {
  CreateGitHubInstallationState,
  githubInstallationStateContract,
  type GitHubInstallationStateRepository,
} from "./installation-state";

export interface VerifiedSessionReader {
  getVerifiedUserId(): Promise<string | null>;
}

type StartDependencies = {
  readonly sessionReader: VerifiedSessionReader;
  readonly stateRepository: GitHubInstallationStateRepository;
  readonly configuredAppSlug: string;
  readonly clock?: { now(): Date };
  readonly randomBytes?: () => Uint8Array;
};

export class StartGitHubInstallation {
  constructor(private readonly dependencies: StartDependencies) {}

  async execute(input: {
    readonly returnTo: string | null | undefined;
  }) {
    const userId =
      await this.dependencies.sessionReader.getVerifiedUserId();

    if (!userId) {
      throw new Error("unauthenticated");
    }

    if (
      !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(
        this.dependencies.configuredAppSlug,
      )
    ) {
      throw new Error("github_app_configuration_missing");
    }

    const stateCreator = new CreateGitHubInstallationState(
      this.dependencies.stateRepository,
      {
        now: () => this.dependencies.clock?.now() ?? new Date(),
        randomBytes: () =>
          this.dependencies.randomBytes?.() ??
          nodeRandomBytes(githubInstallationStateContract.rawStateBytes),
      },
    );
    const state = await stateCreator.execute({
      userId,
      returnTo: input.returnTo,
    });
    const installationUrl = new URL(
      `https://github.com/apps/${this.dependencies.configuredAppSlug}/installations/new`,
    );
    installationUrl.searchParams.set("state", state.rawState);

    return {
      installationUrl: installationUrl.toString(),
      callbackState: state.rawState,
    };
  }
}
