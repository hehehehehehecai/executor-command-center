import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MissionControlConnectedPort } from "@/features/mission-control";

const production = vi.hoisted(() => ({ create: vi.fn(), load: vi.fn() }));

vi.mock("@/app/connected-panel-dependencies", () => ({
  createMissionControlProductionConnectedPort: production.create,
}));

vi.mock("@/content/demo-data/mission-control-preview-fixture", () => ({
  loadMissionControlPreviewFixture: vi.fn(async () => ({
    provenanceLabel: "演示数据 · 完全虚构",
    recordedTasks: [],
    suggestions: [],
  })),
}));

import MissionControlPage from "./page";

production.create.mockImplementation(async () => ({ load: production.load }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/mission-control Preview / Connected composition", () => {
  it("defaults explicitly to Preview and discloses fictional data", async () => {
    render(await MissionControlPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Mission Control" })).toBeVisible();
    expect(screen.getByText("Preview Mode")).toBeVisible();
    expect(screen.getByText("演示数据 · 完全虚构")).toBeVisible();
  });

  it("uses only an injected Connected read port", async () => {
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => ({
        provenanceLabel: "Connected read stub",
        recordedTasks: [],
        suggestions: [],
      })),
    };

    render(
      await MissionControlPage({
        searchParams: Promise.resolve({ mode: "connected" }),
        connectedPort,
      }),
    );

    expect(screen.getByText("Connected Mode")).toBeVisible();
    expect(screen.getByText("Connected read stub")).toBeVisible();
    expect(connectedPort.load).toHaveBeenCalledOnce();
  });

  it("uses the production Connected adapter when no test port is injected", async () => {
    production.load.mockResolvedValueOnce({
      provenanceLabel: "Connected 数据 · 当前项目",
      recordedTasks: [],
      suggestions: [],
    });
    render(
      await MissionControlPage({
        searchParams: Promise.resolve({ mode: "connected", project: "22222222-2222-4222-8222-222222222222" }),
      }),
    );

    expect(production.create).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(production.load).toHaveBeenCalledOnce();
    expect(screen.getByText("Connected 数据 · 当前项目")).toBeVisible();
    expect(screen.getByText("暂无 GitHub 已记录任务")).toBeVisible();
  });

  it("applies an allowed local suggestion transition without changing recorded facts", async () => {
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => ({
        provenanceLabel: "Connected read stub",
        recordedTasks: [
          {
            id: "recorded-fact",
            taskType: "issue" as const,
            title: "Connected recorded fact",
            state: "open" as const,
            sourceLabel: "Read-only fact",
            originalUrl: null,
          },
        ],
        suggestions: [
          {
            id: "suggestion-connected",
            title: "Connected suggestion",
            rationale: "Deterministic rationale",
            evidence: [],
            unknowns: "No external state",
            ruleVersion: "connected.v1",
            status: "suggested" as const,
            provenanceLabel: "Connected suggestion source",
            draftTitle: "Connected draft",
            draftBody: "Connected draft body",
          },
        ],
      })),
    };

    render(
      await MissionControlPage({
        searchParams: Promise.resolve({
          mode: "connected",
          action: "transition",
          suggestionId: "suggestion-connected",
          nextStatus: "accepted",
        }),
        connectedPort,
      }),
    );

    expect(screen.getByText("Connected recorded fact")).toBeVisible();
    expect(screen.getByText("accepted", { selector: "[data-suggestion-status]" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "建议状态已在本地更新；GitHub 已记录事实保持不变。",
    );
  });

  it("fails Connected closed and does not disclose Preview data", async () => {
    const connectedPort: MissionControlConnectedPort = {
      load: vi.fn(async () => Promise.reject(new Error("connected_read_failed"))),
    };

    render(
      await MissionControlPage({
        searchParams: Promise.resolve({ mode: "connected" }),
        connectedPort,
      }),
    );

    expect(screen.getByText("Connected 数据暂时不可用。")).toBeVisible();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
  });

  it("rejects unknown modes rather than defaulting", async () => {
    render(
      await MissionControlPage({
        searchParams: Promise.resolve({ mode: "surprise" }),
      }),
    );

    expect(screen.getByText("面板模式无效。")).toBeVisible();
    expect(screen.queryByText("Preview Mode")).not.toBeInTheDocument();
  });
});
