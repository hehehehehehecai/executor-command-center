export const firstRepositorySyncContract = "first-repository-sync.v1" as const;
export const firstSyncGroupsContract = "first-sync-groups.v1" as const;
export const firstSyncWindowContract = "first-sync-window-90d.v1" as const;
export const firstSyncCursorContract = "first-sync-cursor.v1" as const;
export const firstSyncReaderContract = "github-activity-reader.v1" as const;
export const firstSyncSnapshotContract = "github-activity-snapshots.v1" as const;
export const firstSyncStateContract = "synchronization-state.v1" as const;

export const firstSyncGroups = [
  "repository",
  "commit",
  "issue",
  "pull_request",
  "release",
  "workflow_run",
] as const;

export type FirstSyncGroupName = (typeof firstSyncGroups)[number];

export type FirstSyncWindow = {
  readonly windowStart: string;
  readonly windowEnd: string;
};

export type FirstSyncJobLineage = {
  readonly jobId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly providerJobId: string;
};

export type FirstSyncGroupFailure = {
  readonly groupName: FirstSyncGroupName;
  readonly code: string;
  readonly retryable: boolean;
};

export type FirstSyncCursor = {
  readonly version: typeof firstSyncCursorContract;
  readonly readerContractVersion: typeof firstSyncReaderContract;
  readonly snapshotContractVersion: typeof firstSyncSnapshotContract;
  readonly syncStateContractVersion: typeof firstSyncStateContract;
  readonly projectId: string;
  readonly syncRunId: string;
  readonly requestId: string;
  readonly repositoryFullName: string;
  readonly installationId: number;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly job: FirstSyncJobLineage;
  readonly completedGroups: readonly FirstSyncGroupName[];
  readonly failedGroup: FirstSyncGroupFailure | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/;
const safeErrorCodePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const cursorKeys = [
  "version",
  "readerContractVersion",
  "snapshotContractVersion",
  "syncStateContractVersion",
  "projectId",
  "syncRunId",
  "requestId",
  "repositoryFullName",
  "installationId",
  "windowStart",
  "windowEnd",
  "job",
  "completedGroups",
  "failedGroup",
] as const;
const jobKeys = ["jobId", "correlationId", "idempotencyKey", "providerJobId"] as const;
const failureKeys = ["groupName", "code", "retryable"] as const;
const groupSet = new Set<string>(firstSyncGroups);

function invalidRequest(): never {
  throw new Error("first_sync_invalid_request");
}

function invalidCursor(): never {
  throw new Error("first_sync_cursor_invalid");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalTimestampPattern.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function groupName(value: unknown): value is FirstSyncGroupName {
  return typeof value === "string" && groupSet.has(value);
}

function validateWindow(windowStart: unknown, windowEnd: unknown): boolean {
  if (!canonicalTimestamp(windowStart) || !canonicalTimestamp(windowEnd)) return false;
  const frozen = freezeFirstSyncWindow(windowEnd);
  return frozen.windowStart === windowStart;
}

export function freezeFirstSyncWindow(windowEnd: string): FirstSyncWindow {
  if (!canonicalTimestamp(windowEnd)) return invalidRequest();
  const start = new Date(windowEnd);
  start.setUTCDate(start.getUTCDate() - 90);
  return { windowStart: start.toISOString(), windowEnd };
}

export function isWithinFirstSyncWindow(
  sourceUpdatedAt: string,
  window: FirstSyncWindow,
): boolean {
  if (!canonicalTimestamp(sourceUpdatedAt) || !validateWindow(window.windowStart, window.windowEnd)) {
    return invalidRequest();
  }
  const source = Date.parse(sourceUpdatedAt);
  return source >= Date.parse(window.windowStart) && source <= Date.parse(window.windowEnd);
}

function validateCursor(value: unknown): FirstSyncCursor {
  if (!record(value) || !exactKeys(value, cursorKeys)) return invalidCursor();
  if (
    value.version !== firstSyncCursorContract ||
    value.readerContractVersion !== firstSyncReaderContract ||
    value.snapshotContractVersion !== firstSyncSnapshotContract ||
    value.syncStateContractVersion !== firstSyncStateContract ||
    typeof value.projectId !== "string" ||
    !uuidPattern.test(value.projectId) ||
    typeof value.syncRunId !== "string" ||
    !uuidPattern.test(value.syncRunId) ||
    typeof value.requestId !== "string" ||
    !requestIdPattern.test(value.requestId) ||
    typeof value.repositoryFullName !== "string" ||
    value.repositoryFullName.trim() !== value.repositoryFullName ||
    value.repositoryFullName.length === 0 ||
    value.repositoryFullName.length > 512 ||
    !value.repositoryFullName.includes("/") ||
    !Number.isSafeInteger(value.installationId) ||
    Number(value.installationId) <= 0 ||
    !validateWindow(value.windowStart, value.windowEnd) ||
    !record(value.job) ||
    !exactKeys(value.job, jobKeys) ||
    typeof value.job.jobId !== "string" ||
    !uuidPattern.test(value.job.jobId) ||
    typeof value.job.correlationId !== "string" ||
    !safeIdentifierPattern.test(value.job.correlationId) ||
    typeof value.job.idempotencyKey !== "string" ||
    !safeIdentifierPattern.test(value.job.idempotencyKey) ||
    typeof value.job.providerJobId !== "string" ||
    !safeIdentifierPattern.test(value.job.providerJobId) ||
    !Array.isArray(value.completedGroups)
  ) {
    return invalidCursor();
  }

  const completedGroups = value.completedGroups as unknown[];
  if (
    completedGroups.some((group) => !groupName(group)) ||
    new Set(completedGroups).size !== completedGroups.length ||
    completedGroups.some((group, index) => firstSyncGroups[index] !== group)
  ) {
    return invalidCursor();
  }

  let failedGroup: FirstSyncGroupFailure | null = null;
  if (value.failedGroup !== null) {
    if (
      !record(value.failedGroup) ||
      !exactKeys(value.failedGroup, failureKeys) ||
      !groupName(value.failedGroup.groupName) ||
      completedGroups.includes(value.failedGroup.groupName) ||
      firstSyncGroups[completedGroups.length] !== value.failedGroup.groupName ||
      typeof value.failedGroup.code !== "string" ||
      !safeErrorCodePattern.test(value.failedGroup.code) ||
      value.failedGroup.code.length > 128 ||
      typeof value.failedGroup.retryable !== "boolean"
    ) {
      return invalidCursor();
    }
    failedGroup = {
      groupName: value.failedGroup.groupName,
      code: value.failedGroup.code,
      retryable: value.failedGroup.retryable,
    };
  }

  return {
    version: firstSyncCursorContract,
    readerContractVersion: firstSyncReaderContract,
    snapshotContractVersion: firstSyncSnapshotContract,
    syncStateContractVersion: firstSyncStateContract,
    projectId: value.projectId,
    syncRunId: value.syncRunId,
    requestId: value.requestId,
    repositoryFullName: value.repositoryFullName,
    installationId: Number(value.installationId),
    windowStart: value.windowStart as string,
    windowEnd: value.windowEnd as string,
    job: {
      jobId: value.job.jobId,
      correlationId: value.job.correlationId,
      idempotencyKey: value.job.idempotencyKey,
      providerJobId: value.job.providerJobId,
    },
    completedGroups: completedGroups as FirstSyncGroupName[],
    failedGroup,
  };
}

export function createFirstSyncCursor(input: Omit<FirstSyncCursor, "version" | "readerContractVersion" | "snapshotContractVersion" | "syncStateContractVersion" | "windowStart" | "windowEnd" | "completedGroups" | "failedGroup"> & {
  readonly window: FirstSyncWindow;
}): FirstSyncCursor {
  return validateCursor({
    version: firstSyncCursorContract,
    readerContractVersion: firstSyncReaderContract,
    snapshotContractVersion: firstSyncSnapshotContract,
    syncStateContractVersion: firstSyncStateContract,
    projectId: input.projectId,
    syncRunId: input.syncRunId,
    requestId: input.requestId,
    repositoryFullName: input.repositoryFullName,
    installationId: input.installationId,
    windowStart: input.window.windowStart,
    windowEnd: input.window.windowEnd,
    job: input.job,
    completedGroups: [],
    failedGroup: null,
  });
}

export function serializeFirstSyncCursor(cursor: FirstSyncCursor): string {
  const encoded = JSON.stringify(validateCursor(cursor));
  if (encoded.length > 2_000) return invalidCursor();
  return encoded;
}

export function parseFirstSyncCursor(value: string): FirstSyncCursor {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000) {
    return invalidCursor();
  }
  try {
    return validateCursor(JSON.parse(value));
  } catch (error) {
    if (error instanceof Error && error.message === "first_sync_cursor_invalid") throw error;
    return invalidCursor();
  }
}

export function completeFirstSyncGroup(
  cursor: FirstSyncCursor,
  group: FirstSyncGroupName,
): FirstSyncCursor {
  const valid = validateCursor(cursor);
  if (!groupName(group)) return invalidCursor();
  if (valid.completedGroups.includes(group)) return valid;
  if (firstSyncGroups[valid.completedGroups.length] !== group) return invalidCursor();
  return validateCursor({
    ...valid,
    completedGroups: [...valid.completedGroups, group],
    failedGroup: null,
  });
}

export function failFirstSyncGroup(
  cursor: FirstSyncCursor,
  group: FirstSyncGroupName,
  code: string,
  retryable: boolean,
): FirstSyncCursor {
  const valid = validateCursor(cursor);
  if (
    !groupName(group) ||
    firstSyncGroups[valid.completedGroups.length] !== group ||
    !safeErrorCodePattern.test(code) ||
    code.length > 128
  ) {
    return invalidCursor();
  }
  return validateCursor({
    ...valid,
    failedGroup: { groupName: group, code, retryable },
  });
}

export function remainingFirstSyncGroups(
  cursor: FirstSyncCursor,
): readonly FirstSyncGroupName[] {
  return firstSyncGroups.slice(validateCursor(cursor).completedGroups.length);
}
