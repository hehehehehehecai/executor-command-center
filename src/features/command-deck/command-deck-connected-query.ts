import type { ConnectedReadState } from "@/shared/connected-read-state";

export type CommandDeckOverview =
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly userId: string; readonly projectId: string;
      readonly readState: ConnectedReadState; readonly cards: Readonly<Record<string, string>> };

export interface CommandDeckConnectedPort {
  load(): Promise<Extract<CommandDeckOverview, { kind: "ready" }>>;
}

export async function loadCommandDeckOverview(port: CommandDeckConnectedPort, owner: { readonly userId: string; readonly projectId: string }): Promise<CommandDeckOverview> {
  try {
    const overview = await port.load();
    if (overview.userId !== owner.userId || overview.projectId !== owner.projectId) return { kind: "failed" };
    return overview;
  } catch { return { kind: "failed" }; }
}
