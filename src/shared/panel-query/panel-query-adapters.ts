import type { PanelMode, PanelQuery } from "./panel-query";

export type PreviewPanelLoader<T> = () => Promise<T>;

export interface ConnectedPanelPort<T> {
  load(): Promise<T>;
}

export interface PanelQuerySet<T> {
  readonly preview: PanelQuery<T>;
  readonly connected: PanelQuery<T>;
}

export class InvalidPanelModeError extends Error {
  readonly code = "invalid_panel_mode";

  constructor(value: string) {
    super(`Unsupported panel mode: ${value}`);
    this.name = "InvalidPanelModeError";
  }
}

export function parsePanelMode(value: string): PanelMode {
  if (value === "preview" || value === "connected") {
    return value;
  }

  throw new InvalidPanelModeError(value);
}

export function createPreviewPanelQuery<T>(
  loader: PreviewPanelLoader<T>,
): PanelQuery<T> {
  return {
    load: () => loader(),
  };
}

export function createConnectedPanelQuery<T>(
  port: ConnectedPanelPort<T>,
): PanelQuery<T> {
  return {
    load: () => port.load(),
  };
}

export function resolvePanelQuery<T>(
  mode: PanelMode,
  queries: PanelQuerySet<T>,
): PanelQuery<T> {
  switch (mode) {
    case "preview":
      return queries.preview;
    case "connected":
      return queries.connected;
    default:
      throw new InvalidPanelModeError(String(mode));
  }
}
