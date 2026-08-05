import {
  assertSyncStatusTransition,
  isSyncStatus,
  type SyncRun,
  type SyncStatus,
} from "@/domain/synchronization/synchronization-state";

export interface CreateSyncRunInput {
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly triggerSource: string;
}

export interface TransitionSyncRunInput {
  readonly projectId: string;
  readonly runId: string;
  readonly expectedStatus: SyncStatus;
  readonly expectedVersion: number;
  readonly targetStatus: SyncStatus;
  readonly transitionedAt: string;
  readonly progressCursor: string | null;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
}

export interface SyncRunRepository {
  createQueued(input: CreateSyncRunInput): Promise<SyncRun>;
  getLatest(projectId: string): Promise<SyncRun | null>;
  transition(input: TransitionSyncRunInput): Promise<SyncRun>;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorCodePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function invalidRequest(): Error {
  return new Error("sync_run_invalid_request");
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw invalidRequest();
  return value;
}

function boundedText(value: unknown, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value
  ) {
    throw invalidRequest();
  }
  return value;
}

function nullableText(value: unknown, maxLength: number): string | null {
  return value === null ? null : boundedText(value, maxLength);
}

function dateTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw invalidRequest();
  }
  return value;
}

function parseCreateInput(value: unknown): CreateSyncRunInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidRequest();
  }
  const input = value as Record<string, unknown>;
  return {
    projectId: uuid(input.projectId),
    idempotencyKey: boundedText(input.idempotencyKey, 255),
    triggerSource: boundedText(input.triggerSource, 100),
  };
}

function parseTransitionInput(value: unknown): TransitionSyncRunInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidRequest();
  }
  const input = value as Record<string, unknown>;
  if (
    !isSyncStatus(input.expectedStatus) ||
    !isSyncStatus(input.targetStatus) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 1
  ) {
    throw invalidRequest();
  }
  const errorCode = nullableText(input.errorCode, 128);
  const errorSummary = nullableText(input.errorSummary, 500);
  if (
    (input.targetStatus === "failed" && (!errorCode || !errorCodePattern.test(errorCode))) ||
    (input.targetStatus !== "failed" && (errorCode !== null || errorSummary !== null))
  ) {
    throw invalidRequest();
  }
  return {
    projectId: uuid(input.projectId),
    runId: uuid(input.runId),
    expectedStatus: input.expectedStatus,
    expectedVersion: Number(input.expectedVersion),
    targetStatus: input.targetStatus,
    transitionedAt: dateTime(input.transitionedAt),
    progressCursor: nullableText(input.progressCursor, 2000),
    errorCode,
    errorSummary,
  };
}

export class CreateQueuedSyncRun {
  constructor(private readonly repository: Pick<SyncRunRepository, "createQueued">) {}

  async execute(input: unknown): Promise<SyncRun> {
    return await this.repository.createQueued(parseCreateInput(input));
  }
}

export class GetLatestSyncRun {
  constructor(private readonly repository: Pick<SyncRunRepository, "getLatest">) {}

  async execute(projectId: string): Promise<SyncRun | null> {
    return await this.repository.getLatest(uuid(projectId));
  }
}

export class TransitionSyncRun {
  constructor(private readonly repository: Pick<SyncRunRepository, "transition">) {}

  async execute(input: unknown): Promise<SyncRun> {
    const command = parseTransitionInput(input);
    assertSyncStatusTransition(command.expectedStatus, command.targetStatus);
    return await this.repository.transition(command);
  }
}
