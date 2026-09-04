export const projectCalibrationContract = "project-calibration.v1" as const;

export const projectStatuses = [
  "in_planning",
  "in_development",
  "polishing",
  "dormant",
  "completed",
  "archived",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export interface ProjectCalibrationCommand {
  readonly selectedRepositoryId: string;
  readonly coreGoal: string;
  readonly currentStageGoal: string;
  readonly status: ProjectStatus;
  readonly currentBlocker: string | null;
}

export interface ProjectCalibration {
  readonly id: string;
  readonly selectedRepositoryId: string;
  readonly coreGoal: string;
  readonly currentStageGoal: string;
  readonly status: ProjectStatus;
  readonly currentBlocker: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectRepositoryFacts {
  readonly id: string;
  readonly repositoryId: number;
  readonly fullName: string;
  readonly visibility: "public" | "private" | "internal";
  readonly defaultBranch: string;
}

export interface ProjectCalibrationView {
  readonly repository: ProjectRepositoryFacts;
  readonly calibration: ProjectCalibration | null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statusSet = new Set<string>(projectStatuses);
const expectedKeys = new Set([
  "selectedRepositoryId",
  "coreGoal",
  "currentStageGoal",
  "status",
  "currentBlocker",
]);

function invalidRequest(cause?: unknown): Error {
  return new Error("project_calibration_invalid_request", { cause });
}

function strictObject(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalidRequest();
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!expectedKeys.has(key)) throw invalidRequest();
  }
  return record;
}

function requiredText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2000 ||
    value.trim().length === 0 ||
    value.trim() !== value
  ) {
    throw invalidRequest();
  }
  return value;
}

export function parseProjectCalibrationInput(
  value: unknown,
): ProjectCalibrationCommand {
  const record = strictObject(value);
  if (
    typeof record.selectedRepositoryId !== "string" ||
    !uuidPattern.test(record.selectedRepositoryId) ||
    typeof record.status !== "string" ||
    !statusSet.has(record.status)
  ) {
    throw invalidRequest();
  }
  const blocker = record.currentBlocker;
  return {
    selectedRepositoryId: record.selectedRepositoryId,
    coreGoal: requiredText(record.coreGoal),
    currentStageGoal: requiredText(record.currentStageGoal),
    status: record.status as ProjectStatus,
    currentBlocker:
      blocker === undefined || blocker === null ? null : requiredText(blocker),
  };
}
