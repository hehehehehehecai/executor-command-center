import type { PanelMode } from "@/shared/panel-query";

export const missionSuggestionStatuses = [
  "suggested",
  "accepted",
  "snoozed",
  "dismissed",
  "completed",
] as const;

export type MissionSuggestionStatus =
  (typeof missionSuggestionStatuses)[number];

export type RecordedTaskType =
  | "issue"
  | "pull_request"
  | "review_request"
  | "workflow_failure";

export type RecordedTaskState = "open" | "pending" | "failed" | "unknown";

export interface RecordedTask {
  readonly id: string;
  readonly taskType: RecordedTaskType;
  readonly title: string;
  readonly state: RecordedTaskState;
  readonly sourceLabel: string;
  readonly originalUrl: string | null;
}

export interface MissionEvidence {
  readonly label: string;
  readonly originalUrl: string | null;
}

export interface MissionSuggestion {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly evidence: readonly MissionEvidence[];
  readonly unknowns: string;
  readonly ruleVersion: string;
  readonly status: MissionSuggestionStatus;
  readonly provenanceLabel: string;
  readonly draftTitle: string | null;
  readonly draftBody: string | null;
}

export interface MissionControlSource {
  readonly provenanceLabel: string;
  readonly recordedTasks: readonly RecordedTask[];
  readonly suggestions: readonly MissionSuggestion[];
}

export interface MissionControlViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly recordedTasks: readonly RecordedTask[];
  readonly suggestions: readonly MissionSuggestion[];
}

export const allowedSuggestionTransitions = {
  suggested: ["accepted", "snoozed", "dismissed"],
  accepted: ["snoozed", "dismissed", "completed"],
  snoozed: ["suggested", "accepted", "dismissed"],
  dismissed: ["suggested"],
  completed: [],
} as const satisfies Readonly<
  Record<MissionSuggestionStatus, readonly MissionSuggestionStatus[]>
>;

function safeHttpsUrl(value: string | null) {
  if (value === null) return null;

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function byStableId<T extends { readonly id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

export function createMissionControlViewModel(
  source: MissionControlSource,
  mode: PanelMode,
): MissionControlViewModel {
  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    recordedTasks: source.recordedTasks
      .map((task) => ({
        ...task,
        originalUrl: safeHttpsUrl(task.originalUrl),
      }))
      .sort(byStableId),
    suggestions: source.suggestions
      .map((suggestion) => ({
        ...suggestion,
        evidence: suggestion.evidence.map((item) => ({
          ...item,
          originalUrl: safeHttpsUrl(item.originalUrl),
        })),
      }))
      .sort(byStableId),
  };
}

export function transitionMissionControlSuggestion(
  viewModel: MissionControlViewModel,
  suggestionId: string,
  nextStatus: MissionSuggestionStatus,
): MissionControlViewModel {
  const current = viewModel.suggestions.find(({ id }) => id === suggestionId);

  if (current === undefined) {
    throw new Error("mission_suggestion_not_found");
  }

  const transitions = allowedSuggestionTransitions[current.status];
  if (!(transitions as readonly MissionSuggestionStatus[]).includes(nextStatus)) {
    throw new Error("mission_suggestion_transition_invalid");
  }

  return {
    ...viewModel,
    suggestions: viewModel.suggestions.map((suggestion) =>
      suggestion.id === suggestionId
        ? { ...suggestion, status: nextStatus }
        : suggestion,
    ),
  };
}
