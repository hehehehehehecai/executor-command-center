// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";

type SyncStatus =
  | "queued"
  | "running"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled";

type StateModule = {
  synchronizationStateContract: string;
  freshnessStatusContract: string;
  syncStatuses: readonly string[];
  freshnessStatuses: readonly string[];
  allowedSyncStatusTransitions: Readonly<Record<SyncStatus, readonly SyncStatus[]>>;
  isSyncStatusTransitionAllowed(current: SyncStatus, target: SyncStatus): boolean;
  assertSyncStatusTransition(current: SyncStatus, target: SyncStatus): void;
  deriveFreshnessStatus(input: {
    authorizationRevoked: boolean;
    latestRun: { status: SyncStatus; finishedAt: string | null } | null;
    lastSuccessfulAt: string | null;
    coverageComplete: boolean;
    now: string;
  }): string;
};

let state: Partial<StateModule> = {};

beforeAll(async () => {
  const modulePath = "./synchronization-state";
  state = await import(modulePath).catch(() => ({}));
});

const statuses = [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;

const transitions: Readonly<Record<SyncStatus, readonly SyncStatus[]>> = {
  queued: ["running", "cancelled", "failed"],
  running: ["partial", "completed", "failed", "cancelled"],
  partial: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

describe("synchronization-state.v1", () => {
  it("freezes the exact SyncStatus and FreshnessStatus sets", () => {
    expect(state.synchronizationStateContract).toBe("synchronization-state.v1");
    expect(state.freshnessStatusContract).toBe("freshness-status.v1");
    expect(state.syncStatuses).toEqual(statuses);
    expect(state.freshnessStatuses).toEqual([
      "fresh",
      "stale",
      "partial",
      "syncing",
      "failed",
      "authorization_revoked",
    ]);
    expect(state.allowedSyncStatusTransitions).toEqual(transitions);
  });

  it.each(
    Object.entries(transitions).flatMap(([current, targets]) =>
      targets.map((target) => [current, target] as const),
    ),
  )("allows %s -> %s", (current, target) => {
    expect(state.isSyncStatusTransitionAllowed?.(current as SyncStatus, target)).toBe(true);
    expect(() => state.assertSyncStatusTransition?.(current as SyncStatus, target)).not.toThrow();
  });

  it.each(
    statuses.flatMap((current) =>
      statuses
        .filter((target) => target !== current && !transitions[current].includes(target))
        .map((target) => [current, target] as const),
    ),
  )("rejects illegal %s -> %s without weakening terminal states", (current, target) => {
    expect(state.isSyncStatusTransitionAllowed?.(current, target)).toBe(false);
    expect(() => state.assertSyncStatusTransition?.(current, target)).toThrow(
      "sync_run_invalid_transition",
    );
  });

  it.each(statuses)("treats same-state %s replay as an idempotent no-op", (status) => {
    expect(state.isSyncStatusTransitionAllowed?.(status, status)).toBe(true);
    expect(() => state.assertSyncStatusTransition?.(status, status)).not.toThrow();
  });
});

describe("freshness-status.v1", () => {
  const now = "2026-08-05T12:00:00.000Z";
  const derive = (overrides: Partial<Parameters<NonNullable<StateModule["deriveFreshnessStatus"]>>[0]>) =>
    state.deriveFreshnessStatus?.({
      authorizationRevoked: false,
      latestRun: null,
      lastSuccessfulAt: null,
      coverageComplete: true,
      now,
      ...overrides,
    });

  it("uses authorization_revoked as the highest priority", () => {
    expect(derive({
      authorizationRevoked: true,
      latestRun: { status: "running", finishedAt: null },
      lastSuccessfulAt: "2026-08-05T11:00:00.000Z",
      coverageComplete: false,
    })).toBe("authorization_revoked");
  });

  it.each(["queued", "running"] as const)("maps active %s runs to syncing", (status) => {
    expect(derive({ latestRun: { status, finishedAt: null } })).toBe("syncing");
  });

  it("maps a latest failure without a newer success to failed", () => {
    expect(derive({
      latestRun: { status: "failed", finishedAt: "2026-08-05T11:00:00.000Z" },
      lastSuccessfulAt: "2026-08-05T10:59:59.999Z",
      coverageComplete: false,
    })).toBe("failed");
  });

  it("lets a newer successful fact supersede an older failed run", () => {
    expect(derive({
      latestRun: { status: "failed", finishedAt: "2026-08-05T10:00:00.000Z" },
      lastSuccessfulAt: "2026-08-05T11:00:00.000Z",
    })).toBe("fresh");
  });

  it.each([
    {
      name: "latest partial run",
      overrides: { latestRun: { status: "partial" as const, finishedAt: null } },
    },
    { name: "incomplete coverage", overrides: { coverageComplete: false } },
  ])("maps $name to partial", ({ overrides }) => {
    expect(derive(overrides)).toBe("partial");
  });

  it("treats exactly 24 hours as fresh", () => {
    expect(derive({ lastSuccessfulAt: "2026-08-04T12:00:00.000Z" })).toBe("fresh");
  });

  it("treats more than 24 hours as stale", () => {
    expect(derive({ lastSuccessfulAt: "2026-08-04T11:59:59.999Z" })).toBe("stale");
  });

  it("treats a missing successful timestamp as stale", () => {
    expect(derive({ lastSuccessfulAt: null })).toBe("stale");
  });
});
