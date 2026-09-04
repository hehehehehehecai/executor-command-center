import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";

export const stagingVerificationContract = "staging-verification.v1" as const;

export const stagingVerificationOperations = [
  "webhook-replay",
  "reconciliation",
  "provider-failure-retry",
] as const;

export type StagingVerificationOperation =
  (typeof stagingVerificationOperations)[number];

export type StagingVerificationStateRepository = {
  create(input: {
    readonly userId: string;
    readonly stateHash: string;
    readonly returnTo: string;
    readonly expiresAt: string;
  }): Promise<{ readonly stateRecordId: string }>;
  consume(input: {
    readonly userId: string;
    readonly stateHash: string;
  }): Promise<{ readonly returnTo: string }>;
};

export type StagingVerificationTarget = {
  readonly projectId: string;
  readonly installationId: number;
  readonly repositoryFullName: string;
};

type Environment = Readonly<Record<string, string | undefined>>;
type TicketDependencies = {
  readonly now: () => Date;
  readonly randomBytes: () => Uint8Array;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const repository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const caseIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const ticketTtlMilliseconds = 5 * 60 * 1_000;

const defaultDependencies: TicketDependencies = {
  now: () => new Date(),
  randomBytes: () => nodeRandomBytes(32),
};

function failure(code: string, cause?: unknown): Error {
  return new Error(code, cause === undefined ? undefined : { cause });
}

export function parseStagingVerificationOperation(value: string): StagingVerificationOperation {
  if (!(stagingVerificationOperations as readonly string[]).includes(value)) {
    throw failure("staging_verification_operation_invalid");
  }
  return value as StagingVerificationOperation;
}

function assertTicketIdentity(input: {
  readonly userId: string;
  readonly projectId: string;
  readonly caseId: string;
  readonly operation: string;
}) {
  if (
    !uuid.test(input.userId)
    || !uuid.test(input.projectId)
    || !caseIdPattern.test(input.caseId)
  ) {
    throw failure("staging_verification_request_invalid");
  }
  return parseStagingVerificationOperation(input.operation);
}

function expectedReturnTo(input: {
  readonly projectId: string;
  readonly caseId: string;
  readonly operation: StagingVerificationOperation;
}) {
  return `/api/staging-verification/${input.operation}/${input.projectId}/${input.caseId}`;
}

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function mapConsumeError(error: unknown): Error {
  const code = error instanceof Error ? error.message : "";
  const mapped: Readonly<Record<string, string>> = {
    installation_state_invalid: "staging_verification_token_invalid",
    installation_state_expired: "staging_verification_token_expired",
    installation_state_replayed: "staging_verification_token_replayed",
    installation_state_wrong_user: "staging_verification_token_wrong_user",
    staging_verification_token_invalid: "staging_verification_token_invalid",
    staging_verification_token_expired: "staging_verification_token_expired",
    staging_verification_token_replayed: "staging_verification_token_replayed",
    staging_verification_token_wrong_user: "staging_verification_token_wrong_user",
  };
  return failure(mapped[code] ?? "staging_verification_token_invalid", error);
}

export function assertStagingVerificationEnvironment(
  source: Environment,
): StagingVerificationTarget {
  const projectId = source.STAGING_VERIFICATION_PROJECT_ID ?? "";
  const installationId = Number(source.STAGING_VERIFICATION_INSTALLATION_ID);
  const repositoryFullName = source.STAGING_VERIFICATION_REPOSITORY ?? "";
  if (
    source.STAGING_VERIFICATION_ENABLED !== "1"
    || source.VERCEL_ENV !== "preview"
    || source.VERCEL_GIT_COMMIT_REF !== "staging"
    || !uuid.test(projectId)
    || !Number.isSafeInteger(installationId)
    || installationId <= 0
    || !repository.test(repositoryFullName)
  ) {
    throw failure("staging_verification_unavailable");
  }
  return { projectId, installationId, repositoryFullName };
}

export class CreateStagingVerificationTicket {
  constructor(
    private readonly repository: StagingVerificationStateRepository,
    private readonly dependencies: TicketDependencies = defaultDependencies,
  ) {}

  async execute(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly caseId: string;
    readonly operation: StagingVerificationOperation;
  }) {
    const operation = assertTicketIdentity(input);
    const bytes = this.dependencies.randomBytes();
    if (bytes.byteLength !== 32) {
      throw failure("staging_verification_token_generation_failed");
    }
    const rawToken = Buffer.from(bytes).toString("base64url");
    const expiresAt = new Date(
      this.dependencies.now().getTime() + ticketTtlMilliseconds,
    ).toISOString();
    try {
      await this.repository.create({
        userId: input.userId,
        stateHash: hashToken(rawToken),
        returnTo: expectedReturnTo({ ...input, operation }),
        expiresAt,
      });
    } catch (error) {
      throw failure("staging_verification_token_persistence_failed", error);
    }
    return {
      contractVersion: stagingVerificationContract,
      rawToken,
      caseId: input.caseId,
      projectId: input.projectId,
      operation,
    };
  }
}

export class ConsumeStagingVerificationTicket {
  constructor(private readonly repository: StagingVerificationStateRepository) {}

  async execute(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly caseId: string;
    readonly operation: StagingVerificationOperation;
    readonly rawToken: string | null;
  }) {
    const operation = assertTicketIdentity(input);
    if (!input.rawToken || !tokenPattern.test(input.rawToken)) {
      throw failure("staging_verification_token_invalid");
    }
    let consumed: { readonly returnTo: string };
    try {
      consumed = await this.repository.consume({
        userId: input.userId,
        stateHash: hashToken(input.rawToken),
      });
    } catch (error) {
      throw mapConsumeError(error);
    }
    if (consumed.returnTo !== expectedReturnTo({ ...input, operation })) {
      throw failure("staging_verification_token_binding_mismatch");
    }
    return {
      contractVersion: stagingVerificationContract,
      caseId: input.caseId,
      projectId: input.projectId,
      operation,
    };
  }
}
