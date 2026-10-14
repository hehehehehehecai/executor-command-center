import { readWorkspaceEntry } from "@/infrastructure/workspace/workspace-entry";
import { WorkspaceEntryStatus, WorkspacePanelFrame } from "@/features/command-deck/workspace-entry-frame";
import { workspaceHref } from "@/shared/workspace-navigation";
import { createMissionControlProductionConnectedPort } from "@/app/connected-panel-dependencies";
import {
  MissionControlPanel,
  createMissionControlConnectedQuery,
  createMissionControlPreviewQuery,
  missionSuggestionStatuses,
  transitionMissionControlSuggestion,
  type MissionControlConnectedPort,
  type MissionControlFeedback,
  type MissionControlViewModel,
  type MissionSuggestionStatus,
} from "@/features/mission-control";

export const dynamic = "force-dynamic";

type MissionControlSearchParams = {
  readonly action?: string | string[];
  readonly mode?: string | string[];
  readonly nextStatus?: string | string[];
  readonly project?: string | string[];
  readonly projectId?: string | string[];
  readonly suggestionId?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}



function applyLocalAction(
  viewModel: MissionControlViewModel,
  searchParams: MissionControlSearchParams,
): {
  readonly viewModel: MissionControlViewModel;
  readonly feedback?: MissionControlFeedback;
} {
  const action = single(searchParams.action);
  if (action === undefined) return { viewModel };

  try {
    const suggestionId = single(searchParams.suggestionId) ?? "";
    const nextStatus = single(searchParams.nextStatus) ?? "";

    if (
      action !== "transition" ||
      !missionSuggestionStatuses.includes(nextStatus as MissionSuggestionStatus)
    ) {
      throw new Error("mission_suggestion_action_invalid");
    }

    return {
      viewModel: transitionMissionControlSuggestion(
        viewModel,
        suggestionId,
        nextStatus as MissionSuggestionStatus,
      ),
      feedback: {
        kind: "success",
        message: "建议状态已在本地更新；GitHub 已记录事实保持不变。",
      },
    };
  } catch {
    return {
      viewModel,
      feedback: {
        kind: "error",
        message: "建议状态未改变。",
      },
    };
  }
}

export default async function MissionControlPage(input: {
  readonly searchParams: Promise<MissionControlSearchParams>;
  readonly connectedPort?: MissionControlConnectedPort;
}) {
  const parameters = await input.searchParams;
  const context = await readWorkspaceEntry("mission-control", parameters);
  const { entry, fixtureSession } = context;
  if (entry.kind !== "ready" && entry.kind !== "preview") return <WorkspaceEntryStatus context={context} />;
  const mode = entry.kind === "preview" ? "preview" : "connected";
  const projectId = entry.kind === "ready" ? entry.project.id : null;
  const searchParams = mode === "connected" ? { ...parameters, project: projectId ?? undefined } : parameters;
  const previewFixture = mode === "preview" ? await import("@/content/demo-data/mission-control-preview-fixture") : null;
  const returnHref = workspaceHref("home", { projectId, mode: mode === "preview" ? "preview" : undefined });
  const statusShell = (message: string) => <WorkspaceEntryStatus context={{ ...context, entry: { ...entry, kind: "unavailable", reason: message } }} />;

  const result = await Promise.resolve()
    .then(async () => mode === "preview"
      ? createMissionControlPreviewQuery(previewFixture!.loadMissionControlPreviewFixture)
      : createMissionControlConnectedQuery(
          input.connectedPort ??
            (fixtureSession
              ? { load: async () => fixtureSession.missionControl }
              : await createMissionControlProductionConnectedPort(
                  projectId,
                )),
        ))
    .then((query) => query.load())
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
    <WorkspacePanelFrame context={context}><MissionControlPanel
      returnHref={returnHref}
      projectId={projectId}
      viewModel={actionResult.viewModel}
      feedback={actionResult.feedback}
    /></WorkspacePanelFrame>
  );
}
