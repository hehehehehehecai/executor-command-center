import type { PanelMode } from "@/shared/panel-query";

import {
  createCopilotContext,
  type CopilotContext,
  type CopilotContextTransitionReason,
} from "./copilot-context";

export type CopilotWorkspaceTransitionReason =
  | "initialized"
  | CopilotContextTransitionReason;

export interface CopilotWorkspaceSource {
  readonly provenanceLabel: string;
  readonly context: CopilotContext;
  readonly lastTransitionReason: CopilotWorkspaceTransitionReason;
}

export interface CopilotWorkspaceViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly context: CopilotContext;
  readonly lastTransitionReason: CopilotWorkspaceTransitionReason;
}

export function createCopilotWorkspaceViewModel(
  source: CopilotWorkspaceSource,
  mode: PanelMode,
): CopilotWorkspaceViewModel {
  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    context: createCopilotContext(source.context),
    lastTransitionReason: source.lastTransitionReason,
  };
}
