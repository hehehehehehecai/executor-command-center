export const backgroundJobContract = "background-job.v1" as const;

export const backgroundJobTypes = ["project.sync.requested.v1"] as const;

export type BackgroundJobType = (typeof backgroundJobTypes)[number];

export const syncTriggerSources = ["first_sync", "webhook", "reconciliation", "manual"] as const;
export type SyncTriggerSource = (typeof syncTriggerSources)[number];

export type WebhookDeliveryLineage = {
  deliveryId: string;
  bodySha256: string;
  eventName: string;
  action: string | null;
  installationId: number;
  repositoryId: number;
  repositoryFullName: string;
  internalEventId: string;
  processingVersion: number;
  kind?: string;
  pushAfterSha?: string | null;
};

export type BackgroundJob = {
  version: typeof backgroundJobContract;
  jobType: BackgroundJobType;
  jobId: string;
  projectId: string;
  syncRunId: string;
  idempotencyKey: string;
  correlationId: string;
  requestedAt: string;
  triggerSource?: SyncTriggerSource;
  webhookDelivery?: WebhookDeliveryLineage | null;
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

const currentBackgroundJobKeys = [...backgroundJobKeys, "triggerSource", "webhookDelivery"] as const;
const legacyWebhookLineageKeys = ["deliveryId", "bodySha256", "eventName", "action", "installationId", "repositoryId", "repositoryFullName", "internalEventId", "processingVersion"] as const;
const webhookLineageKeys = [...legacyWebhookLineageKeys, "kind", "pushAfterSha"] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const repositoryFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const commitShaPattern = /^(?!0{40}$)[0-9a-f]{40}$/;
const webhookKindByEventName = {
  push: "github.push.v1",
  issues: "github.issue.v1",
  pull_request: "github.pull_request.v1",
  release: "github.release.v1",
  workflow_run: "github.workflow_run.v1",
  repository: "github.repository.v1",
} as const;

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
  const legacy = keys.length === backgroundJobKeys.length;
  const expectedKeys = [...(legacy ? backgroundJobKeys : currentBackgroundJobKeys)].sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalidRequest();
  }

  const triggerSource = legacy ? "first_sync" : value.triggerSource;
  const webhookDelivery = legacy ? null : value.webhookDelivery;
  if (!syncTriggerSources.includes(triggerSource as SyncTriggerSource)) return invalidRequest();
  if (triggerSource === "webhook") {
    if (!isRecord(webhookDelivery)) return invalidRequest();
    const lineageKeys = Object.keys(webhookDelivery).sort();
    const legacyLineage = lineageKeys.length === legacyWebhookLineageKeys.length
      && lineageKeys.every((key, index) => key === [...legacyWebhookLineageKeys].sort()[index]);
    const currentLineage = lineageKeys.length === webhookLineageKeys.length
      && lineageKeys.every((key, index) => key === [...webhookLineageKeys].sort()[index]);
    if (!legacyLineage && !currentLineage) return invalidRequest();
    if (
      typeof webhookDelivery.deliveryId !== "string" || !safeIdentifierPattern.test(webhookDelivery.deliveryId)
      || typeof webhookDelivery.bodySha256 !== "string" || !sha256Pattern.test(webhookDelivery.bodySha256)
      || typeof webhookDelivery.eventName !== "string" || !safeIdentifierPattern.test(webhookDelivery.eventName)
      || (webhookDelivery.action !== null && (typeof webhookDelivery.action !== "string" || !safeIdentifierPattern.test(webhookDelivery.action)))
      || !Number.isSafeInteger(webhookDelivery.installationId) || Number(webhookDelivery.installationId) <= 0
      || !Number.isSafeInteger(webhookDelivery.repositoryId) || Number(webhookDelivery.repositoryId) <= 0
      || typeof webhookDelivery.repositoryFullName !== "string" || !repositoryFullNamePattern.test(webhookDelivery.repositoryFullName)
      || typeof webhookDelivery.internalEventId !== "string" || !safeIdentifierPattern.test(webhookDelivery.internalEventId)
      || !Number.isSafeInteger(webhookDelivery.processingVersion) || Number(webhookDelivery.processingVersion) <= 0
    ) return invalidRequest();
    const expectedKind = webhookKindByEventName[webhookDelivery.eventName as keyof typeof webhookKindByEventName];
    if (!expectedKind || (legacyLineage && webhookDelivery.eventName === "push")) return invalidRequest();
    if (currentLineage && (
      webhookDelivery.kind !== expectedKind
      || (expectedKind === "github.push.v1"
        ? typeof webhookDelivery.pushAfterSha !== "string" || !commitShaPattern.test(webhookDelivery.pushAfterSha)
        : webhookDelivery.pushAfterSha !== null)
    )) return invalidRequest();
  } else if (webhookDelivery !== null) {
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

  const base = {
    version: value.version,
    jobType: value.jobType as BackgroundJobType,
    jobId: value.jobId,
    projectId: value.projectId,
    syncRunId: value.syncRunId,
    idempotencyKey: value.idempotencyKey,
    correlationId: value.correlationId,
    requestedAt: value.requestedAt,
  };
  if (legacy) return base;
  return { ...base, triggerSource: triggerSource as SyncTriggerSource, webhookDelivery: webhookDelivery as WebhookDeliveryLineage | null };
}
