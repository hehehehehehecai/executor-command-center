import { describe, expect, it } from "vitest";

import type { ConnectedPanelData } from "@/infrastructure/connected-panels/supabase-connected-panel-reader";

import {
  mapDecisionArchiveConnectedSource,
  mapFlightLogConnectedSource,
  mapMissionControlConnectedSource,
  mapProjectGalaxyConnectedSource,
} from "./connected-panel-source-mappers";

const projectId = "22222222-2222-4222-8222-222222222222";

function data(overrides: Partial<ConnectedPanelData> = {}): ConnectedPanelData {
  return {
    project: {
      id: projectId,
      name: "executor-stage6-staging-fixture",
      repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
      repositoryVisibility: "private",
      defaultBranch: "main",
      status: "polishing",
      coreGoal: "Ship the safe beta",
      currentStageGoal: "Verify connected panels",
      currentBlocker: null,
      updatedAt: "2026-08-29T05:00:00.000Z",
    },
    activities: [],
    syncRuns: [],
    briefs: [],
    ...overrides,
  };
}

const knownFreshness = {
  kind: "known" as const,
  input: {
    provenance: "real" as const,
    authorizationRevoked: false,
    latestRun: null,
    lastSuccessfulAt: "2026-08-29T05:00:00.000Z",
    coverageComplete: true,
    now: "2026-08-29T06:00:00.000Z",
  },
};

describe("Connected panel source mappers", () => {
  it("maps the authoritative project profile and bounded recent activity", () => {
    const activities = Array.from({ length: 22 }, (_, index) => ({
      sourceKind: "github_commit" as const,
      sourceId: String(index).padStart(40, "a"),
      occurredAt: `2026-08-29T04:${String(index).padStart(2, "0")}:00.000Z`,
      sourceUpdatedAt: `2026-08-29T04:${String(index).padStart(2, "0")}:00.000Z`,
      sourceVersion: String(index),
      summary: `Commit ${index}`,
      facts: {},
    }));
    activities.push({ ...activities[21]!, summary: "duplicate must not win" });

    const source = mapProjectGalaxyConnectedSource(
      data({ activities }),
      knownFreshness,
    );

    expect(source.project).toEqual({
      id: projectId,
      name: "executor-stage6-staging-fixture",
      repositoryLabel: "hecaitest1/executor-stage6-staging-fixture",
    });
    expect(source.officialStatus).toBe("polishing");
    expect(source.coreGoal).toBe("Ship the safe beta");
    expect(source.currentStageGoal).toBe("Verify connected panels");
    expect(source.currentBlockers).toEqual([]);
    expect(source.activity).toHaveLength(20);
    expect(source.activity[0]?.summary).toBe("Commit 21");
    expect(new Set(source.activity.map(({ id }) => id)).size).toBe(20);
  });

  it("maps only persisted GitHub task facts and leaves unpersisted suggestions empty", () => {
    const source = mapMissionControlConnectedSource(data({
      activities: [
        {
          sourceKind: "github_issue",
          sourceId: "issue-open",
          occurredAt: "2026-08-29T04:00:00.000Z",
          sourceUpdatedAt: "2026-08-29T04:00:00.000Z",
          sourceVersion: "v1",
          summary: "Open issue",
          facts: { issueNumber: 7, state: "open" },
        },
        {
          sourceKind: "github_issue",
          sourceId: "issue-closed",
          occurredAt: "2026-08-29T04:01:00.000Z",
          sourceUpdatedAt: "2026-08-29T04:01:00.000Z",
          sourceVersion: "v2",
          summary: "Closed issue",
          facts: { issueNumber: 8, state: "closed" },
        },
        {
          sourceKind: "github_workflow_run",
          sourceId: "901",
          occurredAt: "2026-08-29T04:02:00.000Z",
          sourceUpdatedAt: "2026-08-29T04:02:00.000Z",
          sourceVersion: "v3",
          summary: "Workflow run 9",
          facts: { runNumber: 9, status: "completed", conclusion: "failure" },
        },
      ],
    }));

    expect(source.recordedTasks.map(({ id, taskType, state }) => ({ id, taskType, state }))).toEqual([
      { id: "github_workflow_run:901", taskType: "workflow_failure", state: "failed" },
      { id: "github_issue:issue-open", taskType: "issue", state: "open" },
    ]);
    expect(source.suggestions).toEqual([]);
  });

  it("returns a real empty Decision Archive when no persisted decision source exists", () => {
    expect(mapDecisionArchiveConnectedSource(data())).toEqual({
      provenanceLabel: "Connected 数据 · 当前项目",
      candidates: [],
      records: [],
    });
  });

  it("builds a deduplicated Flight Log from GitHub, sync and brief lineage", () => {
    const source = mapFlightLogConnectedSource(data({
      activities: [{
        sourceKind: "github_issue",
        sourceId: "501",
        occurredAt: "2026-08-29T04:00:00.000Z",
        sourceUpdatedAt: "2026-08-29T04:00:00.000Z",
        sourceVersion: "v1",
        summary: "Fixture issue",
        facts: { issueNumber: 1, state: "closed" },
      }],
      syncRuns: [{
        id: "55555555-5555-4555-8555-555555555555",
        triggerSource: "manual",
        status: "completed",
        queuedAt: "2026-08-29T04:10:00.000Z",
        startedAt: "2026-08-29T04:10:01.000Z",
        finishedAt: "2026-08-29T04:10:02.000Z",
        errorCode: null,
      }],
      briefs: [{
        id: "66666666-6666-4666-8666-666666666666",
        status: "completed",
        createdAt: "2026-08-29T04:20:00.000Z",
        completedAt: "2026-08-29T04:20:03.000Z",
        errorCode: null,
      }],
    }));

    expect(source.events.map(({ id, eventType }) => ({ id, eventType }))).toEqual([
      { id: "project_brief:66666666-6666-4666-8666-666666666666", eventType: "sync_event" },
      { id: "sync_run:55555555-5555-4555-8555-555555555555", eventType: "sync_event" },
      { id: "github_issue:501", eventType: "issue" },
    ]);
    expect(source.lastSuccessfulAt).toBe("2026-08-29T04:10:02.000Z");
  });
});
