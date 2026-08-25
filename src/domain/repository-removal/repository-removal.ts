export const repositoryRemovalModes = [
  "REMOVE_REPOSITORY_DATA",
  "DELETE_PROJECT_SUBTREE",
] as const;

export type RepositoryRemovalMode = (typeof repositoryRemovalModes)[number];

export type RepositoryRemovalErrorCode =
  | "repository_removal_confirmation_mismatch"
  | "repository_removal_not_found"
  | "repository_removal_conflict"
  | "repository_removal_precondition_failed"
  | "repository_removal_retryable_job_conflict"
  | "repository_removal_storage_failed";

export interface RepositoryRemovalCommand {
  readonly projectId: string;
  readonly mode: RepositoryRemovalMode;
  readonly idempotencyKey: string;
  readonly confirmation: {
    readonly projectId: string;
    readonly text: string;
  };
}

export interface RepositoryRemovalCounts {
  readonly deleted: Readonly<Record<string, number>>;
  readonly preserved: Readonly<Record<string, number>>;
  readonly invalidated: Readonly<Record<string, number>>;
}

export interface RepositoryRemovalResult {
  readonly operationId: string;
  readonly projectId: string;
  readonly mode: RepositoryRemovalMode;
  readonly status: "completed";
  readonly outcome: "executed" | "replayed";
  readonly counts: RepositoryRemovalCounts;
  readonly safelyRetryable: true;
  readonly completedAt: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;

function invalidRequest(): Error {
  return new Error("repository_removal_invalid_request");
}

function isMode(value: unknown): value is RepositoryRemovalMode {
  return repositoryRemovalModes.some((mode) => mode === value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

export function repositoryRemovalConfirmationText(
  mode: RepositoryRemovalMode,
  projectId: string,
): string {
  return `${mode === "REMOVE_REPOSITORY_DATA" ? "REMOVE" : "DELETE"} ${projectId}`;
}

export function parseRepositoryRemovalCommand(
  value: unknown,
): RepositoryRemovalCommand {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidRequest();
  }

  const input = value as Record<string, unknown>;
  const confirmation = input.confirmation;
  if (
    !hasExactKeys(input, [
      "projectId",
      "mode",
      "idempotencyKey",
      "confirmation",
    ]) ||
    typeof input.projectId !== "string" ||
    !uuidPattern.test(input.projectId) ||
    !isMode(input.mode) ||
    typeof input.idempotencyKey !== "string" ||
    !idempotencyKeyPattern.test(input.idempotencyKey) ||
    typeof confirmation !== "object" ||
    confirmation === null ||
    Array.isArray(confirmation)
  ) {
    throw invalidRequest();
  }

  const confirmationRecord = confirmation as Record<string, unknown>;
  if (
    !hasExactKeys(confirmationRecord, ["projectId", "text"]) ||
    confirmationRecord.projectId !== input.projectId ||
    confirmationRecord.text !==
      repositoryRemovalConfirmationText(input.mode, input.projectId)
  ) {
    throw new Error("repository_removal_confirmation_mismatch");
  }

  return {
    projectId: input.projectId,
    mode: input.mode,
    idempotencyKey: input.idempotencyKey,
    confirmation: {
      projectId: input.projectId,
      text: confirmationRecord.text as string,
    },
  };
}
