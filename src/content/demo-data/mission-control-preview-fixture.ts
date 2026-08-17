import type {
  MissionControlSource,
  MissionSuggestion,
} from "@/features/mission-control";

const evidence = [
  {
    label: "虚构 Workflow #314",
    originalUrl: "https://github.example.test/fictional/odyssey/actions/runs/314",
  },
] as const;

function suggestion(
  id: string,
  status: MissionSuggestion["status"],
  overrides: Partial<MissionSuggestion> = {},
): MissionSuggestion {
  return {
    id,
    title: `${status}：复核虚构发布轨道`,
    rationale: "虚构工作流与发布记录之间存在待人工核验的候选行动。",
    evidence,
    unknowns: "系统不知道本地未提交工作、线下讨论或尚未上传的设计记录。",
    ruleVersion: "mission-action-rule.v1",
    status,
    provenanceLabel: "本地系统建议 · 完全虚构",
    draftTitle: status === "accepted" ? "chore: 复核虚构发布轨道" : null,
    draftBody:
      status === "accepted"
        ? "## 背景\n\n基于完全虚构的演示活动生成。请人工核验后在 GitHub 手动创建。"
        : null,
    ...overrides,
  };
}

const defaultCase: MissionControlSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  recordedTasks: [
    {
      id: "github-issue-2048",
      taskType: "issue",
      title: "修复虚构导航焦点回归",
      state: "open",
      sourceLabel: "fictional/odyssey#2048 · GitHub 只读",
      originalUrl: "https://github.example.test/fictional/odyssey/issues/2048",
    },
    {
      id: "github-pr-88",
      taskType: "pull_request",
      title: "复核虚构舰桥布局",
      state: "pending",
      sourceLabel: "fictional/odyssey#88 · GitHub 只读",
      originalUrl: "https://github.example.test/fictional/odyssey/pull/88",
    },
    {
      id: "github-workflow-314",
      taskType: "workflow_failure",
      title: "处理虚构 Preview 检查失败",
      state: "failed",
      sourceLabel: "fictional/odyssey · Workflow #314 · GitHub 只读",
      originalUrl: "https://github.example.test/fictional/odyssey/actions/runs/314",
    },
  ],
  suggestions: [
    suggestion("suggestion-01", "suggested"),
    suggestion("suggestion-02", "accepted"),
    suggestion("suggestion-03", "snoozed"),
    suggestion("suggestion-04", "dismissed"),
    suggestion("suggestion-05", "completed"),
  ],
};

export const missionControlPreviewFixture = {
  metadata: {
    fixtureVersion: "mission-control-preview.v1",
    disclosure: "演示数据 · 完全虚构",
    usesRealUserData: false,
    requiresNetwork: false,
  },
  cases: {
    default: defaultCase,
    noTasks: { ...defaultCase, recordedTasks: [] },
    noSuggestions: { ...defaultCase, suggestions: [] },
    sameTitleDifferentIds: {
      provenanceLabel: "演示数据 · 完全虚构",
      recordedTasks: [],
      suggestions: [
        suggestion("same-title-a", "suggested", { title: "相同标题" }),
        suggestion("same-title-b", "snoozed", { title: "相同标题" }),
      ],
    },
    missingDraftFields: {
      provenanceLabel: "演示数据 · 完全虚构",
      recordedTasks: [],
      suggestions: [
        suggestion("missing-draft", "accepted", {
          draftTitle: null,
          draftBody: null,
        }),
      ],
    },
  },
} as const;

export async function loadMissionControlPreviewFixture(): Promise<MissionControlSource> {
  return missionControlPreviewFixture.cases.default;
}
