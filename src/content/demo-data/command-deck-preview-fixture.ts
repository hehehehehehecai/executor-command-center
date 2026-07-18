import type { FeatureId } from "@/shared/features/feature-definition";

export interface CommandDeckPreviewPanelFixture {
  readonly status: string;
  readonly summary: string;
  readonly detail: string;
}

export interface CommandDeckPreviewFixture {
  readonly fixtureId: "command-deck-preview";
  readonly fixtureVersion: "1.0.0";
  readonly fixtureKind: "fictional-demo";
  readonly provenance: "hand-authored-fictional";
  readonly authoringMethod: "manually-authored-static-fixture";
  readonly containsRealUserData: false;
  readonly derivedFromRealUserData: false;
  readonly networkSource: "none";
  readonly registryContract: "feature-registry.v1";
  readonly disclosure: "演示数据 · 完全虚构";
  readonly project: {
    readonly id: "demo-project-helios-archive";
    readonly name: "Helios Archive";
    readonly repositoryLabel: "demo/helios-archive";
    readonly officialStatus: "in_development";
    readonly freshnessLabel: "演示快照";
  };
  readonly panels: Readonly<
    Record<FeatureId, CommandDeckPreviewPanelFixture>
  >;
}

export const commandDeckPreviewFixture = {
  fixtureId: "command-deck-preview",
  fixtureVersion: "1.0.0",
  fixtureKind: "fictional-demo",
  provenance: "hand-authored-fictional",
  authoringMethod: "manually-authored-static-fixture",
  containsRealUserData: false,
  derivedFromRealUserData: false,
  networkSource: "none",
  registryContract: "feature-registry.v1",
  disclosure: "演示数据 · 完全虚构",
  project: {
    id: "demo-project-helios-archive",
    name: "Helios Archive",
    repositoryLabel: "demo/helios-archive",
    officialStatus: "in_development",
    freshnessLabel: "演示快照",
  },
  panels: {
    "project-galaxy": {
      status: "开发中",
      summary: "核心目标与当前阶段已在演示档案中校准。",
      detail: "5 个演示项目信号已归入当前星图。",
    },
    "flight-log": {
      status: "近期活跃",
      summary: "演示时间线包含提交、Pull Request 与发布记录。",
      detail: "最近 7 天共有 12 条虚构活动记录。",
    },
    "mission-control": {
      status: "等待舰长确认",
      summary: "已记录任务与系统候选建议保持明确分离。",
      detail: "3 个演示任务，2 条演示建议。",
    },
    "decision-archive": {
      status: "决策已归档",
      summary: "已确认决策与候选决策点分别展示。",
      detail: "2 条演示决策，1 个演示候选点。",
    },
    copilot: {
      status: "演示模式",
      summary: "展示有证据边界的项目简报形态。",
      detail: "不调用模型，不消耗任何 AI 配额。",
    },
  },
} as const satisfies CommandDeckPreviewFixture;
