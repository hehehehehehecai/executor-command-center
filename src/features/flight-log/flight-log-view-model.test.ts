import { describe, expect, expectTypeOf, it } from "vitest";

import type { PanelMode } from "@/shared/panel-query";

import {
  createFlightLogViewModel,
  flightLogEventTypes,
  type FlightLogEvent,
  type FlightLogEventType,
  type FlightLogFilterSelection,
  type FlightLogSource,
  type FlightLogViewModel,
} from "./flight-log-view-model";

const now = "2026-08-17T12:00:00.000Z";

function event(
  id: string,
  eventType: FlightLogEventType,
  occurredAt = "2026-08-17T10:00:00.000Z",
  originalUrl: string | null = `https://github.example.test/events/${id}`,
): FlightLogEvent {
  return {
    id,
    eventType,
    occurredAt,
    summary: `${eventType} ${id}`,
    sourceLabel: "虚构来源",
    originalUrl,
  };
}

function source(events: readonly FlightLogEvent[]): FlightLogSource {
  return {
    events,
    lastSuccessfulAt: "2026-08-17T11:00:00.000Z",
    provenanceLabel: "演示数据 · 完全虚构",
  };
}

function filters(
  overrides: Partial<FlightLogFilterSelection> = {},
): FlightLogFilterSelection {
  return {
    eventTypes: flightLogEventTypes,
    timeRange: "all",
    now,
    ...overrides,
  };
}

function viewModel(
  events: readonly FlightLogEvent[],
  filterSelection = filters(),
  mode: PanelMode = "preview",
) {
  return createFlightLogViewModel(source(events), mode, filterSelection);
}

describe("Flight Log View Model", () => {
  it("uses one exact six-type event contract", () => {
    expect(flightLogEventTypes).toEqual([
      "commit",
      "issue",
      "pull_request",
      "release",
      "workflow",
      "sync_event",
    ]);

    const result = viewModel(
      flightLogEventTypes.map((eventType) => event(eventType, eventType)),
    );

    expectTypeOf(result).toEqualTypeOf<FlightLogViewModel>();
    expect(result.events.map(({ eventType }) => eventType)).toEqual([
      "commit",
      "issue",
      "pull_request",
      "release",
      "workflow",
      "sync_event",
    ]);
  });

  it("sorts by time descending, fixed type order, then stable ID", () => {
    const input = Object.freeze([
      Object.freeze(event("z-commit", "commit")),
      Object.freeze(event("sync", "sync_event")),
      Object.freeze(event("issue", "issue")),
      Object.freeze(event("a-commit", "commit")),
      Object.freeze(
        event("newer", "release", "2026-08-17T11:00:00.000Z"),
      ),
    ]);

    const result = viewModel(input);

    expect(result.events.map(({ id }) => id)).toEqual([
      "newer",
      "a-commit",
      "z-commit",
      "issue",
      "sync",
    ]);
    expect(input.map(({ id }) => id)).toEqual([
      "z-commit",
      "sync",
      "issue",
      "a-commit",
      "newer",
    ]);
  });

  it("applies an exact, de-duplicated type set in canonical order", () => {
    const result = viewModel(
      [
        event("commit", "commit"),
        event("issue", "issue"),
        event("workflow", "workflow"),
      ],
      filters({ eventTypes: ["workflow", "commit", "workflow"] }),
    );

    expect(result.filters.eventTypes).toEqual(["commit", "workflow"]);
    expect(result.events.map(({ id }) => id)).toEqual(["commit", "workflow"]);
  });

  it("includes both UTC boundaries and excludes older and future events", () => {
    const result = viewModel(
      [
        event("at-now", "commit", now),
        event("at-start", "issue", "2026-08-16T12:00:00.000Z"),
        event("too-old", "release", "2026-08-16T11:59:59.999Z"),
        event("future", "workflow", "2026-08-17T12:00:00.001Z"),
      ],
      filters({ timeRange: "24h" }),
    );

    expect(result.events.map(({ id }) => id)).toEqual(["at-now", "at-start"]);
  });

  it("combines type and UTC time filtering without changing the source count", () => {
    const result = viewModel(
      [
        event("recent-issue", "issue", "2026-08-17T10:00:00.000Z"),
        event("recent-commit", "commit", "2026-08-17T10:00:00.000Z"),
        event("old-issue", "issue", "2026-08-09T12:00:00.000Z"),
      ],
      filters({ eventTypes: ["issue"], timeRange: "7d" }),
    );

    expect(result.sourceEventCount).toBe(3);
    expect(result.events.map(({ id }) => id)).toEqual(["recent-issue"]);
  });

  it.each([
    ["valid", "https://github.com/example/repository/issues/1", true],
    ["http", "http://github.com/example/repository/issues/1", false],
    ["javascript", "javascript:alert(1)", false],
    ["credentialed", "https://user:secret@example.test/private", false],
    ["invalid", "not a url", false],
    ["missing", null, false],
  ])("sanitizes the %s original link", (_case, originalUrl, isSafe) => {
    const [result] = viewModel([
      event("link", "issue", "2026-08-17T10:00:00.000Z", originalUrl),
    ]).events;

    expect(result?.originalUrl).toBe(isSafe ? originalUrl : null);
  });

  it.each([
    ["exact boundary", "2026-08-16T12:00:00.000Z", "fresh"],
    ["outside boundary", "2026-08-16T11:59:59.999Z", "stale"],
    ["missing sync", null, "stale"],
  ])("derives %s Freshness deterministically", (_case, lastSuccessfulAt, status) => {
    const result = createFlightLogViewModel(
      { ...source([]), lastSuccessfulAt },
      "preview",
      filters(),
    );

    expect(result.freshness.status).toBe(status);
    expect(result.freshness.lastSuccessfulAt).toBe(lastSuccessfulAt);
  });

  it("distinguishes an empty source from an empty filtered result", () => {
    const emptySource = viewModel([]);
    const emptyFilter = viewModel(
      [event("commit", "commit")],
      filters({ eventTypes: [] }),
    );

    expect(emptySource).toMatchObject({ sourceEventCount: 0, events: [] });
    expect(emptyFilter).toMatchObject({ sourceEventCount: 1, events: [] });
  });
});
