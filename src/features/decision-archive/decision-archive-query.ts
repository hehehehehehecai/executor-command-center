import {
  createConnectedPanelQuery,
  createPreviewPanelQuery,
  resolvePanelQuery,
  type PanelMode,
  type PanelQuery,
} from "@/shared/panel-query";

import {
  createDecisionArchiveViewModel,
  type DecisionArchiveSource,
  type DecisionArchiveViewModel,
} from "./decision-archive-view-model";

export type DecisionArchivePreviewLoader = () => Promise<DecisionArchiveSource>;

export interface DecisionArchiveConnectedPort {
  load(): Promise<DecisionArchiveSource>;
}

export interface DecisionArchiveQueryDependencies {
  readonly previewLoader: DecisionArchivePreviewLoader;
  readonly connectedPort: DecisionArchiveConnectedPort;
}

export function createDecisionArchivePreviewQuery(
  loader: DecisionArchivePreviewLoader,
): PanelQuery<DecisionArchiveViewModel> {
  return createPreviewPanelQuery(async () =>
    createDecisionArchiveViewModel(await loader(), "preview"),
  );
}

export function createDecisionArchiveConnectedQuery(
  port: DecisionArchiveConnectedPort,
): PanelQuery<DecisionArchiveViewModel> {
  return createConnectedPanelQuery({
    load: async () =>
      createDecisionArchiveViewModel(await port.load(), "connected"),
  });
}

export function resolveDecisionArchiveQuery(
  mode: PanelMode,
  dependencies: DecisionArchiveQueryDependencies,
): PanelQuery<DecisionArchiveViewModel> {
  return resolvePanelQuery(mode, {
    preview: createDecisionArchivePreviewQuery(dependencies.previewLoader),
    connected: createDecisionArchiveConnectedQuery(dependencies.connectedPort),
  });
}
