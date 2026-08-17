import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MissionControlConnectedPort } from "@/features/mission-control";

vi.mock("@/content/demo-data/mission-control-preview-fixture", () => ({
  loadMissionControlPreviewFixture: vi.fn(async () => ({
    provenanceLabel: "演示数据 · 完全虚构",
    recordedTasks: [],
    suggestions: [],
  })),
}));

import MissionControlPage from "./page";

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
