import { afterEach, describe, expect, it, vi } from "vitest";

import { createIssueDraft } from "./issue-draft";
import type { MissionSuggestion } from "./mission-control-view-model";

function suggestion(overrides: Partial<MissionSuggestion> = {}): MissionSuggestion {
  return {
    id: "suggestion-accepted",
    title: "整理虚构发布检查",
    rationale: "虚构工作流需要一次人工复核。",
    evidence: [],
    unknowns: "系统不知道本地环境状态。",
    ruleVersion: "mission-rule.v1",
    status: "accepted",
    provenanceLabel: "本地系统建议 · 完全虚构",
    draftTitle: "chore: 整理虚构发布检查",
    draftBody: "## 背景\n\n此草稿完全虚构，请人工核验后手动创建。",
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Mission Control Issue draft", () => {
  it("creates only a deterministic local draft with source lineage", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const input = suggestion();

    const first = createIssueDraft(input);
    const second = createIssueDraft(input);

    expect(first).toEqual({
      title: "chore: 整理虚构发布检查",
      body: "## 背景\n\n此草稿完全虚构，请人工核验后手动创建。",
      sourceSuggestionId: "suggestion-accepted",
    });
    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(["title", "body", "sourceSuggestionId"]);
    expect(first).not.toHaveProperty("number");
    expect(first).not.toHaveProperty("url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails explicitly when required draft input is missing", () => {
    expect(() => createIssueDraft(suggestion({ draftTitle: null }))).toThrow(
      "mission_issue_draft_invalid",
    );
    expect(() => createIssueDraft(suggestion({ draftBody: "   " }))).toThrow(
      "mission_issue_draft_invalid",
    );
  });

  it("does not equate non-accepted states with remote creation", () => {
    expect(() => createIssueDraft(suggestion({ status: "suggested" }))).toThrow(
      "mission_issue_draft_not_accepted",
    );
    expect(() => createIssueDraft(suggestion({ status: "completed" }))).toThrow(
      "mission_issue_draft_not_accepted",
    );
  });
});
