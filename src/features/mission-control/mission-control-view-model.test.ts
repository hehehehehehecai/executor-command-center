import { describe, expect, expectTypeOf, it } from "vitest";

import type { PanelMode } from "@/shared/panel-query";

import {
  allowedSuggestionTransitions,
  createMissionControlViewModel,
  missionSuggestionStatuses,
  transitionMissionControlSuggestion,
  type MissionControlSource,
  type MissionControlViewModel,
} from "./mission-control-view-model";

function source(): MissionControlSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    recordedTasks: [
      {
        id: "task-z",
        taskType: "issue",
        title: "相同标题",
        state: "open",
        sourceLabel: "fictional/starship#7",
        originalUrl: "https://github.example.test/fictional/starship/issues/7",
      },
      {
        id: "task-a",
        taskType: "workflow_failure",
        title: "修复虚构检查",
        state: "failed",
        sourceLabel: "fictional/starship · CI",
        originalUrl: "javascript:alert(1)",
      },
    ],
    suggestions: missionSuggestionStatuses.map((status, index) => ({
      id: `suggestion-${status}`,
      title: index === 0 ? "相同标题" : `${status} 建议`,
      rationale: "根据虚构活动形成的候选行动。",
      evidence: [{ label: "虚构证据", originalUrl: null }],
      unknowns: "系统不知道本地未提交工作。",
      ruleVersion: "mission-rule.v1",
      status,
      provenanceLabel: "本地系统建议 · 完全虚构",
      draftTitle: `草稿 ${status}`,
      draftBody: `正文 ${status}`,
    })),
  };
}

describe("Mission Control View Model", () => {
  it("freezes the exact five suggestion statuses and one shared shape", () => {
    expect(missionSuggestionStatuses).toEqual([
      "suggested",
      "accepted",
      "snoozed",
      "dismissed",
      "completed",
    ]);

    const result = createMissionControlViewModel(source(), "preview");

    expectTypeOf(result).toEqualTypeOf<MissionControlViewModel>();
    expectTypeOf(result.mode).toEqualTypeOf<PanelMode>();
    expect(result.suggestions.map(({ status }) => status).sort()).toEqual(
      [...missionSuggestionStatuses].sort(),
    );
  });

  it("keeps recorded tasks and suggestions separate and aligns by stable ID", () => {
    const result = createMissionControlViewModel(source(), "preview");

    expect(result.recordedTasks.map(({ id }) => id)).toEqual(["task-a", "task-z"]);
    expect(result.suggestions).toHaveLength(5);
    expect(result.recordedTasks.filter(({ title }) => title === "相同标题")).toHaveLength(1);
    expect(result.suggestions.filter(({ title }) => title === "相同标题")).toHaveLength(1);
  });

  it("sanitizes recorded and evidence links to credential-free https only", () => {
    const result = createMissionControlViewModel(source(), "preview");

    expect(result.recordedTasks.find(({ id }) => id === "task-a")?.originalUrl).toBeNull();
    expect(result.recordedTasks.find(({ id }) => id === "task-z")?.originalUrl).toMatch(/^https:/);
  });

  it("freezes an explicit deterministic transition graph", () => {
    expect(allowedSuggestionTransitions).toEqual({
      suggested: ["accepted", "snoozed", "dismissed"],
      accepted: ["snoozed", "dismissed", "completed"],
      snoozed: ["suggested", "accepted", "dismissed"],
      dismissed: ["suggested"],
      completed: [],
    });
  });

  it("transitions one suggestion locally without moving or changing recorded tasks", () => {
    const initial = createMissionControlViewModel(source(), "preview");
    const recordedSnapshot = structuredClone(initial.recordedTasks);
    const result = transitionMissionControlSuggestion(
      initial,
      "suggestion-suggested",
      "accepted",
    );

    expect(result.recordedTasks).toEqual(recordedSnapshot);
    expect(result.recordedTasks).toHaveLength(initial.recordedTasks.length);
    expect(result.suggestions).toHaveLength(initial.suggestions.length);
    expect(
      result.suggestions.find(({ id }) => id === "suggestion-suggested")?.status,
    ).toBe("accepted");
    expect(
      initial.suggestions.find(({ id }) => id === "suggestion-suggested")?.status,
    ).toBe("suggested");
  });

  it.each([
    ["suggestion-suggested", "accepted"],
    ["suggestion-accepted", "completed"],
    ["suggestion-snoozed", "suggested"],
    ["suggestion-dismissed", "suggested"],
  ] as const)("applies a valid local transition from %s to %s", (id, nextStatus) => {
    const initial = createMissionControlViewModel(source(), "preview");
    const result = transitionMissionControlSuggestion(initial, id, nextStatus);

    expect(result.suggestions.find((item) => item.id === id)?.status).toBe(nextStatus);
    expect(result.recordedTasks).toEqual(initial.recordedTasks);
  });

  it("fails an invalid transition and unknown suggestion closed", () => {
    const initial = createMissionControlViewModel(source(), "preview");

    expect(() =>
      transitionMissionControlSuggestion(initial, "suggestion-completed", "accepted"),
    ).toThrow("mission_suggestion_transition_invalid");
    expect(() =>
      transitionMissionControlSuggestion(initial, "missing", "accepted"),
    ).toThrow("mission_suggestion_not_found");
  });
});
