import type {
  CopilotWorkspaceSource,
} from "@/features/copilot";
import type {
  DecisionActionContext,
  DecisionArchiveSource,
} from "@/features/decision-archive";
import type { FlightLogSource } from "@/features/flight-log";
import type { MissionControlSource } from "@/features/mission-control";
import type { ProjectGalaxySource } from "@/features/project-galaxy";

export const connectedPanelFixtureIdentities = {
  userAlpha: {
    userId: "11111111-1111-4111-8111-111111111111",
    projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    actorId: "connected-alpha-captain",
    label: "Alpha",
  },
  userBeta: {
    userId: "22222222-2222-4222-8222-222222222222",
    projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actorId: "connected-beta-captain",
    label: "Beta",
  },
} as const;

type ConnectedPanelFixtureIdentity =
  (typeof connectedPanelFixtureIdentities)[keyof typeof connectedPanelFixtureIdentities];

export interface ConnectedPanelFixtureSession {
  readonly userId: string;
  readonly projectId: string;
  readonly now: "2026-08-17T12:00:00.000Z";
  readonly projectGalaxy: ProjectGalaxySource;
  readonly flightLog: FlightLogSource;
  readonly missionControl: MissionControlSource;
  readonly decisionArchive: DecisionArchiveSource;
  readonly decisionActionContext: DecisionActionContext;
  readonly copilot: CopilotWorkspaceSource;
}

export type ConnectedPanelFixtureAccess =
  | { readonly kind: "disabled" }
  | { readonly kind: "denied" }
  | {
      readonly kind: "authorized";
      readonly session: ConnectedPanelFixtureSession;
    };

export interface ConnectedPanelFixtureAccessInput {
  readonly nodeEnvironment: string | undefined;
  readonly fixtureEnabled: string | undefined;
  readonly verifiedUserId: string | undefined;
  readonly projectId: string | undefined;
}

function projectGalaxy(identity: ConnectedPanelFixtureIdentity): ProjectGalaxySource {
  const freshness: ProjectGalaxySource["freshness"] = identity.label === "Alpha"
    ? {
        kind: "known",
        input: {
          provenance: "real",
          authorizationRevoked: true,
          latestRun: {
            id: "aaaaaaaa-0000-4000-8000-000000000002",
            status: "completed",
            finishedAt: "2026-08-15T10:00:00.000Z",
            errorCode: null,
          },
          lastSuccessfulAt: "2026-08-15T10:00:00.000Z",
          coverageComplete: true,
          now: "2026-08-17T12:00:00.000Z",
        },
      }
    : {
        kind: "unknown",
        provenanceLabel: `Connected test double · ${identity.label}`,
        description: "进程内 Connected 合同数据；未访问外部服务。",
      };
  return {
    project: {
      id: identity.projectId,
      name: `${identity.label} Connected Project`,
      repositoryLabel: `connected-fixture/${identity.label.toLowerCase()}-project`,
    },
    officialStatus: "in_development",
    suggestedStatus: null,
    activity: [
      {
        id: `activity-${identity.label.toLowerCase()}`,
        summary: `${identity.label} 用户的确定性 Connected 活动`,
        occurredAt: "2026-08-17T10:00:00.000Z",
      },
    ],
    freshness,
    coreGoal: `${identity.label} 用户专属项目目标`,
    currentStageGoal: "验证 Connected 面板旅程",
    currentBlockers: [],
    provenanceLabel: `Connected test double · 完全虚构 · ${identity.label}`,
  };
}

function flightLog(identity: ConnectedPanelFixtureIdentity): FlightLogSource {
  const key = identity.label.toLowerCase();

  return {
    provenanceLabel: `Connected test double · 完全虚构 · ${identity.label}`,
    lastSuccessfulAt: "2026-08-17T11:30:00.000Z",
    events: [
      {
        id: `event-${key}-issue`,
        eventType: "issue",
        occurredAt: "2026-08-17T11:00:00.000Z",
        summary: "相同标题的 Connected 事件",
        sourceLabel: `${identity.label} project issue`,
        originalUrl: `https://connected.example.test/${key}/issues/1`,
      },
      {
        id: `event-${key}-commit`,
        eventType: "commit",
        occurredAt: "2026-08-15T11:00:00.000Z",
        summary: `${identity.label} 项目的历史 Commit`,
        sourceLabel: `${identity.label} project commit`,
        originalUrl: `https://connected.example.test/${key}/commits/1`,
      },
    ],
  };
}

function missionControl(identity: ConnectedPanelFixtureIdentity): MissionControlSource {
  const key = identity.label.toLowerCase();

  return {
    provenanceLabel: `Connected test double · 完全虚构 · ${identity.label}`,
    recordedTasks: [
      {
        id: `recorded-task-${key}`,
        taskType: "issue",
        title: `${identity.label} 已记录事实任务`,
        state: "open",
        sourceLabel: `${identity.label} read-only task · ${identity.projectId}`,
        originalUrl: `https://connected.example.test/${key}/tasks/1`,
      },
    ],
    suggestions: [
      {
        id: `suggestion-${key}`,
        title: "相同标题的 Connected 建议",
        rationale: `${identity.label} 项目的确定性候选行动`,
        evidence: [],
        unknowns: "进程内 test double 不知道任何外部状态。",
        ruleVersion: "connected-panel-fixture.v1",
        status: "suggested",
        provenanceLabel: `Connected suggestion · ${identity.label}`,
        draftTitle: `${identity.label} 本地 Issue 草稿`,
        draftBody: `来源项目：${identity.projectId}\n来源用户：${identity.userId}`,
      },
    ],
  };
}

function decisionArchive(
  identity: ConnectedPanelFixtureIdentity,
): DecisionArchiveSource {
  const key = identity.label.toLowerCase();

  return {
    provenanceLabel: `Connected test double · 完全虚构 · ${identity.label}`,
    candidates: [],
    records: [
      {
        id: `decision-record-${key}`,
        decision: "相同标题的 Connected 决策",
        confirmationReason: `${identity.label} 用户既有的确定性原因`,
        alternatives: [],
        references: [],
        status: "active",
        revisitCondition: null,
        createdVia: "manual",
        confirmedBy: identity.actorId,
        confirmedAt: "2026-08-16T09:00:00.000Z",
        sourceCandidateId: null,
      },
    ],
  };
}

function copilot(identity: ConnectedPanelFixtureIdentity): CopilotWorkspaceSource {
  return {
    provenanceLabel: `Connected test double · 完全虚构 · ${identity.label}`,
    context: {
      featureId: "project-galaxy",
      projectId: identity.projectId,
      evidenceReferenceIds: [`evidence-${identity.label.toLowerCase()}-project`],
    },
    lastTransitionReason: "initialized",
  };
}

function session(identity: ConnectedPanelFixtureIdentity): ConnectedPanelFixtureSession {
  const key = identity.label.toLowerCase();

  return {
    userId: identity.userId,
    projectId: identity.projectId,
    now: "2026-08-17T12:00:00.000Z",
    projectGalaxy: projectGalaxy(identity),
    flightLog: flightLog(identity),
    missionControl: missionControl(identity),
    decisionArchive: decisionArchive(identity),
    decisionActionContext: {
      recordId: `decision-record-${key}-local`,
      actorId: identity.actorId,
      occurredAt: "2026-08-17T12:00:00.000Z",
    },
    copilot: copilot(identity),
  };
}

const sessions = Object.values(connectedPanelFixtureIdentities).map(session);

export function resolveConnectedPanelFixtureAccess(
  input: ConnectedPanelFixtureAccessInput,
): ConnectedPanelFixtureAccess {
  if (
    input.nodeEnvironment === "production" ||
    input.fixtureEnabled !== "1"
  ) {
    return { kind: "disabled" };
  }

  const match = sessions.find(
    (candidate) =>
      candidate.userId === input.verifiedUserId &&
      candidate.projectId === input.projectId,
  );

  if (match === undefined) {
    return { kind: "denied" };
  }

  return { kind: "authorized", session: structuredClone(match) };
}
