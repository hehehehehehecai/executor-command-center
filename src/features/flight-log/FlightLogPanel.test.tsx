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

describe("FlightLogPanel theme contract", () => {
  it.each([
    ["24h", "2026-08-16T12:00:00.000Z", "2026-08-16T11:59:59.999Z"],
    ["7d", "2026-08-10T12:00:00.000Z", "2026-08-10T11:59:59.999Z"],
    ["30d", "2026-07-18T12:00:00.000Z", "2026-07-18T11:59:59.999Z"],
  ] as const)("renders only selected events within the inclusive %s UTC window", (timeRange, start, outside) => {
    const base = events()[1];
    render(<FlightLogPanel viewModel={viewModel({
      selectedTypes: ["issue"],
      timeRange,
      source: { events: [
        { ...base, id: "outside", summary: "窗口之外", occurredAt: outside },
        { ...base, id: "lower", summary: "下界事件", occurredAt: start },
        { ...base, id: "upper", summary: "当前事件", occurredAt: now },
        { ...base, id: "future", summary: "未来事件", occurredAt: "2026-08-17T12:00:00.001Z" },
        { ...base, id: "unselected", eventType: "release", summary: "未选择类型", occurredAt: now },
      ] },
    })} />);
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(within(articles[0]).getByRole("heading", { level: 3 })).toHaveTextContent("当前事件");
    expect(within(articles[1]).getByRole("heading", { level: 3 })).toHaveTextContent("下界事件");
    expect(articles[0].querySelector("time")).toHaveAttribute("datetime", "2026-08-17T12:00:00.000Z");
    expect(articles[1].querySelector("time")).toHaveAttribute("datetime", start);
    expect(screen.getByLabelText("事件数量")).toHaveTextContent("2 / 5 条");
    expect(screen.queryByText("窗口之外")).not.toBeInTheDocument();
    expect(screen.queryByText("未来事件")).not.toBeInTheDocument();
    expect(screen.queryByText("未选择类型")).not.toBeInTheDocument();
  });

  it("keeps a deterministic visible order when event times tie", () => {
    const base = events()[0];
    render(<FlightLogPanel viewModel={viewModel({ source: { events: [
      { ...base, id: "sync", eventType: "sync_event", summary: "同步记录" },
      { ...base, id: "commit-b", summary: "提交乙" },
      { ...base, id: "issue", eventType: "issue", summary: "问题记录" },
      { ...base, id: "commit-a", summary: "提交甲" },
    ] } })} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "提交甲", "提交乙", "问题记录", "同步记录",
    ]);
  });

  it("submits selected filters and preserves connected provenance", () => {
    const connected = createFlightLogViewModel(source({ provenanceLabel: "Connected test double · 完全虚构 · Alpha" }), "connected", {
      eventTypes: ["issue", "commit"], timeRange: "7d", now,
    });
    render(<FlightLogPanel viewModel={connected} />);
    const form = screen.getByRole("search", { name: "筛选航行日志" }) as HTMLFormElement;
    (within(form).getByRole("checkbox", { name: "Commit" }) as HTMLInputElement).click();
    expect(Array.from(new FormData(form).entries())).toEqual([
      ["apply", "1"], ["mode", "connected"], ["type", "issue"], ["range", "7d"],
    ]);
    expect(screen.getByLabelText("数据来源")).toHaveTextContent("Connected Mode");
    expect(screen.getByLabelText("数据来源")).toHaveTextContent("Connected test double · 完全虚构 · Alpha");
    expect(screen.queryByText("Demo · 演示数据 · 完全虚构")).not.toBeInTheDocument();
  });

  it("explains missing successful sync alongside a source-empty timeline", () => {
    render(<FlightLogPanel viewModel={viewModel({ source: { lastSuccessfulAt: null, events: [] } })} />);
    const freshness = screen.getByRole("status", { name: "Flight Log 数据新鲜度" });
    expect(freshness).toHaveAttribute("data-freshness-status", "stale");
    expect(freshness).toHaveTextContent("Stale");
    expect(freshness).toHaveTextContent("尚无成功同步记录。");
    expect(freshness).toHaveTextContent("最近成功同步：无记录");
    expect(screen.getByLabelText("事件数量")).toHaveTextContent("0 / 0 条");
    expect(screen.getByText("尚无航行记录")).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("keeps unsafe source records visible without actionable links", () => {
    const base = events()[0];
    render(<FlightLogPanel viewModel={viewModel({ source: { events: [
      { ...base, id: "a", summary: "HTTP来源", originalUrl: "http://example.test/record" },
      { ...base, id: "b", summary: "凭据来源", originalUrl: "https://user:password@example.test/record" },
      { ...base, id: "c", summary: "非法来源", originalUrl: "not a url" },
      { ...base, id: "d", summary: "缺失来源", originalUrl: null },
      { ...base, id: "e", summary: "安全来源", originalUrl: "https://example.test/verified" },
    ] } })} />);
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(5);
    for (const title of ["HTTP来源", "凭据来源", "非法来源", "缺失来源"]) {
      const article = screen.getByRole("heading", { level: 3, name: title }).closest("article")!;
      expect(within(article).getByText("原始链接不可用")).toBeVisible();
      expect(within(article).queryByRole("link")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "查看原始记录" })).toHaveAttribute("href", "https://example.test/verified");
    expect(screen.getByLabelText("事件数量")).toHaveTextContent("5 / 5 条");
  });

  it("preserves the complete long summary and source label", () => {
    const summary = "航行日志超长内容验证-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-跨主题时间线记录完整性航行日志超长内容验证-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-跨主题时间线记录完整性航行日志超长内容验证-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-跨主题时间线记录完整性";
    const sourceLabel = "demo/长来源标签-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789demo/长来源标签-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789";
    render(<FlightLogPanel viewModel={viewModel({ source: { events: [{ ...events()[0], summary, sourceLabel }] } })} />);
    expect(screen.getByRole("heading", { level: 3, name: summary }).textContent).toBe(summary);
    expect(screen.getByText(sourceLabel, { exact: true }).textContent).toBe(sourceLabel);
    expect(screen.getByLabelText("事件数量")).toHaveTextContent("1 / 1 条");
  });

  it("rejects malformed source time before rendering a timeline", () => {
    expect(() => viewModel({ source: { events: [{ ...events()[0], occurredAt: "invalid-time" }] } })).toThrow("flight_log_invalid_time");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
