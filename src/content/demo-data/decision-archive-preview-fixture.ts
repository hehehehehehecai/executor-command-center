import type {
  DecisionActionContext,
  DecisionArchiveSource,
  DecisionCandidate,
} from "@/features/decision-archive";

import { clonePreviewFixture } from "./clone-preview-fixture";

function candidate(
  id: string,
  overrides: Partial<DecisionCandidate> = {},
): DecisionCandidate {
  return {
    id,
    proposedDecision: "采用虚构的分阶段发布策略",
    rationale: "虚构发布记录显示，大批量变更需要更明确的人工确认窗口。",
    alternatives: ["继续整批发布", "暂停所有发布"],
    references: [
      {
        id: `${id}-ref-pr`,
        kind: "pull_request",
        label: "虚构 PR #17",
        originalUrl: "https://github.example.test/fictional/odyssey/pull/17",
      },
    ],
    unknowns: "系统不知道线下评审、用户动机和本地未提交内容。",
    sourceLabel: "本地 Candidate stub · 完全虚构 · 无模型调用",
    generatedAt: "2026-08-16T10:00:00.000Z",
    status: "pending",
    confirmedRecordId: null,
    revisitCondition: "发布失败率连续上升时重新审视",
    ...overrides,
  };
}

const defaultCase: DecisionArchiveSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  candidates: [
    candidate("candidate-release-window"),
    candidate("candidate-confirmed", {
      proposedDecision: "保留 Preview 数据披露",
      rationale: "虚构体验测试需要事实与演示数据边界清晰。",
      alternatives: ["只使用颜色提示"],
      references: [],
      generatedAt: "2026-08-15T10:00:00.000Z",
      status: "confirmed",
      confirmedRecordId: "record-confirmed-candidate",
      revisitCondition: null,
    }),
  ],
  records: [
    {
      id: "record-manual-preview",
      decision: "每个虚构阶段结束后进行人工复盘",
      confirmationReason: "由用户主动记录，以保留明确的决策依据。",
      alternatives: ["仅在大版本后复盘"],
      references: [],
      status: "active",
      revisitCondition: "复盘成本超过收益时重新审视",
      createdVia: "manual",
      confirmedBy: "preview-captain",
      confirmedAt: "2026-08-14T09:00:00.000Z",
      sourceCandidateId: null,
    },
    {
      id: "record-confirmed-candidate",
      decision: "保留 Preview 数据披露",
      confirmationReason: "用户确认不能让虚构数据看起来像真实连接。",
      alternatives: ["只使用颜色提示"],
      references: [],
      status: "active",
      revisitCondition: null,
      createdVia: "candidate_confirmation",
      confirmedBy: "preview-captain",
      confirmedAt: "2026-08-15T11:00:00.000Z",
      sourceCandidateId: "candidate-confirmed",
    },
  ],
};

const localActionContext: DecisionActionContext = {
  recordId: "record-local-preview",
  actorId: "preview-captain",
  occurredAt: "2026-08-17T14:00:00.000Z",
};

export const decisionArchivePreviewFixture = {
  metadata: {
    fixtureVersion: "decision-archive-preview.v1",
    disclosure: "演示数据 · 完全虚构",
    usesRealUserData: false,
    requiresNetwork: false,
    invokesModel: false,
  },
  localActionContext,
  cases: {
    default: defaultCase,
    noCandidates: { ...defaultCase, candidates: [] },
    noRecords: { ...defaultCase, records: [] },
  },
  actionCases: {
    emptyReason: {
      candidateId: "candidate-release-window",
      confirmationReason: "   ",
    },
    duplicateConfirmation: {
      candidateId: "candidate-confirmed",
      confirmationReason: "重复确认不应成功",
    },
  },
} as const;

export async function loadDecisionArchivePreviewFixture(): Promise<DecisionArchiveSource> {
  return clonePreviewFixture(decisionArchivePreviewFixture.cases.default);
}
