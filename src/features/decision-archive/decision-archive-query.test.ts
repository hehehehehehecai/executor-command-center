import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PanelQuery } from "@/shared/panel-query";

import {
  createDecisionArchiveConnectedQuery,
  createDecisionArchivePreviewQuery,
  resolveDecisionArchiveQuery,
  type DecisionArchiveConnectedPort,
} from "./decision-archive-query";
import type {
  DecisionArchiveSource,
  DecisionArchiveViewModel,
} from "./decision-archive-view-model";

function source(provenanceLabel: string): DecisionArchiveSource {
  return { provenanceLabel, candidates: [], records: [] };
}

describe("Decision Archive query contract", () => {
  it("returns the same DecisionArchiveViewModel contract from both modes", async () => {
    const previewQuery: PanelQuery<DecisionArchiveViewModel> =
      createDecisionArchivePreviewQuery(async () => source("Preview loader"));
    const connectedQuery: PanelQuery<DecisionArchiveViewModel> =
      createDecisionArchiveConnectedQuery({
        load: async () => source("Connected stub"),
      });

    expectTypeOf(previewQuery).toEqualTypeOf<PanelQuery<DecisionArchiveViewModel>>();
    expectTypeOf(connectedQuery).toEqualTypeOf<PanelQuery<DecisionArchiveViewModel>>();

    const preview = await previewQuery.load();
    const connected = await connectedQuery.load();
    expect(Object.keys(preview)).toEqual(Object.keys(connected));
    expect(preview.mode).toBe("preview");
    expect(connected.mode).toBe("connected");
  });

  it("loads Preview without calling the Connected port", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: DecisionArchiveConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    const result = await resolveDecisionArchiveQuery("preview", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result).toMatchObject({ mode: "preview", provenanceLabel: "Preview loader" });
    expect(previewLoader).toHaveBeenCalledOnce();
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads Connected without reading the Preview loader", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: DecisionArchiveConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    const result = await resolveDecisionArchiveQuery("connected", {
      previewLoader,
      connectedPort,
    }).load();

    expect(result).toMatchObject({ mode: "connected", provenanceLabel: "Connected port" });
    expect(connectedPort.load).toHaveBeenCalledOnce();
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("keeps Connected failure observable without Preview fallback", async () => {
    const failure = new Error("connected_read_failed");
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: DecisionArchiveConnectedPort = {
      load: vi.fn(async () => Promise.reject(failure)),
    };

    await expect(
      resolveDecisionArchiveQuery("connected", { previewLoader, connectedPort }).load(),
    ).rejects.toBe(failure);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
