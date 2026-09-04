import {
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  resolvePanelQuery,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

import {
  createFlightLogViewModel,
  type FlightLogFilterSelection,
  type FlightLogSource,
  type FlightLogViewModel,
} from "./flight-log-view-model";

export type FlightLogPreviewLoader = () => Promise<FlightLogSource>;

export interface FlightLogConnectedPort {
  load(): Promise<FlightLogSource>;
}

export interface FlightLogQueryDependencies {
  readonly previewLoader: FlightLogPreviewLoader;
  readonly connectedPort: FlightLogConnectedPort;
  readonly filters: FlightLogFilterSelection;
}

export function createFlightLogPreviewQuery(
  loader: FlightLogPreviewLoader,
  filters: FlightLogFilterSelection,
): PanelQuery<FlightLogViewModel> {
  return createPreviewPanelQuery(async () =>
    createFlightLogViewModel(await loader(), "preview", filters),
  );
}

export function createFlightLogConnectedQuery(
  port: FlightLogConnectedPort,
  filters: FlightLogFilterSelection,
): PanelQuery<FlightLogViewModel> {
  return createConnectedPanelQuery({
    load: async () =>
      createFlightLogViewModel(await port.load(), "connected", filters),
  });
}

export function resolveFlightLogQuery(
  mode: PanelMode,
  dependencies: FlightLogQueryDependencies,
): PanelQuery<FlightLogViewModel> {
  return resolvePanelQuery(mode, {
    preview: createFlightLogPreviewQuery(
      dependencies.previewLoader,
      dependencies.filters,
    ),
    connected: createFlightLogConnectedQuery(
      dependencies.connectedPort,
      dependencies.filters,
    ),
  });
}
