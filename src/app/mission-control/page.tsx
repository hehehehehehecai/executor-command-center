import { loadMissionControlPreviewFixture } from "@/content/demo-data/mission-control-preview-fixture";
import {
  MissionControlPanel,
  createMissionControlConnectedQuery,
  createMissionControlPreviewQuery,
  type MissionControlConnectedPort,
} from "@/features/mission-control";
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";

export const dynamic = "force-dynamic";

type MissionControlSearchParams = {
  readonly mode?: string | string[];
};

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
    <main className="auth-status-shell">
      <p className="section-kicker">Mission Control</p>
      <h1>Mission Control</h1>
      <p>{message}</p>
    </main>
  );
}

const unavailableConnectedPort: MissionControlConnectedPort = {
  load: async () => {
    throw new Error("mission_control_connected_unavailable");
  },
};

export default async function MissionControlPage(input: {
  readonly searchParams: Promise<MissionControlSearchParams>;
  readonly connectedPort?: MissionControlConnectedPort;
}) {
  const searchParams = await input.searchParams;
  const mode = requestedMode(searchParams.mode);

  if (mode === "invalid") {
    return statusShell("面板模式无效。");
  }

  const query =
    mode === "preview"
      ? createMissionControlPreviewQuery(loadMissionControlPreviewFixture)
      : createMissionControlConnectedQuery(
          input.connectedPort ?? unavailableConnectedPort,
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

  return <MissionControlPanel viewModel={result.viewModel} />;
}
