import {
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  resolvePanelQuery,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

import {
  mapProjectGalaxyViewModel,
  type ProjectGalaxySource,
  type ProjectGalaxyViewModel,
} from "./project-galaxy-view-model";

export type ProjectGalaxyPreviewLoader = () => Promise<ProjectGalaxySource>;

export interface ProjectGalaxyConnectedPort {
  load(): Promise<ProjectGalaxySource>;
}

export interface ProjectGalaxyQueryDependencies {
  readonly previewLoader: ProjectGalaxyPreviewLoader;
  readonly connectedPort: ProjectGalaxyConnectedPort;
}

export function createProjectGalaxyPreviewQuery(
  loader: ProjectGalaxyPreviewLoader,
): PanelQuery<ProjectGalaxyViewModel> {
  return createPreviewPanelQuery(async () =>
    mapProjectGalaxyViewModel(await loader(), "preview"),
  );
}

export function createProjectGalaxyConnectedQuery(
  port: ProjectGalaxyConnectedPort,
): PanelQuery<ProjectGalaxyViewModel> {
  return createConnectedPanelQuery({
    load: async () => mapProjectGalaxyViewModel(await port.load(), "connected"),
  });
}

export function resolveProjectGalaxyQuery(
  mode: PanelMode,
  dependencies: ProjectGalaxyQueryDependencies,
): PanelQuery<ProjectGalaxyViewModel> {
  return resolvePanelQuery(mode, {
    preview: createProjectGalaxyPreviewQuery(dependencies.previewLoader),
    connected: createProjectGalaxyConnectedQuery(dependencies.connectedPort),
  });
}
