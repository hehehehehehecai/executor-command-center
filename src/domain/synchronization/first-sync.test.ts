import { describe, expect, it } from "vitest";

import {
  completeFirstSyncGroup,
  createFirstSyncCursor,
  failFirstSyncGroup,
  firstRepositorySyncContract,
  firstSyncReaderContract,
  firstSyncSnapshotContract,
  firstSyncStateContract,
  firstSyncCursorContract,
  firstSyncGroups,
  firstSyncGroupsContract,
  firstSyncWindowContract,
  freezeFirstSyncWindow,
  isWithinFirstSyncWindow,
  parseFirstSyncCursor,
  remainingFirstSyncGroups,
  serializeFirstSyncCursor,
} from "./first-sync";

const projectId = "11111111-1111-4111-8111-111111111111";
const syncRunId = "22222222-2222-4222-8222-222222222222";

function cursor() {
  return createFirstSyncCursor({
    projectId,
    syncRunId,
    requestId: "request-001",
    repositoryFullName: "synthetic-owner/synthetic-repository",
    installationId: 81_001,
    window: freezeFirstSyncWindow("2026-08-06T02:00:00.000Z"),
    job: {
      jobId: syncRunId,
      correlationId: `first-sync:${syncRunId}`,
      idempotencyKey: "first-sync:request-001",
      providerJobId: "provider-event-001",
    },
  });
}

describe("first sync domain contracts", () => {
  it("binds the fixed contract versions and group order", () => {
    expect(firstRepositorySyncContract).toBe("first-repository-sync.v1");
    expect(firstSyncGroupsContract).toBe("first-sync-groups.v1");
    expect(firstSyncWindowContract).toBe("first-sync-window-90d.v1");
    expect(firstSyncCursorContract).toBe("first-sync-cursor.v1");
    expect(firstSyncReaderContract).toBe("github-activity-reader.v1");
    expect(firstSyncSnapshotContract).toBe("github-activity-snapshots.v1");
    expect(firstSyncStateContract).toBe("synchronization-state.v1");
    expect(firstSyncGroups).toEqual([
      "repository",
      "commit",
      "issue",
      "pull_request",
      "release",
      "workflow_run",
    ]);
  });

  it("subtracts exactly 90 UTC calendar days from the frozen end", () => {
    expect(freezeFirstSyncWindow("2024-03-31T23:30:00.000Z")).toEqual({
      windowStart: "2024-01-01T23:30:00.000Z",
      windowEnd: "2024-03-31T23:30:00.000Z",
    });
  });

  it("includes both window boundaries and excludes either side", () => {
    const window = freezeFirstSyncWindow("2026-08-06T02:00:00.000Z");
    expect(isWithinFirstSyncWindow(window.windowStart, window)).toBe(true);
    expect(isWithinFirstSyncWindow(window.windowEnd, window)).toBe(true);
    expect(isWithinFirstSyncWindow("2026-05-08T01:59:59.999Z", window)).toBe(false);
    expect(isWithinFirstSyncWindow("2026-08-06T02:00:00.001Z", window)).toBe(false);
  });

  it("rejects non-canonical or impossible timestamps", () => {
    expect(() => freezeFirstSyncWindow("2026-08-06T02:00:00Z")).toThrow(
      "first_sync_invalid_request",
    );
    expect(() => freezeFirstSyncWindow("not-a-date")).toThrow(
      "first_sync_invalid_request",
    );
  });

  it("round trips an exact bounded cursor without credentials", () => {
    const encoded = serializeFirstSyncCursor(cursor());
    expect(encoded.length).toBeLessThanOrEqual(2_000);
    expect(parseFirstSyncCursor(encoded)).toEqual(cursor());
    expect(encoded).not.toMatch(/token|authorization|cookie|secret|rawPayload/i);
    expect(parseFirstSyncCursor(encoded)).toMatchObject({
      readerContractVersion: "github-activity-reader.v1",
      snapshotContractVersion: "github-activity-snapshots.v1",
      syncStateContractVersion: "synchronization-state.v1",
    });
  });

  it("checkpoints a successful group once and clears its prior failure", () => {
    const failed = failFirstSyncGroup(
      cursor(),
      "repository",
      "github_activity_unavailable",
      true,
    );
    const completed = completeFirstSyncGroup(failed, "repository");
    expect(completed.completedGroups).toEqual(["repository"]);
    expect(completed.failedGroup).toBeNull();
    expect(completeFirstSyncGroup(completed, "repository")).toEqual(completed);
  });

  it("keeps only a safe structured failure in the cursor", () => {
    expect(
      failFirstSyncGroup(
        completeFirstSyncGroup(cursor(), "repository"),
        "commit",
        "github_activity_rate_limited",
        true,
      ).failedGroup,
    ).toEqual({
      groupName: "commit",
      code: "github_activity_rate_limited",
      retryable: true,
    });
  });

  it("returns only unfinished groups in frozen order", () => {
    const afterTwo = completeFirstSyncGroup(
      completeFirstSyncGroup(cursor(), "repository"),
      "commit",
    );
    expect(remainingFirstSyncGroups(afterTwo)).toEqual([
      "issue",
      "pull_request",
      "release",
      "workflow_run",
    ]);
  });

  it("rejects cursor key injection and cross-project identity", () => {
    const injected = JSON.stringify({ ...cursor(), token: "synthetic-forbidden" });
    expect(() => parseFirstSyncCursor(injected)).toThrow("first_sync_cursor_invalid");

    const wrongProject = JSON.stringify({
      ...cursor(),
      projectId: "33333333-3333-4333-8333-333333333333",
    });
    expect(parseFirstSyncCursor(wrongProject).projectId).not.toBe(projectId);
  });

  it("rejects unknown groups, unsafe error codes and oversized cursors", () => {
    expect(() => completeFirstSyncGroup(cursor(), "check" as never)).toThrow(
      "first_sync_cursor_invalid",
    );
    expect(() => failFirstSyncGroup(cursor(), "commit", "unsafe code", true)).toThrow(
      "first_sync_cursor_invalid",
    );
    expect(() => parseFirstSyncCursor(`{"version":"${"x".repeat(2_001)}"}`)).toThrow(
      "first_sync_cursor_invalid",
    );
  });
});
