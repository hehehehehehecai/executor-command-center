import type { MissionSuggestion } from "./mission-control-view-model";

export interface IssueDraft {
  readonly title: string;
  readonly body: string;
  readonly sourceSuggestionId: string;
}

export function createIssueDraft(suggestion: MissionSuggestion): IssueDraft {
  if (suggestion.status !== "accepted") {
    throw new Error("mission_issue_draft_not_accepted");
  }

  const title = suggestion.draftTitle?.trim();
  const body = suggestion.draftBody?.trim();

  if (!title || !body) {
    throw new Error("mission_issue_draft_invalid");
  }

  return {
    title,
    body,
    sourceSuggestionId: suggestion.id,
  };
}
