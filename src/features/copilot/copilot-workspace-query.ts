import {
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  resolvePanelQuery,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

import {
  createCopilotWorkspaceViewModel,
  type CopilotWorkspaceSource,
  type CopilotWorkspaceViewModel,
} from "./copilot-workspace-view-model";

export type CopilotWorkspacePreviewLoader = () => Promise<CopilotWorkspaceSource>;

export interface CopilotWorkspaceConnectedPort {
  load(): Promise<CopilotWorkspaceSource>;
}

export interface CopilotWorkspaceQueryDependencies {
  readonly previewLoader: CopilotWorkspacePreviewLoader;
  readonly connectedPort: CopilotWorkspaceConnectedPort;
}

export function createCopilotWorkspacePreviewQuery(
  loader: CopilotWorkspacePreviewLoader,
): PanelQuery<CopilotWorkspaceViewModel> {
  return createPreviewPanelQuery(async () =>
    createCopilotWorkspaceViewModel(await loader(), "preview"),
  );
}

export function createCopilotWorkspaceConnectedQuery(
  port: CopilotWorkspaceConnectedPort,
): PanelQuery<CopilotWorkspaceViewModel> {
  return createConnectedPanelQuery({
    load: async () =>
      createCopilotWorkspaceViewModel(await port.load(), "connected"),
  });
}

export function resolveCopilotWorkspaceQuery(
  mode: PanelMode,
  dependencies: CopilotWorkspaceQueryDependencies,
): PanelQuery<CopilotWorkspaceViewModel> {
  return resolvePanelQuery(mode, {
    preview: createCopilotWorkspacePreviewQuery(dependencies.previewLoader),
    connected: createCopilotWorkspaceConnectedQuery(
      dependencies.connectedPort,
    ),
  });
}
