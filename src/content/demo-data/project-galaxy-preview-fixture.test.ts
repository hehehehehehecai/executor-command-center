import { describe, expect, it } from "vitest";

import { projectGalaxyPreviewFixture } from "./project-galaxy-preview-fixture";

describe("Project Galaxy fictional Preview fixture", () => {
  it("publishes an auditable fictional-only lineage contract", () => {
    expect(projectGalaxyPreviewFixture).toMatchObject({
      fixtureId: "project-galaxy-preview",
      fixtureVersion: "1.0.0",
      fixtureKind: "fictional-demo",
      provenance: "hand-authored-fictional",
      containsRealUserData: false,
      derivedFromRealUserData: false,
      networkSource: "none",
      disclosure: "演示数据 · 完全虚构",
    });
  });

  it("keeps the default case stable and fully populated", () => {
    expect(projectGalaxyPreviewFixture.cases.default).toMatchObject({
      project: {
        id: "demo-project-aurora-cartography",
        name: "Aurora Cartography",
        repositoryLabel: "demo/aurora-cartography",
      },
      officialStatus: "in_development",
      suggestedStatus: { value: "polishing" },
      coreGoal: "建立一套完全虚构、可审阅的项目导航系统。",
      currentStageGoal: "验证项目事实、建议和新鲜度的分层展示。",
      currentBlockers: ["等待虚构的跨设备可访问性复核。"],
    });
  });

  it("provides independent suggestion, blocker, stale and unknown cases", () => {
    const cases = projectGalaxyPreviewFixture.cases;

    expect(cases.withoutSuggestion.suggestedStatus).toBeNull();
    expect(cases.withoutBlockers.currentBlockers).toEqual([]);
    expect(cases.stale.freshness).toMatchObject({
      kind: "known",
      input: { lastSuccessfulAt: "2026-08-15T11:59:59.999Z" },
    });
    expect(cases.unknown.freshness).toEqual({
      kind: "unknown",
      provenanceLabel: "演示数据 · 完全虚构",
      description: "该虚构 case 没有可用的同步时间。",
    });
    expect(cases.withoutSuggestion).not.toBe(cases.default);
    expect(cases.withoutBlockers).not.toBe(cases.default);
    expect(cases.stale).not.toBe(cases.default);
    expect(cases.unknown).not.toBe(cases.default);
  });
});
