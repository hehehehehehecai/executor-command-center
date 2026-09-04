import {
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  resolvePanelQuery,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

import {
  createMissionControlViewModel,
  type MissionControlSource,
  type MissionControlViewModel,
} from "./mission-control-view-model";

export type MissionControlPreviewLoader = () => Promise<MissionControlSource>;

export interface MissionControlConnectedPort {
  load(): Promise<MissionControlSource>;
}

export interface MissionControlQueryDependencies {
  readonly previewLoader: MissionControlPreviewLoader;
  readonly connectedPort: MissionControlConnectedPort;
}

export function createMissionControlPreviewQuery(
  loader: MissionControlPreviewLoader,
): PanelQuery<MissionControlViewModel> {
  return createPreviewPanelQuery(async () =>
    createMissionControlViewModel(await loader(), "preview"),
  );
}

export function createMissionControlConnectedQuery(
  port: MissionControlConnectedPort,
): PanelQuery<MissionControlViewModel> {
  return createConnectedPanelQuery({
    load: async () =>
      createMissionControlViewModel(await port.load(), "connected"),
  });
}

export function resolveMissionControlQuery(
  mode: PanelMode,
  dependencies: MissionControlQueryDependencies,
): PanelQuery<MissionControlViewModel> {
  return resolvePanelQuery(mode, {
    preview: createMissionControlPreviewQuery(dependencies.previewLoader),
    connected: createMissionControlConnectedQuery(dependencies.connectedPort),
  });
}
