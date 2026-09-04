import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FlightLogPanel } from "./FlightLogPanel";
import {
  createFlightLogViewModel,
  flightLogEventTypes,
  type FlightLogEvent,
  type FlightLogSource,
} from "./flight-log-view-model";

const now = "2026-08-17T12:00:00.000Z";

const eventLabels = {
  commit: "Commit",
  issue: "Issue",
  pull_request: "Pull Request",
  release: "Release",
  workflow: "Workflow",
  sync_event: "Sync Event",
} as const;

function events(): FlightLogEvent[] {
  return flightLogEventTypes.map((eventType, index) => ({
    id: `event-${eventType}`,
    eventType,
    occurredAt: `2026-08-17T0${9 - index}:00:00.000Z`,
    summary: `${eventLabels[eventType]} 虚构活动`,
    sourceLabel: `demo/${eventType}`,
    originalUrl:
      eventType === "sync_event"
        ? null
        : `https://github.example.test/demo/${eventType}`,
  }));
}

function source(overrides: Partial<FlightLogSource> = {}): FlightLogSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    lastSuccessfulAt: "2026-08-17T11:00:00.000Z",
    events: events(),
    ...overrides,
  };
}

function viewModel(overrides: {
  readonly source?: Partial<FlightLogSource>;
  readonly selectedTypes?: readonly (typeof flightLogEventTypes)[number][];
  readonly timeRange?: "all" | "24h" | "7d" | "30d";
} = {}) {
  return createFlightLogViewModel(
    source(overrides.source),
    "preview",
    {
      eventTypes: overrides.selectedTypes ?? flightLogEventTypes,
      timeRange: overrides.timeRange ?? "all",
      now,
    },
  );
}

afterEach(cleanup);

describe("FlightLogPanel", () => {
  it("renders all six event types in one semantic timeline", () => {
    render(<FlightLogPanel viewModel={viewModel()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Flight Log" }),
    ).toBeVisible();
    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "Demo · 演示数据 · 完全虚构",
    );
    const timeline = screen.getByRole("region", { name: "Flight Log 时间线" });
    expect(within(timeline).getAllByRole("article")).toHaveLength(6);

    for (const eventType of flightLogEventTypes) {
      expect(within(timeline).getByText(eventLabels[eventType])).toBeVisible();
      expect(
        within(timeline).getByText(`${eventLabels[eventType]} 虚构活动`),
      ).toBeVisible();
    }
  });

  it("renders only validated links and an explicit unavailable state", () => {
    render(<FlightLogPanel viewModel={viewModel()} />);

    expect(screen.getAllByRole("link", { name: "查看原始记录" })).toHaveLength(
      5,
    );
    expect(screen.getByText("原始链接不可用")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "查看原始记录" })[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:/),
    );
  });

  it("distinguishes source empty from filtered empty", () => {
    const { rerender } = render(
      <FlightLogPanel viewModel={viewModel({ source: { events: [] } })} />,
    );

    expect(screen.getByText("尚无航行记录")).toBeVisible();

    rerender(
      <FlightLogPanel
        viewModel={viewModel({ selectedTypes: [], source: { events: events() } })}
      />,
    );

    expect(screen.getByText("当前筛选没有匹配事件")).toBeVisible();
    expect(screen.queryByText("尚无航行记录")).not.toBeInTheDocument();
  });

  it("shows Fresh and Stale as text-backed semantic states", () => {
    const { rerender } = render(<FlightLogPanel viewModel={viewModel()} />);

    const freshness = screen.getByRole("status", { name: "Flight Log 数据新鲜度" });
    expect(freshness).toHaveAttribute("data-freshness-status", "fresh");
    expect(freshness).toHaveTextContent("Fresh");

    rerender(
      <FlightLogPanel
        viewModel={viewModel({
          source: { lastSuccessfulAt: "2026-08-16T11:59:59.999Z" },
        })}
      />,
    );

    expect(screen.getByRole("status", { name: "Flight Log 数据新鲜度" })).toHaveAttribute(
      "data-freshness-status",
      "stale",
    );
    expect(screen.getByText("Stale")).toBeVisible();
  });

  it("provides a keyboard-native GET filter form with current state", () => {
    const { container } = render(
      <FlightLogPanel
        viewModel={viewModel({
          selectedTypes: ["commit", "issue"],
          timeRange: "7d",
        })}
      />,
    );

    const form = screen.getByRole("search", { name: "筛选航行日志" });
    const eventTypeGroup = within(form).getByRole("group", { name: "事件类型" });

    expect(within(eventTypeGroup).getByRole("checkbox", { name: "Commit" })).toBeChecked();
    expect(within(eventTypeGroup).getByRole("checkbox", { name: "Issue" })).toBeChecked();
    expect(
      within(eventTypeGroup).getByRole("checkbox", { name: "Release" }),
    ).not.toBeChecked();
    expect(within(form).getByRole("combobox", { name: "时间范围" })).toHaveValue(
      "7d",
    );
    expect(within(form).getByRole("button", { name: "应用筛选" })).toBeVisible();
    expect(form).toHaveAttribute("method", "get");
    expect(container.querySelector('input[name="apply"]')).toHaveValue("1");
    expect(container.querySelector('input[name="mode"]')).toHaveValue("preview");
  });

  it("uses machine-readable UTC times and preserves source labels", () => {
    render(<FlightLogPanel viewModel={viewModel()} />);

    expect(
      screen.getByText("2026-08-17 09:00 UTC").closest("time"),
    ).toHaveAttribute("datetime", "2026-08-17T09:00:00.000Z");
    expect(screen.getByText("demo/commit")).toBeVisible();
  });
});
