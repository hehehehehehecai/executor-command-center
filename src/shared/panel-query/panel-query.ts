export type PanelMode = "preview" | "connected";

export interface PanelQuery<T> {
  load(): Promise<T>;
}
