export const backgroundJobContract = "background-job.v1" as const;

export const backgroundJobTypes = ["project.sync.requested.v1"] as const;

export type BackgroundJobType = (typeof backgroundJobTypes)[number];

export type BackgroundJob = {
  version: typeof backgroundJobContract;
  jobType: BackgroundJobType;
  jobId: string;
  projectId: string;
  syncRunId: string;
  idempotencyKey: string;
  correlationId: string;
  requestedAt: string;
};

const backgroundJobKeys = [
  "version",
  "jobType",
  "jobId",
  "projectId",
  "syncRunId",
  "idempotencyKey",
  "correlationId",
  "requestedAt",
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function invalidRequest(): never {
  throw new Error("background_job_invalid_request");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalTimestampPattern.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function parseBackgroundJob(value: unknown): BackgroundJob {
  if (!isRecord(value)) {
    return invalidRequest();
  }

  const keys = Object.keys(value).sort();
  const expectedKeys = [...backgroundJobKeys].sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalidRequest();
  }

  if (value.version !== backgroundJobContract) {
    return invalidRequest();
  }

  if (!backgroundJobTypes.includes(value.jobType as BackgroundJobType)) {
    throw new Error("background_job_unsupported_type");
  }

  if (
    typeof value.jobId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.syncRunId !== "string"
    || !uuidPattern.test(value.jobId)
    || !uuidPattern.test(value.projectId)
    || !uuidPattern.test(value.syncRunId)
    || typeof value.idempotencyKey !== "string"
    || typeof value.correlationId !== "string"
    || !safeIdentifierPattern.test(value.idempotencyKey)
    || !safeIdentifierPattern.test(value.correlationId)
    || !isCanonicalTimestamp(value.requestedAt)
  ) {
    return invalidRequest();
  }

  return {
    version: value.version,
    jobType: value.jobType as BackgroundJobType,
    jobId: value.jobId,
    projectId: value.projectId,
    syncRunId: value.syncRunId,
    idempotencyKey: value.idempotencyKey,
    correlationId: value.correlationId,
    requestedAt: value.requestedAt,
  };
}
