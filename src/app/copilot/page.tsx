import { readWorkspaceEntry } from "@/infrastructure/workspace/workspace-entry";
import { WorkspaceEntryStatus, WorkspacePanelFrame } from "@/features/command-deck/workspace-entry-frame";
import { workspaceHref } from "@/shared/workspace-navigation";
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

export const dynamic = "force-dynamic";

type CopilotSearchParams = {
  readonly briefId?: string | string[];
  readonly action?: string | string[];
  readonly evidenceReferenceIds?: string | string[];
  readonly featureId?: string | string[];
  readonly fromEvidence?: string | string[];
  readonly fromFeatureId?: string | string[];
  readonly fromProjectId?: string | string[];
  readonly mode?: string | string[];
  readonly project?: string | string[];
  readonly projectId?: string | string[];
  readonly selectedEvidence?: string | string[];
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

export function projectIdForConnectedLoad(searchParams: CopilotSearchParams) {
  const action = single(searchParams.action);
  if (action === "switch") return projectId(single(searchParams.projectId));
  if (action === "evidence") return projectId(single(searchParams.fromProjectId));
  return projectId(single(searchParams.projectId));
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
          projectBrief: viewModel.mode === "connected"
            ? viewModel.projectBrief
            : transition.reason === "identity_unchanged"
            ? viewModel.projectBrief
            : { status: "not_found" },
          followUp: viewModel.mode === "connected"
            ? viewModel.followUp
            : transition.reason === "identity_unchanged"
            ? viewModel.followUp
            : { status: "unavailable", message: "上下文已变化，请重新加载当前项目 Brief。" },
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
  const parameters = await input.searchParams;
  const context = await readWorkspaceEntry("copilot", parameters);
  const { entry, fixtureSession } = context;
  if (entry.kind !== "ready" && entry.kind !== "preview") return <WorkspaceEntryStatus context={context} />;
  const mode = entry.kind === "preview" ? "preview" : "connected";
  const projectId = entry.kind === "ready" ? entry.project.id : null;
  const searchParams = mode === "connected" ? { ...parameters, projectId: projectId ?? undefined } : parameters;
  const previewFixture = mode === "preview" ? await import("@/content/demo-data/copilot-workspace-preview-fixture") : null;
  const returnHref = workspaceHref("home", { projectId, mode: mode === "preview" ? "preview" : undefined });
  const statusShell = (message: string) => <WorkspaceEntryStatus context={{ ...context, entry: { ...entry, kind: "unavailable", reason: message } }} />;
  let connectedPort: CopilotWorkspaceConnectedPort | null = null;
  if (mode === "connected") {
    if (input.connectedPort) {
      connectedPort = input.connectedPort;
    } else if (fixtureSession) {
      connectedPort = { load: async () => fixtureSession.copilot };
    } else {
      connectedPort = await import("./copilot-connected-dependencies")
        .then(({ createCopilotConnectedPort }) =>
          createCopilotConnectedPort(projectId, single(searchParams.briefId)))
        .catch(() => unavailableConnectedPort);
    }
  }

  const query =
    mode === "preview"
      ? createCopilotWorkspacePreviewQuery(
          previewFixture!.loadCopilotWorkspacePreviewFixture,
          single(searchParams.selectedEvidence) ?? null,
        )
      : createCopilotWorkspaceConnectedQuery(
          connectedPort ?? unavailableConnectedPort,
          single(searchParams.selectedEvidence) ?? null,
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

  if (mode === "connected" && result.viewModel.context.projectId !== projectId) return statusShell("没有可显示的项目");

  const actionResult = applyLocalAction(result.viewModel, searchParams);

  return (
    <WorkspacePanelFrame context={context}><CopilotWorkspacePanel
      returnHref={returnHref}
      projects={entry.kind === "ready" ? entry.projects : undefined}
      viewModel={actionResult.viewModel}
      feedback={actionResult.feedback}
    /></WorkspacePanelFrame>
  );
}
