import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PanelQuery } from "@/shared/panel-query";

import {
  createMissionControlConnectedQuery,
  createMissionControlPreviewQuery,
  resolveMissionControlQuery,
  type MissionControlConnectedPort,
} from "./mission-control-query";
import type {
  MissionControlSource,
  MissionControlViewModel,
} from "./mission-control-view-model";

function source(provenanceLabel: string): MissionControlSource {
  return {
    provenanceLabel,
    recordedTasks: [],
    suggestions: [],
  };
}

describe("Mission Control query contract", () => {
  it("returns the same MissionControlViewModel contract from both modes", async () => {
    const previewQuery: PanelQuery<MissionControlViewModel> =
      createMissionControlPreviewQuery(async () => source("Preview loader"));
    const connectedQuery: PanelQuery<MissionControlViewModel> =
      createMissionControlConnectedQuery({
        load: async () => source("Connected stub"),
      });

    expectTypeOf(previewQuery).toEqualTypeOf<PanelQuery<MissionControlViewModel>>();
    expectTypeOf(connectedQuery).toEqualTypeOf<PanelQuery<MissionControlViewModel>>();

    const preview = await previewQuery.load();
    const connected = await connectedQuery.load();

    expect(Object.keys(preview)).toEqual(Object.keys(connected));
    expect(preview.mode).toBe("preview");
    expect(connected.mode).toBe("connected");
  });

  it("loads Preview without calling the Connected read port", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => source("Connected read port")),
    };

    const result = await resolveMissionControlQuery("preview", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result).toMatchObject({ mode: "preview", provenanceLabel: "Preview loader" });
    expect(previewLoader).toHaveBeenCalledOnce();
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads Connected without reading the Demo loader", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => source("Connected read port")),
    };

    const result = await resolveMissionControlQuery("connected", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result).toMatchObject({ mode: "connected", provenanceLabel: "Connected read port" });
    expect(connectedPort.load).toHaveBeenCalledOnce();
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("keeps Connected failure observable without Preview fallback", async () => {
    const failure = new Error("connected_read_failed");
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => Promise.reject(failure)),
    };

    await expect(
      resolveMissionControlQuery("connected", { previewLoader, connectedPort }).load(),
    ).rejects.toBe(failure);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
