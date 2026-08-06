export const repositoryReconciliationContract = "repository-reconciliation.v1" as const;
export const reconciliationScheduleContract = "reconciliation-schedule.v1" as const;
export const manualResyncContract = "manual-resync.v1" as const;
export const syncRequestCoalescingContract = "sync-request-coalescing.v1" as const;

export const reconciliationFactGroups = [
  "repository",
  "commit",
  "issue",
  "pull_request",
  "release",
  "workflow_run",
] as const;

export type ReconciliationFactGroup = (typeof reconciliationFactGroups)[number];
export type RepositoryVersionFacts = Record<ReconciliationFactGroup, string>;
export type ReconciliationWindow = {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly snapshotSince: string;
  readonly requestIdentity: string;
};
export type ReconciliationDecision = {
  readonly decision: "no_difference" | "difference" | "blocked" | "authorization_revoked";
  readonly changedGroups: readonly ReconciliationFactGroup[];
};

const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const digest = /^[0-9a-f]{64}$/;

function invalidRequest(): never {
  throw new Error("reconciliation_invalid_request");
}

function canonical(value: string): Date {
  if (!canonicalTimestamp.test(value)) return invalidRequest();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return invalidRequest();
  }
  return parsed;
}

export function freezeDailyReconciliationWindow(scheduledAt: string): ReconciliationWindow {
  const scheduled = canonical(scheduledAt);
  const start = new Date(Date.UTC(
    scheduled.getUTCFullYear(),
    scheduled.getUTCMonth(),
    scheduled.getUTCDate(),
  ));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const snapshotSince = new Date(end);
  snapshotSince.setUTCDate(snapshotSince.getUTCDate() - 90);
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    snapshotSince: snapshotSince.toISOString(),
    requestIdentity: `reconciliation:${start.toISOString().slice(0, 10)}`,
  };
}

function validFacts(value: RepositoryVersionFacts | null): value is RepositoryVersionFacts {
  return value !== null && reconciliationFactGroups.every((group) => digest.test(value[group]));
}

export function compareRepositoryFacts(input: {
  readonly installationStatus: "active" | "suspended" | "revoked";
  readonly mappingComplete: boolean;
  readonly local: RepositoryVersionFacts;
  readonly remote: RepositoryVersionFacts | null;
}): ReconciliationDecision {
  if (input.installationStatus === "revoked") {
    return { decision: "authorization_revoked", changedGroups: [] };
  }
  if (input.installationStatus === "suspended" || !input.mappingComplete) {
    return { decision: "blocked", changedGroups: [] };
  }
  if (!validFacts(input.local) || !validFacts(input.remote)) {
    throw new Error("reconciliation_facts_invalid");
  }
  const changedGroups = reconciliationFactGroups.filter(
    (group) => input.local[group] !== input.remote![group],
  );
  return {
    decision: changedGroups.length === 0 ? "no_difference" : "difference",
    changedGroups,
  };
}
