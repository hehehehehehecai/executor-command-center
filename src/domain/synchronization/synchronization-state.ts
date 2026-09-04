export const synchronizationStateContract = "synchronization-state.v1" as const;
export const freshnessStatusContract = "freshness-status.v1" as const;

export const syncStatuses = [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;

export const freshnessStatuses = [
  "fresh",
  "stale",
  "partial",
  "syncing",
  "failed",
  "authorization_revoked",
] as const;

export type SyncStatus = (typeof syncStatuses)[number];
export type FreshnessStatus = (typeof freshnessStatuses)[number];

export const allowedSyncStatusTransitions = {
  queued: ["running", "cancelled", "failed"],
  running: ["partial", "completed", "failed", "cancelled"],
  partial: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
} as const satisfies Readonly<Record<SyncStatus, readonly SyncStatus[]>>;

export interface SyncRun {
  readonly id: string;
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly triggerSource: string;
  readonly status: SyncStatus;
  readonly version: number;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly lastProgressAt: string | null;
  readonly progressCursor: string | null;
  readonly errorCode: string | null;
  readonly errorSummary: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FreshnessInput {
  readonly authorizationRevoked: boolean;
  readonly latestRun: Pick<SyncRun, "status" | "finishedAt"> | null;
  readonly lastSuccessfulAt: string | null;
  readonly coverageComplete: boolean;
  readonly now: string;
}

const statusSet = new Set<string>(syncStatuses);
const freshnessWindowMs = 24 * 60 * 60 * 1000;

export function isSyncStatus(value: unknown): value is SyncStatus {
  return typeof value === "string" && statusSet.has(value);
}

export function isSyncStatusTransitionAllowed(
  current: SyncStatus,
  target: SyncStatus,
): boolean {
  return current === target || (
    allowedSyncStatusTransitions[current] as readonly SyncStatus[]
  ).includes(target);
}

export function assertSyncStatusTransition(
  current: SyncStatus,
  target: SyncStatus,
): void {
  if (!isSyncStatusTransitionAllowed(current, target)) {
    throw new Error("sync_run_invalid_transition");
  }
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("freshness_invalid_input");
  return parsed;
}

export function deriveFreshnessStatus(input: FreshnessInput): FreshnessStatus {
  if (input.authorizationRevoked) return "authorization_revoked";

  if (input.latestRun?.status === "queued" || input.latestRun?.status === "running") {
    return "syncing";
  }

  if (input.latestRun?.status === "failed") {
    const failedAt = input.latestRun.finishedAt;
    if (
      failedAt === null ||
      input.lastSuccessfulAt === null ||
      timestamp(input.lastSuccessfulAt) <= timestamp(failedAt)
    ) {
      return "failed";
    }
  }

  if (input.latestRun?.status === "partial" || !input.coverageComplete) {
    return "partial";
  }

  if (input.lastSuccessfulAt === null) return "stale";
  return timestamp(input.now) - timestamp(input.lastSuccessfulAt) <= freshnessWindowMs
    ? "fresh"
    : "stale";
}
