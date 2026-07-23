import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

import { safeReturnTo } from "@/application/auth/safe-return-to";

export const githubInstallationStateContract = {
  contractVersion: "github-installation-state.v1",
  rawStateBytes: 32,
  encoding: "base64url",
  storedValue: "sha256(raw_state)",
  hashAlgorithm: "sha256",
  ttlMilliseconds: 10 * 60 * 1_000,
  singleUse: true,
  userBound: true,
  returnToValidated: true,
} as const;

export interface GitHubInstallationStateRepository {
  create(input: {
    userId: string;
    stateHash: string;
    returnTo: string;
    expiresAt: string;
  }): Promise<{ stateRecordId: string }>;
  consume(input: {
    userId: string;
    stateHash: string;
  }): Promise<{ returnTo: string }>;
}

type StateDependencies = {
  readonly now: () => Date;
  readonly randomBytes: () => Uint8Array;
};

const defaultDependencies: StateDependencies = {
  now: () => new Date(),
  randomBytes: () => nodeRandomBytes(githubInstallationStateContract.rawStateBytes),
};

function hashState(rawState: string) {
  return createHash("sha256").update(rawState, "utf8").digest("hex");
}

export class CreateGitHubInstallationState {
  constructor(
    private readonly repository: GitHubInstallationStateRepository,
    private readonly dependencies: StateDependencies = defaultDependencies,
  ) {}

  async execute(input: {
    readonly userId: string;
    readonly returnTo: string | null | undefined;
  }) {
    const bytes = this.dependencies.randomBytes();

    if (bytes.byteLength !== githubInstallationStateContract.rawStateBytes) {
      throw new Error("installation_state_generation_failed");
    }

    const rawState = Buffer.from(bytes).toString("base64url");
    const returnTo = safeReturnTo(input.returnTo);
    const expiresAt = new Date(
      this.dependencies.now().getTime() +
        githubInstallationStateContract.ttlMilliseconds,
    ).toISOString();

    await this.repository.create({
      userId: input.userId,
      stateHash: hashState(rawState),
      returnTo,
      expiresAt,
    });

    return { rawState, returnTo };
  }
}

export class ConsumeGitHubInstallationState {
  constructor(
    private readonly repository: GitHubInstallationStateRepository,
  ) {}

  async execute(input: {
    readonly userId: string;
    readonly rawState: string | null;
  }) {
    if (!input.rawState) {
      throw new Error("installation_state_missing");
    }

    if (!/^[A-Za-z0-9_-]{43}$/.test(input.rawState)) {
      throw new Error("installation_state_invalid");
    }

    return this.repository.consume({
      userId: input.userId,
      stateHash: hashState(input.rawState),
    });
  }
}
