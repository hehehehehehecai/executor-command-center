import { readWorkspaceEntry } from "@/infrastructure/workspace/workspace-entry";
import { WorkspaceEntryStatus, WorkspacePanelFrame } from "@/features/command-deck/workspace-entry-frame";
import { workspaceHref } from "@/shared/workspace-navigation";
import { createFlightLogProductionConnectedPort } from "@/app/connected-panel-dependencies";
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

export const dynamic = "force-dynamic";

type FlightLogSearchParams = {
  readonly apply?: string | string[];
  readonly mode?: string | string[];
  readonly project?: string | string[];
  readonly projectId?: string | string[];
  readonly range?: string | string[];
  readonly type?: string | string[];
};


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


export default async function FlightLogPage(input: {
  readonly searchParams: Promise<FlightLogSearchParams>;
  readonly connectedPort?: FlightLogConnectedPort;
  readonly now?: () => string;
}) {
  const parameters = await input.searchParams;
  const context = await readWorkspaceEntry("flight-log", parameters);
  const { entry, fixtureSession } = context;
  if (entry.kind !== "ready" && entry.kind !== "preview") return <WorkspaceEntryStatus context={context} />;
  const mode = entry.kind === "preview" ? "preview" : "connected";
  const projectId = entry.kind === "ready" ? entry.project.id : null;
  const searchParams = mode === "connected" ? { ...parameters, project: projectId ?? undefined } : parameters;
  const previewFixture = mode === "preview" ? await import("@/content/demo-data/flight-log-preview-fixture") : null;
  const returnHref = workspaceHref("home", { projectId, mode: mode === "preview" ? "preview" : undefined });
  const statusShell = (message: string) => <WorkspaceEntryStatus context={{ ...context, entry: { ...entry, kind: "unavailable", reason: message } }} />;
  const now =
    input.now?.() ??
    fixtureSession?.now ??
    (mode === "preview"
      ? previewFixture!.flightLogPreviewFixture.now
      : new Date().toISOString());
  const filters = requestedFilters(searchParams, now);

  if (filters === "invalid") {
    return statusShell("筛选条件无效。");
  }

  const result = await Promise.resolve()
    .then(async () => mode === "preview"
      ? createFlightLogPreviewQuery(previewFixture!.loadFlightLogPreviewFixture, filters)
      : createFlightLogConnectedQuery(
          input.connectedPort ??
            (fixtureSession
              ? { load: async () => fixtureSession.flightLog }
              : await createFlightLogProductionConnectedPort(
                  projectId,
                )),
          filters,
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

  return <WorkspacePanelFrame context={context}><FlightLogPanel viewModel={result.viewModel} projectId={projectId} returnHref={returnHref} /></WorkspacePanelFrame>;
}
