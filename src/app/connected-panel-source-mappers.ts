import "server-only";

import type { DecisionArchiveSource } from "@/features/decision-archive";
import type { FlightLogEvent, FlightLogSource } from "@/features/flight-log";
import type { MissionControlSource, RecordedTask } from "@/features/mission-control";
import type {
  ProjectGalaxyFreshness,
  ProjectGalaxySource,
} from "@/features/project-galaxy";
import type {
  ConnectedPanelActivity,
  ConnectedPanelData,
} from "@/infrastructure/connected-panels/supabase-connected-panel-reader";

const maximumRecentActivities = 20;
const maximumFlightEvents = 100;

function activityKey(activity: ConnectedPanelActivity) {
  return `${activity.sourceKind}:${activity.sourceId}`;
}

function boundedActivities(
  activities: readonly ConnectedPanelActivity[],
  maximum = maximumRecentActivities,
) {
  const unique = new Map<string, ConnectedPanelActivity>();
  for (const activity of activities) {
    const key = activityKey(activity);
    if (!unique.has(key)) unique.set(key, activity);
  }
  return [...unique.values()]
    .sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.sourceKind.localeCompare(right.sourceKind) ||
      left.sourceId.localeCompare(right.sourceId))
    .slice(0, maximum);
}

function factNumber(activity: ConnectedPanelActivity, key: string) {
  const value = activity.facts[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function factString(activity: ConnectedPanelActivity, key: string) {
  const value = activity.facts[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function repositoryUrl(data: ConnectedPanelData, suffix: string) {
  return `https://github.com/${data.project.repositoryFullName}${suffix}`;
}

function activityUrl(
  data: ConnectedPanelData,
  activity: ConnectedPanelActivity,
): string | null {
  switch (activity.sourceKind) {
    case "github_commit":
      return repositoryUrl(data, `/commit/${encodeURIComponent(activity.sourceId)}`);
    case "github_issue": {
      const number = factNumber(activity, "issueNumber");
      return number === null ? null : repositoryUrl(data, `/issues/${number}`);
    }
    case "github_pull_request": {
      const number = factNumber(activity, "pullRequestNumber");
      return number === null ? null : repositoryUrl(data, `/pull/${number}`);
    }
    case "github_release": {
      const tag = factString(activity, "tagName");
      return tag === null ? null : repositoryUrl(data, `/releases/tag/${encodeURIComponent(tag)}`);
    }
    case "github_workflow_run":
      return /^\d+$/.test(activity.sourceId)
        ? repositoryUrl(data, `/actions/runs/${activity.sourceId}`)
        : null;
  }
}

export function mapProjectGalaxyConnectedSource(
  data: ConnectedPanelData,
  freshness: ProjectGalaxyFreshness,
): ProjectGalaxySource {
  return {
    project: {
      id: data.project.id,
      name: data.project.name,
      repositoryLabel: data.project.repositoryFullName,
    },
    officialStatus: data.project.status,
    suggestedStatus: null,
    activity: boundedActivities(data.activities).map((item) => ({
      id: activityKey(item),
      summary: item.summary,
      occurredAt: item.occurredAt,
    })),
    freshness,
    coreGoal: data.project.coreGoal,
    currentStageGoal: data.project.currentStageGoal,
    currentBlockers: data.project.currentBlocker === null
      ? []
      : [data.project.currentBlocker],
    provenanceLabel: "Connected 数据 · 当前项目",
  };
}

function missionTask(
  data: ConnectedPanelData,
  activity: ConnectedPanelActivity,
): RecordedTask | null {
  if (activity.sourceKind === "github_issue") {
    if (factString(activity, "state") !== "open") return null;
    const number = factNumber(activity, "issueNumber");
    return {
      id: activityKey(activity),
      taskType: "issue",
      title: activity.summary,
      state: "open",
      sourceLabel: number === null
        ? `${data.project.repositoryFullName} · GitHub 只读`
        : `${data.project.repositoryFullName}#${number} · GitHub 只读`,
      originalUrl: activityUrl(data, activity),
    };
  }
  if (activity.sourceKind === "github_pull_request") {
    if (factString(activity, "state") !== "open") return null;
    const number = factNumber(activity, "pullRequestNumber");
    return {
      id: activityKey(activity),
      taskType: "pull_request",
      title: activity.summary,
      state: "pending",
      sourceLabel: number === null
        ? `${data.project.repositoryFullName} · GitHub 只读`
        : `${data.project.repositoryFullName}#${number} · GitHub 只读`,
      originalUrl: activityUrl(data, activity),
    };
  }
  if (activity.sourceKind === "github_workflow_run") {
    const failureConclusions = new Set([
      "action_required", "cancelled", "failure", "startup_failure", "timed_out",
    ]);
    const conclusion = factString(activity, "conclusion");
    if (conclusion === null || !failureConclusions.has(conclusion)) return null;
    const number = factNumber(activity, "runNumber");
    return {
      id: activityKey(activity),
      taskType: "workflow_failure",
      title: activity.summary,
      state: "failed",
      sourceLabel: number === null
        ? `${data.project.repositoryFullName} · Workflow · GitHub 只读`
        : `${data.project.repositoryFullName} · Workflow #${number} · GitHub 只读`,
      originalUrl: activityUrl(data, activity),
    };
  }
  return null;
}

export function mapMissionControlConnectedSource(
  data: ConnectedPanelData,
): MissionControlSource {
  return {
    provenanceLabel: "Connected 数据 · 当前项目",
    recordedTasks: boundedActivities(data.activities, maximumFlightEvents)
      .map((item) => missionTask(data, item))
      .filter((item): item is RecordedTask => item !== null),
    suggestions: [],
  };
}

export function mapDecisionArchiveConnectedSource(
  data: ConnectedPanelData,
): DecisionArchiveSource {
  void data;
  return {
    provenanceLabel: "Connected 数据 · 当前项目",
    candidates: [],
    records: [],
  };
}

function flightActivity(
  data: ConnectedPanelData,
  activity: ConnectedPanelActivity,
): FlightLogEvent {
  const eventTypes = {
    github_commit: "commit",
    github_issue: "issue",
    github_pull_request: "pull_request",
    github_release: "release",
    github_workflow_run: "workflow",
  } as const;
  return {
    id: activityKey(activity),
    eventType: eventTypes[activity.sourceKind],
    occurredAt: activity.occurredAt,
    summary: activity.summary,
    sourceLabel: `${data.project.repositoryFullName} · GitHub 只读`,
    originalUrl: activityUrl(data, activity),
  };
}

export function mapFlightLogConnectedSource(
  data: ConnectedPanelData,
): FlightLogSource {
  const events: FlightLogEvent[] = [
    ...boundedActivities(data.activities, maximumFlightEvents)
      .map((item) => flightActivity(data, item)),
    ...data.syncRuns.map((run): FlightLogEvent => ({
      id: `sync_run:${run.id}`,
      eventType: "sync_event",
      occurredAt: run.finishedAt ?? run.startedAt ?? run.queuedAt,
      summary: `同步 ${run.triggerSource} · ${run.status}`,
      sourceLabel: `Sync Run · ${run.triggerSource}`,
      originalUrl: null,
    })),
    ...data.briefs.map((brief): FlightLogEvent => ({
      id: `project_brief:${brief.id}`,
      eventType: "sync_event",
      occurredAt: brief.completedAt ?? brief.createdAt,
      summary: `Project Brief · ${brief.status}`,
      sourceLabel: "Project Brief · 应用审计事件",
      originalUrl: null,
    })),
  ];
  const unique = new Map<string, FlightLogEvent>();
  for (const event of events) {
    const key = `${event.eventType}:${event.id}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  const sorted = [...unique.values()]
    .sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      left.eventType.localeCompare(right.eventType) ||
      left.id.localeCompare(right.id))
    .slice(0, maximumFlightEvents);
  const successful = data.syncRuns
    .filter((run) => ["completed", "partial"].includes(run.status) && run.finishedAt !== null)
    .map((run) => run.finishedAt as string)
    .sort((left, right) => right.localeCompare(left));
  return {
    events: sorted,
    lastSuccessfulAt: successful[0] ?? null,
    provenanceLabel: "Connected 数据 · 当前项目",
  };
}
