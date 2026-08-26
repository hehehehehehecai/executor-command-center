import { flightLogPreviewFixture, loadFlightLogPreviewFixture } from "@/content/demo-data/flight-log-preview-fixture";
import {
  FlightLogPanel,
  createFlightLogConnectedQuery,
  createFlightLogPreviewQuery,
  flightLogEventTypes,
  flightLogTimeRanges,
  type FlightLogConnectedPort,
  type FlightLogEventType,
  type FlightLogFilterSelection,
  type FlightLogTimeRange,
} from "@/features/flight-log";
import { parsePanelMode, type PanelMode } from "@/shared/panel-query";
import { AccessibleStatusShell } from "@/shared/status-shell/AccessibleStatusShell";
import { readConnectedPanelFixtureAccess } from "@/testing/connected-panels/connected-panel-fixture-session";

export const dynamic = "force-dynamic";

type FlightLogSearchParams = {
  readonly apply?: string | string[];
  readonly mode?: string | string[];
  readonly range?: string | string[];
  readonly type?: string | string[];
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

function values(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}

function requestedFilters(
  searchParams: FlightLogSearchParams,
  now: string,
): FlightLogFilterSelection | "invalid" {
  const range = searchParams.range ?? "all";

  if (
    typeof range !== "string" ||
    !flightLogTimeRanges.includes(range as FlightLogTimeRange)
  ) {
    return "invalid";
  }

  const requestedTypes = values(searchParams.type);
  if (
    requestedTypes.some(
      (eventType) =>
        !flightLogEventTypes.includes(eventType as FlightLogEventType),
    )
  ) {
    return "invalid";
  }

  const eventTypes =
    searchParams.apply === "1"
      ? (requestedTypes as FlightLogEventType[])
      : flightLogEventTypes;

  return {
    eventTypes,
    timeRange: range as FlightLogTimeRange,
    now,
  };
}

function statusShell(message: string) {
  return (
    <AccessibleStatusShell
      kicker="Flight Log · 航行日志"
      title="Flight Log"
      state="failed"
      reason={message}
      nextStep="返回 Command Deck 检查筛选条件，或稍后重新读取。"
    />
  );
}

const unavailableConnectedPort: FlightLogConnectedPort = {
  load: async () => {
    throw new Error("flight_log_connected_unavailable");
  },
};

export default async function FlightLogPage(input: {
  readonly searchParams: Promise<FlightLogSearchParams>;
  readonly connectedPort?: FlightLogConnectedPort;
  readonly now?: () => string;
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
  const now =
    input.now?.() ??
    fixtureSession?.now ??
    (mode === "preview"
      ? flightLogPreviewFixture.now
      : new Date().toISOString());
  const filters = requestedFilters(searchParams, now);

  if (filters === "invalid") {
    return statusShell("筛选条件无效。");
  }

  const query =
    mode === "preview"
      ? createFlightLogPreviewQuery(loadFlightLogPreviewFixture, filters)
      : createFlightLogConnectedQuery(
          input.connectedPort ??
            (fixtureSession
              ? { load: async () => fixtureSession.flightLog }
              : unavailableConnectedPort),
          filters,
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

  return <FlightLogPanel viewModel={result.viewModel} />;
}
