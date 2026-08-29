import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FlightLogConnectedPort,
  FlightLogEvent,
  FlightLogSource,
} from "@/features/flight-log";

const mocks = vi.hoisted(() => ({
  previewLoad: vi.fn(),
  productionCreate: vi.fn(),
  productionLoad: vi.fn(),
}));

vi.mock("@/app/connected-panel-dependencies", () => ({
  createFlightLogProductionConnectedPort: mocks.productionCreate,
}));

vi.mock("@/content/demo-data/flight-log-preview-fixture", () => ({
  flightLogPreviewFixture: { now: "2026-08-17T12:00:00.000Z" },
  loadFlightLogPreviewFixture: mocks.previewLoad,
}));

import FlightLogPage from "./page";

const now = "2026-08-17T12:00:00.000Z";

function event(
  id: string,
  eventType: FlightLogEvent["eventType"],
  occurredAt: string,
): FlightLogEvent {
  return {
    id,
    eventType,
    occurredAt,
    summary: `${eventType} ${id}`,
    sourceLabel: "fixture source",
    originalUrl: `https://github.example.test/${id}`,
  };
}

function source(provenanceLabel = "演示数据 · 完全虚构"): FlightLogSource {
  return {
    provenanceLabel,
    lastSuccessfulAt: "2026-08-17T11:00:00.000Z",
    events: [
      event("recent-commit", "commit", "2026-08-17T11:00:00.000Z"),
      event("recent-issue", "issue", "2026-08-17T10:00:00.000Z"),
      event("old-issue", "issue", "2026-08-16T11:59:59.999Z"),
      event("pr", "pull_request", "2026-08-17T09:00:00.000Z"),
      event("release", "release", "2026-08-17T08:00:00.000Z"),
      event("workflow", "workflow", "2026-08-17T07:00:00.000Z"),
      event("sync", "sync_event", "2026-08-17T06:00:00.000Z"),
    ],
  };
}

function parameters(
  values: {
    readonly apply?: string | string[];
    readonly mode?: string | string[];
    readonly project?: string | string[];
    readonly range?: string | string[];
    readonly type?: string | string[];
  } = {},
) {
  return Promise.resolve(values);
}

beforeEach(() => {
  mocks.previewLoad.mockResolvedValue(source());
  mocks.productionLoad.mockRejectedValue(new Error("connected_panel_read_failed"));
  mocks.productionCreate.mockResolvedValue({ load: mocks.productionLoad });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/flight-log Preview / Connected composition", () => {
  it("loads the fictional Preview by default", async () => {
    render(
      await FlightLogPage({ searchParams: parameters(), now: () => now }),
    );

    expect(screen.getByText("Preview Mode")).toBeVisible();
    expect(screen.getAllByText("演示数据 · 完全虚构").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(mocks.previewLoad).toHaveBeenCalledTimes(1);
  });

  it("applies exact type and inclusive time filters from search params", async () => {
    render(
      await FlightLogPage({
        searchParams: parameters({
          apply: "1",
          mode: "preview",
          range: "24h",
          type: "issue",
        }),
        now: () => now,
      }),
    );

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("issue recent-issue")).toBeVisible();
    expect(screen.queryByText("issue old-issue")).not.toBeInTheDocument();
    expect(screen.queryByText("commit recent-commit")).not.toBeInTheDocument();
  });

  it("uses an injected Connected port without reading Preview", async () => {
    const connectedPort: FlightLogConnectedPort = {
      load: vi.fn(async () => source("Connected stub")),
    };

    render(
      await FlightLogPage({
        searchParams: parameters({ mode: "connected" }),
        connectedPort,
        now: () => now,
      }),
    );

    expect(screen.getByText("Connected Mode")).toBeVisible();
    expect(screen.getByText("Connected stub")).toBeVisible();
    expect(connectedPort.load).toHaveBeenCalledTimes(1);
    expect(mocks.previewLoad).not.toHaveBeenCalled();
  });

  it("uses the production adapter and preserves a real empty state", async () => {
    mocks.productionLoad.mockResolvedValueOnce({
      provenanceLabel: "Connected 数据 · 当前项目",
      lastSuccessfulAt: null,
      events: [],
    });
    render(
      await FlightLogPage({
        searchParams: parameters({ mode: "connected", project: "22222222-2222-4222-8222-222222222222" }),
        now: () => now,
      }),
    );

    expect(mocks.productionCreate).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(mocks.productionLoad).toHaveBeenCalledOnce();
    expect(screen.getByText("尚无航行记录")).toBeVisible();
    expect(screen.queryByText("Connected 数据暂时不可用。")).not.toBeInTheDocument();
  });

  it("fails an unavailable Connected mode closed without Demo fallback", async () => {
    render(
      await FlightLogPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );

    expect(screen.getByText("Connected 数据暂时不可用。")).toBeVisible();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
    expect(mocks.previewLoad).not.toHaveBeenCalled();
  });

  it("rejects invalid mode or filters before reading either source", async () => {
    const { rerender } = render(
      await FlightLogPage({
        searchParams: parameters({ mode: "demo" }),
        now: () => now,
      }),
    );

    expect(screen.getByText("面板模式无效。")).toBeVisible();
    expect(mocks.previewLoad).not.toHaveBeenCalled();

    rerender(
      await FlightLogPage({
        searchParams: parameters({
          apply: "1",
          mode: "preview",
          range: "yesterday",
          type: "unsupported",
        }),
        now: () => now,
      }),
    );

    expect(screen.getByText("筛选条件无效。")).toBeVisible();
    expect(mocks.previewLoad).not.toHaveBeenCalled();
  });
});
