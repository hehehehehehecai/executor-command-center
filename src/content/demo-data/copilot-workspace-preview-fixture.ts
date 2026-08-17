import type {
  CopilotContext,
  CopilotContextIdentity,
  CopilotWorkspaceSource,
} from "@/features/copilot";

function context(
  overrides: Partial<CopilotContext> = {},
): CopilotContext {
  return {
    featureId: "project-galaxy",
    projectId: "project-odyssey",
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
};

const emptyCase: CopilotWorkspaceSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  context: context({
    featureId: "copilot",
    projectId: null,
    evidenceReferenceIds: [],
  }),
  lastTransitionReason: "initialized",
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
  },
  transitionCases: {
    sameIdentity: transitionCase(context(), {
      featureId: "project-galaxy",
      projectId: "project-odyssey",
    }),
    featureSwitch: transitionCase(context(), {
      featureId: "flight-log",
      projectId: "project-odyssey",
    }),
    projectSwitch: transitionCase(context(), {
      featureId: "project-galaxy",
      projectId: "project-atlas",
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
      projectId: "project-odyssey",
    },
  },
};

export async function loadCopilotWorkspacePreviewFixture(): Promise<CopilotWorkspaceSource> {
  return copilotWorkspacePreviewFixture.cases.default;
}
