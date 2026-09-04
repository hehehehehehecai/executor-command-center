import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PanelQuery } from "@/shared/panel-query";

import {
  createFlightLogConnectedQuery,
  createFlightLogPreviewQuery,
  resolveFlightLogQuery,
  type FlightLogConnectedPort,
} from "./flight-log-query";
import {
  flightLogEventTypes,
  type FlightLogFilterSelection,
  type FlightLogSource,
  type FlightLogViewModel,
} from "./flight-log-view-model";

const filters: FlightLogFilterSelection = {
  eventTypes: flightLogEventTypes,
  timeRange: "all",
  now: "2026-08-17T12:00:00.000Z",
};

function source(provenanceLabel: string): FlightLogSource {
  return {
    provenanceLabel,
    lastSuccessfulAt: "2026-08-17T11:00:00.000Z",
    events: [
      {
        id: "event-1",
        eventType: "commit",
        occurredAt: "2026-08-17T10:00:00.000Z",
        summary: "虚构提交",
        sourceLabel: "虚构仓库",
        originalUrl: "https://github.example.test/commit/event-1",
      },
    ],
  };
}

describe("Flight Log query contract", () => {
  it("returns the same FlightLogViewModel contract from both modes", async () => {
    const previewQuery: PanelQuery<FlightLogViewModel> =
      createFlightLogPreviewQuery(
        async () => source("演示数据 · 完全虚构"),
        filters,
      );
    const connectedQuery: PanelQuery<FlightLogViewModel> =
      createFlightLogConnectedQuery(
        { load: async () => source("Connected stub") },
        filters,
      );

    expectTypeOf(previewQuery).toEqualTypeOf<PanelQuery<FlightLogViewModel>>();
    expectTypeOf(connectedQuery).toEqualTypeOf<
      PanelQuery<FlightLogViewModel>
    >();

    const preview = await previewQuery.load();
    const connected = await connectedQuery.load();

    expect(Object.keys(preview)).toEqual(Object.keys(connected));
    expect(Object.keys(preview.events[0] ?? {})).toEqual(
      Object.keys(connected.events[0] ?? {}),
    );
    expect(preview.mode).toBe("preview");
    expect(connected.mode).toBe("connected");
  });

  it("loads Preview without calling the Connected port", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: FlightLogConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    const result = await resolveFlightLogQuery("preview", {
      previewLoader,
      connectedPort,
      filters,
    }).load();

    expect(result).toMatchObject({
      mode: "preview",
      provenanceLabel: "Preview loader",
    });
    expect(previewLoader).toHaveBeenCalledTimes(1);
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads Connected only through the injected port", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: FlightLogConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    const result = await resolveFlightLogQuery("connected", {
      previewLoader,
      connectedPort,
      filters,
    }).load();

    expect(result).toMatchObject({
      mode: "connected",
      provenanceLabel: "Connected port",
    });
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("fails Connected closed without loading Preview", async () => {
    const failure = new Error("flight_log_connected_unavailable");
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: FlightLogConnectedPort = {
      load: vi.fn(async () => {
        throw failure;
      }),
    };

    const query = resolveFlightLogQuery("connected", {
      previewLoader,
      connectedPort,
      filters,
    });

    await expect(query.load()).rejects.toBe(failure);
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
