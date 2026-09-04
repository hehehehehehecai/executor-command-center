import type { PanelMode } from "@/shared/panel-query";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";

import {
  createCopilotContext,
  type CopilotContext,
  type CopilotContextTransitionReason,
} from "./copilot-context";
import {
  createCopilotProjectBriefViewModel,
  type CopilotProjectBriefViewModel,
} from "./copilot-project-brief-view-model";

export type CopilotWorkspaceTransitionReason =
  | "initialized"
  | CopilotContextTransitionReason;

export interface CopilotWorkspaceSource {
  readonly provenanceLabel: string;
  readonly context: CopilotContext;
  readonly lastTransitionReason: CopilotWorkspaceTransitionReason;
  readonly projectBrief?:
    | { readonly status: "ready"; readonly briefId: string; readonly brief: ProjectBrief }
    | { readonly status: "not_found" | "expired" | "invalid" | "evidence_validation_failed" | "unavailable" };
  readonly followUp?: {
    readonly status: "preview" | "unavailable";
    readonly message: string;
  };
}

export type CopilotProjectBriefState =
  | { readonly status: "ready"; readonly value: CopilotProjectBriefViewModel }
  | { readonly status: "not_found" | "expired" | "invalid" | "evidence_validation_failed" | "unavailable" };

export interface CopilotWorkspaceViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly context: CopilotContext;
  readonly lastTransitionReason: CopilotWorkspaceTransitionReason;
  readonly projectBrief: CopilotProjectBriefState;
  readonly followUp: {
    readonly status: "preview" | "unavailable";
    readonly message: string;
  };
}

export function createCopilotWorkspaceViewModel(
  source: CopilotWorkspaceSource,
  mode: PanelMode,
  selectedEvidence: string | null = null,
): CopilotWorkspaceViewModel {
  const projectBrief: CopilotProjectBriefState = source.projectBrief?.status === "ready"
    ? {
        status: "ready",
        value: createCopilotProjectBriefViewModel(source.projectBrief.brief, {
          briefId: source.projectBrief.briefId,
          mode,
          selectedEvidence,
        }),
      }
    : { status: source.projectBrief?.status ?? "not_found" };
  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    context: createCopilotContext(source.context),
    lastTransitionReason: source.lastTransitionReason,
    projectBrief,
    followUp: source.followUp ?? {
      status: "unavailable",
      message: "追问暂不可用。",
    },
  };
}
