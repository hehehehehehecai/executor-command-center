import "server-only";

import type { DecisionArchiveSource } from "@/features/decision-archive";
import type { DecisionArchiveReadResult } from "@/features/decision-archive/decision-archive-read-port";
import type { ConnectedReadState } from "@/shared/connected-read-state";
import type { CommandDeckOverview } from "@/features/command-deck/command-deck-connected-query";
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

export function connectedReadState(data: ConnectedPanelData, recordCount: number): ConnectedReadState {
  const scopeLabel = "当前项目 · 各来源最近 100 条，非全量统计";
  const common = { scopeLabel, nextStep: "到项目星图查看同步状态，或刷新重试读取。" };
  if (data.readContext && data.readContext.installationStatus !== "active") {
    return { ...common, kind: "authorization_revoked", label: "授权已暂停或撤销", description: "以下是此前保存的数据；当前授权不可用。", nextStep: "到接入页检查 GitHub App 授权。" };
  }
  const latest = [...data.syncRuns].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))[0];
  if (latest?.status === "failed") return { ...common, kind: "sync_failed", label: "最近同步失败", description: "此前保存的数据仍可查看；失败不代表没有记录。" };
  const successful = data.syncRuns.some(run => ["completed", "partial"].includes(run.status) && run.finishedAt !== null);
  if (!successful) return { ...common, kind: "not_synced", label: "尚无成功同步", description: "已读取此前保存的数据；尚不能确认仓库活动完整。" };
  return recordCount > 0
    ? { ...common, kind: "ready", label: "已读取保存的数据", description: "按下方读取范围展示当前项目记录。" }
    : { ...common, kind: "empty", label: "读取成功，当前范围无记录", description: "查询已成功；当前读取范围没有匹配记录。" };
}

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
    readState: { ...connectedReadState(data, data.activities.length), scopeLabel: "当前项目档案 · 最近 20 条活动（各 GitHub 来源读取最近 100 条）" },
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
      occurredAt: activity.occurredAt,
      sourceVersion: activity.sourceVersion,
      sourceState: factString(activity, "state") ?? "unknown",
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
      occurredAt: activity.occurredAt,
      sourceVersion: activity.sourceVersion,
      sourceState: factString(activity, "state") ?? "unknown",
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
      occurredAt: activity.occurredAt,
      sourceVersion: activity.sourceVersion,
      sourceState: conclusion,
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
  const recordedTasks = boundedActivities(data.activities, 500)
    .map((item) => missionTask(data, item))
    .filter((item): item is RecordedTask => item !== null)
    .slice(0, maximumFlightEvents);
  return {
    readState: { ...connectedReadState(data, recordedTasks.length), scopeLabel: "当前项目 · Issue、PR、工作流各最近 100 条中的待处理事实，最多展示 100 项" },
    provenanceLabel: "Connected 数据 · 当前项目",
    recordedTasks,
    suggestions: [],
  };
}

export function mapDecisionArchiveConnectedSource(
  data: ConnectedPanelData,
  result?: DecisionArchiveReadResult,
): DecisionArchiveSource {
  if (result && (result.projectId !== data.project.id || !data.readContext ||
      result.userId !== data.readContext.userId)) throw new Error("connected_panel_read_failed");
  if (result && data.readContext?.installationStatus !== "active") {
    return {
      provenanceLabel: "Connected 数据 · 当前项目",
      readState: { kind: "authorization_revoked", label: "项目授权不可用", description: "当前项目授权已撤回或暂停，不能读取或保存决策。", scopeLabel: "当前本人项目", nextStep: "恢复项目授权后再读取。" },
      candidates: [], records: [],
    };
  }
  if (!result || result.kind === "not_enabled") {
    return {
      provenanceLabel: "当前项目 · 决策记录存储尚未启用",
      readState: { kind: "not_enabled", label: "决策记录存储尚未启用", description: "尚不能读取正式决策记录；这不表示查询成功且记录为零。", scopeLabel: `当前项目 · ${data.project.id}`, nextStep: "记录功能启用后，在此读取本人项目的已确认记录。" },
      candidates: [], records: [],
    };
  }
  if (result.records.some(row => row.userId !== result.userId || row.projectId !== result.projectId)) {
    throw new Error("connected_panel_read_failed");
  }
  const records = result.records.map(row => row.record);
  return {
    provenanceLabel: "Connected 数据 · 当前项目",
    readState: { kind: records.length ? "ready" : "empty", label: records.length ? "已读取正式决策记录" : "读取成功，当前项目无决策记录", description: "只读展示本人项目的用户确认记录；不生成候选或自动确认。", scopeLabel: "当前项目 · 决策只读存储返回的记录", nextStep: "刷新以重新读取已确认记录。" },
    candidates: [],
    records,
  };
}

export function mapCommandDeckConnectedSource(data: ConnectedPanelData, decisions: DecisionArchiveSource): Extract<CommandDeckOverview, { kind: "ready" }> {
  if (!data.readContext || data.readContext.projectId !== data.project.id) throw new Error("connected_panel_read_failed");
  const tasks = mapMissionControlConnectedSource(data).recordedTasks;
  const count = (kind: RecordedTask["taskType"]) => tasks.filter(task => task.taskType === kind).length;
  return {
    kind: "ready", userId: data.readContext.userId, projectId: data.project.id,
    readState: connectedReadState(data, data.activities.length + data.syncRuns.length + data.briefs.length),
    cards: {
      "project-galaxy": data.project.status ?? "项目背景可稍后填写",
      "flight-log": `最近读取 · 活动 ${boundedActivities(data.activities, 500).length} · 同步 ${data.syncRuns.length}`,
      "mission-control": `最近列出（最多 100 项） · 开放 Issue ${count("issue")} · PR ${count("pull_request")} · 失败工作流 ${count("workflow_failure")}`,
      "decision-archive": decisions.readState?.kind === "not_enabled" ? "决策记录存储尚未启用" : decisions.readState?.kind === "authorization_revoked" ? decisions.readState.label : `只读存储返回 · 正式决策 ${decisions.records.length}`,
      copilot: `最近读取 · 简报 ${data.briefs.length} · 已完成 ${data.briefs.filter(brief => brief.status === "completed").length}`,
    },
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
    readState: { ...connectedReadState(data, sorted.length), scopeLabel: "当前项目 · 各来源最近 100 条合并后的最近 100 个活动、同步及简报事件" },
    lastSuccessfulAt: successful[0] ?? null,
    provenanceLabel: "Connected 数据 · 当前项目",
  };
}
