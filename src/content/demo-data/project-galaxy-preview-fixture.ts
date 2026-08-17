import type { ProjectGalaxySource } from "@/features/project-galaxy";

import { clonePreviewFixture } from "./clone-preview-fixture";

const defaultSource = {
  project: {
    id: "demo-project-aurora-cartography",
    name: "Aurora Cartography",
    repositoryLabel: "demo/aurora-cartography",
  },
  officialStatus: "in_development",
  suggestedStatus: {
    value: "polishing",
    rationale: "近期虚构活动表明项目可以进入打磨阶段。",
    generatedAt: "2026-08-17T09:00:00.000Z",
  },
  activity: [
    {
      id: "demo-activity-review",
      summary: "完成虚构导航模型评审",
      occurredAt: "2026-08-17T08:00:00.000Z",
    },
    {
      id: "demo-activity-contract",
      summary: "冻结虚构面板查询合同",
      occurredAt: "2026-08-16T16:30:00.000Z",
    },
    {
      id: "demo-activity-audit",
      summary: "记录虚构项目事实审计",
      occurredAt: "2026-08-16T10:00:00.000Z",
    },
  ],
  freshness: {
    kind: "known",
    input: {
      provenance: "demo",
      authorizationRevoked: false,
      latestRun: {
        id: "77777777-7777-4777-8777-777777777777",
        status: "completed",
        finishedAt: "2026-08-17T08:00:00.000Z",
        errorCode: null,
      },
      lastSuccessfulAt: "2026-08-17T08:00:00.000Z",
      coverageComplete: true,
      now: "2026-08-17T12:00:00.000Z",
    },
  },
  coreGoal: "建立一套完全虚构、可审阅的项目导航系统。",
  currentStageGoal: "验证项目事实、建议和新鲜度的分层展示。",
  currentBlockers: ["等待虚构的跨设备可访问性复核。"],
  provenanceLabel: "演示数据 · 完全虚构",
} as const satisfies ProjectGalaxySource;

export const projectGalaxyPreviewFixture = {
  fixtureId: "project-galaxy-preview",
  fixtureVersion: "1.0.0",
  fixtureKind: "fictional-demo",
  provenance: "hand-authored-fictional",
  authoringMethod: "manually-authored-static-fixture",
  containsRealUserData: false,
  derivedFromRealUserData: false,
  networkSource: "none",
  disclosure: "演示数据 · 完全虚构",
  cases: {
    default: defaultSource,
    withoutSuggestion: {
      ...defaultSource,
      suggestedStatus: null,
    },
    withoutBlockers: {
      ...defaultSource,
      currentBlockers: [],
    },
    stale: {
      ...defaultSource,
      freshness: {
        kind: "known",
        input: {
          ...defaultSource.freshness.input,
          latestRun: null,
          lastSuccessfulAt: "2026-08-15T11:59:59.999Z",
        },
      },
    },
    unknown: {
      ...defaultSource,
      freshness: {
        kind: "unknown",
        provenanceLabel: "演示数据 · 完全虚构",
        description: "该虚构 case 没有可用的同步时间。",
      },
    },
  },
} as const satisfies {
  readonly fixtureId: "project-galaxy-preview";
  readonly fixtureVersion: "1.0.0";
  readonly fixtureKind: "fictional-demo";
  readonly provenance: "hand-authored-fictional";
  readonly authoringMethod: "manually-authored-static-fixture";
  readonly containsRealUserData: false;
  readonly derivedFromRealUserData: false;
  readonly networkSource: "none";
  readonly disclosure: "演示数据 · 完全虚构";
  readonly cases: Readonly<Record<string, ProjectGalaxySource>>;
};

export type ProjectGalaxyPreviewCaseId =
  keyof typeof projectGalaxyPreviewFixture.cases;

export async function loadProjectGalaxyPreviewFixture(
  caseId: ProjectGalaxyPreviewCaseId = "default",
): Promise<ProjectGalaxySource> {
  return clonePreviewFixture(projectGalaxyPreviewFixture.cases[caseId]);
}
