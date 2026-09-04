import { describe, expect, it } from "vitest";

import { flightLogEventTypes } from "@/features/flight-log";

import {
  flightLogPreviewFixture,
  loadFlightLogPreviewFixture,
} from "./flight-log-preview-fixture";

describe("Flight Log Preview fixture", () => {
  it("is an auditable, network-free fictional fixture", () => {
    expect(flightLogPreviewFixture).toMatchObject({
      fixtureId: "flight-log-preview",
      fixtureVersion: "1.0.0",
      fixtureKind: "fictional-demo",
      provenance: "hand-authored-fictional",
      containsRealUserData: false,
      derivedFromRealUserData: false,
      networkSource: "none",
      disclosure: "演示数据 · 完全虚构",
      now: "2026-08-17T12:00:00.000Z",
    });
  });

  it("gives every frozen event type an independent default example", async () => {
    const result = await loadFlightLogPreviewFixture("default");

    expect(result.events.map(({ eventType }) => eventType)).toEqual(
      flightLogEventTypes,
    );
    expect(new Set(result.events.map(({ id }) => id)).size).toBe(6);
  });

  it("provides empty, same-time, stale, boundary and invalid-link cases", async () => {
    const empty = await loadFlightLogPreviewFixture("empty");
    const sameTimestamp = await loadFlightLogPreviewFixture("sameTimestamp");
    const stale = await loadFlightLogPreviewFixture("stale");
    const boundary = await loadFlightLogPreviewFixture("boundary");
    const invalidLink = await loadFlightLogPreviewFixture("invalidLink");

    expect(empty.events).toEqual([]);
    expect(new Set(sameTimestamp.events.map(({ occurredAt }) => occurredAt))).toEqual(
      new Set(["2026-08-17T09:00:00.000Z"]),
    );
    expect(stale.lastSuccessfulAt).toBe("2026-08-16T11:59:59.999Z");
    expect(boundary.events.map(({ id }) => id)).toEqual([
      "boundary-at-start",
      "boundary-at-now",
      "boundary-outside",
    ]);
    expect(invalidLink.events.map(({ originalUrl }) => originalUrl)).toEqual([
      "http://github.example.test/unsafe",
      "not a url",
      null,
    ]);
  });
});
