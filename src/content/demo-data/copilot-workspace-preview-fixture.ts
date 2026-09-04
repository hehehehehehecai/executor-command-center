import type {
  CopilotContext,
  CopilotContextIdentity,
  CopilotWorkspaceSource,
} from "@/features/copilot";
import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
  type ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";

import { clonePreviewFixture } from "./clone-preview-fixture";

const previewProjectId = "20000000-0000-4000-8000-000000000002";

function evidenceRef(
  sourceKind: ProjectBriefEvidenceRef["sourceKind"],
  sourceId: string,
): ProjectBriefEvidenceRef {
  return {
    contractVersion: projectBriefEvidenceRefContractVersion,
    sourceKind,
    sourceId,
    projectId: previewProjectId,
  };
}

function previewBrief(): ProjectBrief {
  const profile = evidenceRef("project_profile", "fictional-profile");
  const issue = evidenceRef("github_issue", "fictional-issue-42");
  const freshness = evidenceRef("freshness", "fictional-freshness");
  return {
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    projectId: previewProjectId,
    evidenceFingerprint: "a".repeat(64),
    rangeStart: "2026-08-01T00:00:00.000Z",
    rangeEnd: "2026-08-18T00:00:00.000Z",
    officialStatus: { value: "in_development", evidenceRefs: [profile] },
    summary: {
      text: "虚构的探索者项目已完成导航基线，正在验证简报展示。",
      evidenceRefs: [issue],
    },
    completedChanges: [{
      id: "fictional-navigation",
      text: "完成虚构导航基线。",
      evidenceRefs: [issue],
    }],
    ongoingWork: [{
      id: "fictional-brief-ui",
      text: "验证虚构 Brief UI。",
      evidenceRefs: [issue],
    }],
    openItems: [],
    riskSignals: [],
    unknowns: [{
      id: "fictional-unknown",
      text: "下一里程碑尚待确认。",
      missingEvidence: ["已确认决策记录"],
    }],
    evidenceRefs: [profile, issue, freshness],
    freshness: {
      status: "fresh",
      evaluatedAt: "2026-08-18T01:00:00.000Z",
      lastSuccessfulAt: "2026-08-18T00:30:00.000Z",
      coverageComplete: true,
      evidenceRefs: [freshness],
    },
    boundaryNote: projectBriefBoundaryNote,
  };
}

function context(
  overrides: Partial<CopilotContext> = {},
): CopilotContext {
  return {
    featureId: "project-galaxy",
    projectId: previewProjectId,
    evidenceReferenceIds: ["evidence-goal"],
    ...overrides,
  };
}

const defaultCase: CopilotWorkspaceSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  context: context({
    evidenceReferenceIds: ["evidence-goal", "evidence-freshness"],
  }),
  lastTransitionReason: "initialized",
  projectBrief: {
    status: "ready",
    briefId: "30000000-0000-4000-8000-000000000003",
    brief: previewBrief(),
  },
  followUp: {
    status: "preview",
    message: "虚构追问示例，不会调用模型。",
  },
};

const emptyCase: CopilotWorkspaceSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  context: context({
    featureId: "copilot",
    projectId: null,
    evidenceReferenceIds: [],
  }),
  lastTransitionReason: "initialized",
  projectBrief: { status: "not_found" },
  followUp: { status: "unavailable", message: "追问暂不可用。" },
};

const staleCase: CopilotWorkspaceSource = {
  ...defaultCase,
  projectBrief: { status: "expired" },
  followUp: { status: "unavailable", message: "已过期 Brief 不可追问。" },
};

function transitionCase(
  current: CopilotContext,
  nextIdentity: CopilotContextIdentity,
) {
  return { current, nextIdentity };
}

export const copilotWorkspacePreviewFixture = {
  metadata: {
    fixtureVersion: "copilot-workspace-preview.v1",
    disclosure: "演示数据 · 完全虚构",
    usesRealUserData: false,
    requiresNetwork: false,
    invokesModel: false,
    containsModelOutput: false,
  },
  cases: {
    default: defaultCase,
    empty: emptyCase,
    stale: staleCase,
  },
  followUpCases: {
    success: {
      status: "answered" as const,
      answer: "虚构项目已完成导航基线。",
    },
    rejected: {
      status: "rejected" as const,
      code: "follow_up_out_of_scope" as const,
    },
  },
  transitionCases: {
    sameIdentity: transitionCase(context(), {
      featureId: "project-galaxy",
      projectId: previewProjectId,
    }),
    featureSwitch: transitionCase(context(), {
      featureId: "flight-log",
      projectId: previewProjectId,
    }),
    projectSwitch: transitionCase(context(), {
      featureId: "project-galaxy",
      projectId: "90000000-0000-4000-8000-000000000009",
    }),
    nullProject: transitionCase(context(), {
      featureId: "project-galaxy",
      projectId: null,
    }),
    duplicateEvidence: {
      current: context(),
      evidenceReferenceIds: [
        "evidence-goal",
        "evidence-decision",
        "evidence-goal",
      ],
    },
  },
  actionCases: {
    unknownFeature: {
      featureId: "unknown-feature",
      projectId: previewProjectId,
    },
  },
};

export async function loadCopilotWorkspacePreviewFixture(): Promise<CopilotWorkspaceSource> {
  return clonePreviewFixture(copilotWorkspacePreviewFixture.cases.default);
}
