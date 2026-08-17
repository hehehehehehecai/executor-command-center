import { describe, expect, it } from "vitest";

import {
  loadMissionControlPreviewFixture,
  missionControlPreviewFixture,
} from "./mission-control-preview-fixture";

describe("Mission Control Preview fixture", () => {
  it("is versioned, completely fictional and network-free", async () => {
    expect(missionControlPreviewFixture.metadata).toEqual({
      fixtureVersion: "mission-control-preview.v1",
      disclosure: "演示数据 · 完全虚构",
      usesRealUserData: false,
      requiresNetwork: false,
    });

    await expect(loadMissionControlPreviewFixture()).resolves.toBe(
      missionControlPreviewFixture.cases.default,
    );
  });

  it("covers recorded tasks, five states, empty sets, duplicate titles and missing draft fields", () => {
    expect(missionControlPreviewFixture.cases.default.recordedTasks.length).toBeGreaterThan(0);
    expect(
      missionControlPreviewFixture.cases.default.suggestions.map(({ status }) => status),
    ).toEqual(["suggested", "accepted", "snoozed", "dismissed", "completed"]);
    expect(missionControlPreviewFixture.cases.noTasks.recordedTasks).toEqual([]);
    expect(missionControlPreviewFixture.cases.noSuggestions.suggestions).toEqual([]);
    expect(
      new Set(missionControlPreviewFixture.cases.sameTitleDifferentIds.suggestions.map(({ id }) => id)).size,
    ).toBe(2);
    expect(
      missionControlPreviewFixture.cases.sameTitleDifferentIds.suggestions[0]?.title,
    ).toBe(missionControlPreviewFixture.cases.sameTitleDifferentIds.suggestions[1]?.title);
    expect(missionControlPreviewFixture.cases.missingDraftFields.suggestions[0]).toMatchObject({
      status: "accepted",
      draftTitle: null,
      draftBody: null,
    });
  });
});
