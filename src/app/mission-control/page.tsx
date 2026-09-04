import { loadMissionControlPreviewFixture } from "@/content/demo-data/mission-control-preview-fixture";
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
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";
import { AccessibleStatusShell } from "@/shared/status-shell/AccessibleStatusShell";
import { readConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture-session";

export const dynamic = "force-dynamic";

type MissionControlSearchParams = {
  readonly action?: string | string[];
  readonly mode?: string | string[];
  readonly nextStatus?: string | string[];
  readonly project?: string | string[];
  readonly suggestionId?: string | string[];
};

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function requestedMode(value: string | string[] | undefined): PanelMode | "invalid" {
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
    <AccessibleStatusShell
      kicker="Mission Control · 任务中枢"
      title="Mission Control"
      state="failed"
      reason={message}
      nextStep="返回 Command Deck 检查面板入口，或稍后安全重试。"
    />
  );
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

  const result = await Promise.resolve()
    .then(async () => mode === "preview"
      ? createMissionControlPreviewQuery(loadMissionControlPreviewFixture)
      : createMissionControlConnectedQuery(
          input.connectedPort ??
            (fixtureSession
              ? { load: async () => fixtureSession.missionControl }
              : await createMissionControlProductionConnectedPort(
                  single(searchParams.project) ?? null,
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
    <MissionControlPanel
      viewModel={actionResult.viewModel}
      feedback={actionResult.feedback}
    />
  );
}
