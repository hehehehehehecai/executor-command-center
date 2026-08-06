import { describe, expect, it } from "vitest";

import {
  compareRepositoryFacts,
  freezeDailyReconciliationWindow,
  manualResyncContract,
  reconciliationScheduleContract,
  repositoryReconciliationContract,
  syncRequestCoalescingContract,
  type RepositoryVersionFacts,
} from "./reconciliation";

const equalFacts: RepositoryVersionFacts = {
  repository: "a".repeat(64),
  commit: "b".repeat(64),
  issue: "c".repeat(64),
  pull_request: "d".repeat(64),
  release: "e".repeat(64),
  workflow_run: "f".repeat(64),
};

describe("repository-reconciliation.v1", () => {
  it("binds the four Phase 7 contracts", () => {
    expect({
      repositoryReconciliationContract,
      reconciliationScheduleContract,
      manualResyncContract,
      syncRequestCoalescingContract,
    }).toEqual({
      repositoryReconciliationContract: "repository-reconciliation.v1",
      reconciliationScheduleContract: "reconciliation-schedule.v1",
      manualResyncContract: "manual-resync.v1",
      syncRequestCoalescingContract: "sync-request-coalescing.v1",
    });
  });

  it("freezes every retry in one UTC day to the same identity", () => {
    expect(freezeDailyReconciliationWindow("2026-08-06T00:01:00.000Z")).toEqual({
      windowStart: "2026-08-06T00:00:00.000Z",
      windowEnd: "2026-08-07T00:00:00.000Z",
      snapshotSince: "2026-05-09T00:00:00.000Z",
      requestIdentity: "reconciliation:2026-08-06",
    });
    expect(freezeDailyReconciliationWindow("2026-08-06T23:59:59.999Z").requestIdentity)
      .toBe("reconciliation:2026-08-06");
  });

  it("uses a distinct stable identity for the next UTC window", () => {
    expect(freezeDailyReconciliationWindow("2026-08-07T00:00:00.000Z").requestIdentity)
      .toBe("reconciliation:2026-08-07");
  });

  it("returns no_difference only when all six fact digests match", () => {
    expect(compareRepositoryFacts({
      installationStatus: "active",
      mappingComplete: true,
      local: equalFacts,
      remote: { ...equalFacts },
    })).toEqual({ decision: "no_difference", changedGroups: [] });
  });

  it("detects repository metadata difference", () => {
    expect(compareRepositoryFacts({
      installationStatus: "active",
      mappingComplete: true,
      local: equalFacts,
      remote: { ...equalFacts, repository: "0".repeat(64) },
    })).toEqual({ decision: "difference", changedGroups: ["repository"] });
  });

  it("detects a missed webhook through an object collection digest", () => {
    expect(compareRepositoryFacts({
      installationStatus: "active",
      mappingComplete: true,
      local: equalFacts,
      remote: { ...equalFacts, issue: "1".repeat(64) },
    })).toEqual({ decision: "difference", changedGroups: ["issue"] });
  });

  it("gives revoked authorization priority over fact comparison", () => {
    expect(compareRepositoryFacts({
      installationStatus: "revoked",
      mappingComplete: true,
      local: equalFacts,
      remote: null,
    })).toEqual({ decision: "authorization_revoked", changedGroups: [] });
  });

  it("blocks suspended and incomplete mappings before comparison", () => {
    expect(compareRepositoryFacts({
      installationStatus: "suspended",
      mappingComplete: true,
      local: equalFacts,
      remote: null,
    })).toEqual({ decision: "blocked", changedGroups: [] });
    expect(compareRepositoryFacts({
      installationStatus: "active",
      mappingComplete: false,
      local: equalFacts,
      remote: null,
    })).toEqual({ decision: "blocked", changedGroups: [] });
  });

  it("rejects non-canonical timestamps and malformed fact digests", () => {
    expect(() => freezeDailyReconciliationWindow("2026-08-06")).toThrow(
      "reconciliation_invalid_request",
    );
    expect(() => compareRepositoryFacts({
      installationStatus: "active",
      mappingComplete: true,
      local: equalFacts,
      remote: { ...equalFacts, workflow_run: "not-a-digest" },
    })).toThrow("reconciliation_facts_invalid");
  });
});
