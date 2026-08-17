import { loadCopilotWorkspacePreviewFixture } from "@/content/demo-data/copilot-workspace-preview-fixture";
import {
  CopilotWorkspacePanel,
  createCopilotContext,
  createCopilotWorkspaceConnectedQuery,
  createCopilotWorkspacePreviewQuery,
  transitionCopilotContext,
  updateCopilotEvidenceReferences,
  type CopilotContext,
  type CopilotWorkspaceConnectedPort,
  type CopilotWorkspaceFeedback,
  type CopilotWorkspaceViewModel,
} from "@/features/copilot";
import type { FeatureId } from "@/shared/features/feature-definition";
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";
import { readConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture-session";

export const dynamic = "force-dynamic";

type CopilotSearchParams = {
  readonly action?: string | string[];
  readonly evidenceReferenceIds?: string | string[];
  readonly featureId?: string | string[];
  readonly fromEvidence?: string | string[];
  readonly fromFeatureId?: string | string[];
  readonly fromProjectId?: string | string[];
  readonly mode?: string | string[];
  readonly projectId?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function many(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

function projectId(value: string | undefined) {
  return value === undefined || value.length === 0 ? null : value;
}

function requestedMode(
  value: string | string[] | undefined,
): PanelMode | "invalid" {
  if (value === undefined) return "preview";
  if (typeof value !== "string") return "invalid";

  try {
    return parsePanelMode(value);
  } catch {
    return "invalid";
  }
}

function statusShell(message: string) {
  return (
    <main className="auth-status-shell">
      <p className="section-kicker">Copilot Workspace</p>
      <h1>Copilot Workspace</h1>
      <p>{message}</p>
    </main>
  );
}

const unavailableConnectedPort: CopilotWorkspaceConnectedPort = {
  load: async () => {
    throw new Error("copilot_connected_unavailable");
  },
};

function currentContextFrom(
  viewModel: CopilotWorkspaceViewModel,
  searchParams: CopilotSearchParams,
): CopilotContext {
  const fromFeatureId = single(searchParams.fromFeatureId);

  if (fromFeatureId === undefined) {
    return createCopilotContext(viewModel.context);
  }

  return createCopilotContext({
    featureId: fromFeatureId as FeatureId,
    projectId: projectId(single(searchParams.fromProjectId)),
    evidenceReferenceIds: many(searchParams.fromEvidence),
  });
}

function applyLocalAction(
  viewModel: CopilotWorkspaceViewModel,
  searchParams: CopilotSearchParams,
): {
  readonly viewModel: CopilotWorkspaceViewModel;
  readonly feedback?: CopilotWorkspaceFeedback;
} {
  const action = single(searchParams.action);
  if (action === undefined) return { viewModel };

  try {
    const current = currentContextFrom(viewModel, searchParams);

    if (action === "switch") {
      const transition = transitionCopilotContext(current, {
        featureId: (single(searchParams.featureId) ?? "") as FeatureId,
        projectId: projectId(single(searchParams.projectId)),
      });

      return {
        viewModel: {
          ...viewModel,
          context: transition.context,
          lastTransitionReason: transition.reason,
        },
        feedback: {
          kind: "success",
          message:
            transition.reason === "identity_unchanged"
              ? "身份未变化；本地证据引用已保留。"
              : "上下文身份已更新；不相关证据引用已清除。",
        },
      };
    }

    if (action === "evidence") {
      const values = many(searchParams.evidenceReferenceIds).flatMap((value) =>
        value.split(/\r?\n/),
      );
      const transition = updateCopilotEvidenceReferences(current, values);

      return {
        viewModel: {
          ...viewModel,
          context: transition.context,
          lastTransitionReason: transition.reason,
        },
        feedback: {
          kind: "success",
          message: "本地证据引用已更新；未发送到外部服务。",
        },
      };
    }

    throw new Error("copilot_action_invalid");
  } catch {
    return {
      viewModel,
      feedback: {
        kind: "error",
        message: "未知面板，未改变当前上下文。",
      },
    };
  }
}

export default async function CopilotPage(input: {
  readonly searchParams: Promise<CopilotSearchParams>;
  readonly connectedPort?: CopilotWorkspaceConnectedPort;
}) {
  const searchParams = await input.searchParams;
  const mode = requestedMode(searchParams.mode);

  if (mode === "invalid") {
    return statusShell("面板模式无效。");
  }

  const fixtureAccess =
    mode === "connected"
      ? await readConnectedPanelFixtureAccess()
      : ({ kind: "disabled" } as const);
  const fixtureSession =
    fixtureAccess.kind === "authorized" ? fixtureAccess.session : null;

  const query =
    mode === "preview"
      ? createCopilotWorkspacePreviewQuery(loadCopilotWorkspacePreviewFixture)
      : createCopilotWorkspaceConnectedQuery(
          input.connectedPort ??
            (fixtureSession
              ? { load: async () => fixtureSession.copilot }
              : unavailableConnectedPort),
        );
  const result = await query
    .load()
    .then((viewModel) => ({ kind: "success", viewModel }) as const)
    .catch(() => ({ kind: "failure" }) as const);

  if (result.kind === "failure") {
    return statusShell(
      mode === "preview"
        ? "演示数据暂时不可用。"
        : "Connected 数据暂时不可用。",
    );
  }

  const actionResult = applyLocalAction(result.viewModel, searchParams);

  return (
    <CopilotWorkspacePanel
      viewModel={actionResult.viewModel}
      feedback={actionResult.feedback}
    />
  );
}
