import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PanelQuery } from "@/shared/panel-query";

import {
  createProjectGalaxyConnectedQuery,
  createProjectGalaxyPreviewQuery,
  resolveProjectGalaxyQuery,
  type ProjectGalaxyConnectedPort,
} from "./project-galaxy-query";
import type {
  ProjectGalaxySource,
  ProjectGalaxyViewModel,
} from "./project-galaxy-view-model";

const freshness = {
  kind: "known",
  input: {
    provenance: "demo",
    authorizationRevoked: false,
    latestRun: null,
    lastSuccessfulAt: "2026-08-17T08:00:00.000Z",
    coverageComplete: true,
    now: "2026-08-17T12:00:00.000Z",
  },
} as const;

function source(
  overrides: Partial<ProjectGalaxySource> = {},
): ProjectGalaxySource {
  return {
    project: {
      id: "project-aurora",
      name: "Aurora Cartography",
      repositoryLabel: "demo/aurora-cartography",
    },
    officialStatus: "in_development",
    suggestedStatus: {
      value: "polishing",
      rationale: "Recent fictional activity suggests a polishing pass.",
      generatedAt: "2026-08-17T09:00:00.000Z",
    },
    activity: [
      {
        id: "activity-older",
        summary: "Older fictional activity",
        occurredAt: "2026-08-16T09:00:00.000Z",
      },
      {
        id: "activity-newer",
        summary: "Newer fictional activity",
        occurredAt: "2026-08-17T09:00:00.000Z",
      },
    ],
    freshness,
    coreGoal: "Map the fictional delivery system.",
    currentStageGoal: "Validate the fictional navigation model.",
    currentBlockers: ["Awaiting a fictional review window."],
    provenanceLabel: "演示数据 · 完全虚构",
    ...overrides,
  };
}

describe("Project Galaxy query contract", () => {
  it("maps both sources to one frozen ProjectGalaxyViewModel shape", async () => {
    const previewQuery: PanelQuery<ProjectGalaxyViewModel> =
      createProjectGalaxyPreviewQuery(async () => source());
    const connectedQuery: PanelQuery<ProjectGalaxyViewModel> =
      createProjectGalaxyConnectedQuery({ load: async () => source() });

    expectTypeOf(previewQuery).toEqualTypeOf<
      PanelQuery<ProjectGalaxyViewModel>
    >();
    expectTypeOf(connectedQuery).toEqualTypeOf<
      PanelQuery<ProjectGalaxyViewModel>
    >();

    const preview = await previewQuery.load();
    const connected = await connectedQuery.load();

    expect(Object.keys(preview)).toEqual(Object.keys(connected));
    expect(preview).toMatchObject({
      mode: "preview",
      project: {
        id: "project-aurora",
        name: "Aurora Cartography",
        repositoryLabel: "demo/aurora-cartography",
      },
      officialStatus: "in_development",
      suggestedStatus: { value: "polishing" },
      coreGoal: "Map the fictional delivery system.",
      currentStageGoal: "Validate the fictional navigation model.",
      currentBlockers: ["Awaiting a fictional review window."],
    });
    expect(connected.mode).toBe("connected");
  });

  it("loads Preview without calling the Connected port", async () => {
    const previewLoader = vi.fn(async () => source());
    const connectedPort: ProjectGalaxyConnectedPort = {
      load: vi.fn(async () => source()),
    };

    const result = await resolveProjectGalaxyQuery("preview", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result.mode).toBe("preview");
    expect(previewLoader).toHaveBeenCalledTimes(1);
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads Connected only through the injected port", async () => {
    const previewLoader = vi.fn(async () => source());
    const connectedPort: ProjectGalaxyConnectedPort = {
      load: vi.fn(async () =>
        source({ provenanceLabel: "Injected connected-port facts" }),
      ),
    };

    const result = await resolveProjectGalaxyQuery("connected", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result).toMatchObject({
      mode: "connected",
      provenanceLabel: "Injected connected-port facts",
    });
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("sorts recent activity deterministically without mutating the source", async () => {
    const activity = Object.freeze([
      Object.freeze({
        id: "same-time-z",
        summary: "Z activity",
        occurredAt: "2026-08-17T09:00:00.000Z",
      }),
      Object.freeze({
        id: "older",
        summary: "Older activity",
        occurredAt: "2026-08-16T09:00:00.000Z",
      }),
      Object.freeze({
        id: "same-time-a",
        summary: "A activity",
        occurredAt: "2026-08-17T09:00:00.000Z",
      }),
    ]);
    const frozenSource = Object.freeze(source({ activity }));

    const result = await createProjectGalaxyPreviewQuery(
      async () => frozenSource,
    ).load();

    expect(result.recentActivity.map(({ id }) => id)).toEqual([
      "same-time-a",
      "same-time-z",
      "older",
    ]);
    expect(frozenSource.activity.map(({ id }) => id)).toEqual([
      "same-time-z",
      "older",
      "same-time-a",
    ]);
  });

  it("refreshes Suggested Status without changing Official Status", async () => {
    const officialStatus = "in_development" as const;
    const sources = [
      source({
        officialStatus,
        suggestedStatus: {
          value: "polishing",
          rationale: "First suggestion",
          generatedAt: "2026-08-17T09:00:00.000Z",
        },
      }),
      source({ officialStatus, suggestedStatus: null }),
    ];
    let readIndex = 0;
    const query = createProjectGalaxyConnectedQuery({
      load: async () => sources[readIndex++],
    });

    const before = await query.load();
    const after = await query.load();

    expect(before.officialStatus).toBe("in_development");
    expect(before.suggestedStatus?.value).toBe("polishing");
    expect(after.officialStatus).toBe("in_development");
    expect(after.suggestedStatus).toBeNull();
    expect(sources.map((item) => item.officialStatus)).toEqual([
      "in_development",
      "in_development",
    ]);
  });

  it("fails closed when Connected rejects and never loads Preview", async () => {
    const failure = new Error("project_galaxy_connected_unavailable");
    const previewLoader = vi.fn(async () => source());
    const connectedPort: ProjectGalaxyConnectedPort = {
      load: vi.fn(async () => {
        throw failure;
      }),
    };
    const query = resolveProjectGalaxyQuery("connected", {
      previewLoader,
      connectedPort,
    });

    await expect(query.load()).rejects.toBe(failure);
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
