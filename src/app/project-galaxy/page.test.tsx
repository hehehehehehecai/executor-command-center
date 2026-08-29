import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProductionPort: vi.fn(),
  productionLoad: vi.fn(),
}));

vi.mock("@/app/connected-panel-dependencies", () => ({
  createProjectGalaxyProductionConnectedPort: mocks.createProductionPort,
}));

import ProjectGalaxyPage from "./page";

const projectId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-17T13:00:00.000Z";

function connectedSource(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      id: projectId,
      name: "executor-stage6-staging-fixture",
      repositoryLabel: "hecaitest1/executor-stage6-staging-fixture",
    },
    officialStatus: "polishing" as const,
    suggestedStatus: null,
    activity: [{ id: "github_issue:1", summary: "Fixture issue", occurredAt: now }],
    freshness: {
      kind: "known" as const,
      input: {
        provenance: "real" as const,
        authorizationRevoked: false,
        latestRun: {
          id: "44444444-4444-4444-8444-444444444444",
          status: "completed" as const,
          finishedAt: "2026-08-17T12:00:00.000Z",
          errorCode: null,
        },
        lastSuccessfulAt: "2026-08-17T12:00:00.000Z",
        coverageComplete: true,
        now,
        ...overrides,
      },
    },
    coreGoal: "Ship the safe beta",
    currentStageGoal: "Verify connected panels",
    currentBlockers: [],
    provenanceLabel: "Connected 数据 · 当前项目",
  };
}

function parameters(
  values: { readonly mode?: string; readonly project?: string | string[] } = {},
) {
  return Promise.resolve(values);
}

describe("/project-galaxy Preview / Connected composition", () => {
  beforeEach(() => {
    mocks.productionLoad.mockResolvedValue(connectedSource());
    mocks.createProductionPort.mockResolvedValue({ load: mocks.productionLoad });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads the fictional Preview by default without touching Connected", async () => {
    render(
      await ProjectGalaxyPage({
        searchParams: parameters(),
        now: () => now,
      }),
    );

    expect(screen.getAllByText("演示数据 · 完全虚构")).toHaveLength(2);
    expect(screen.getByText("Aurora Cartography")).toBeVisible();
    expect(screen.getByText("Preview Mode")).toBeVisible();
    expect(mocks.createProductionPort).not.toHaveBeenCalled();
    expect(mocks.productionLoad).not.toHaveBeenCalled();
  });

  it("uses the same panel for explicit Connected Freshness without Demo fallback", async () => {
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );

    expect(screen.getByText("Connected Mode")).toBeVisible();
    expect(screen.getAllByText("Connected 数据 · 当前项目").length).toBeGreaterThan(0);
    expect(screen.getByText("executor-stage6-staging-fixture")).toBeVisible();
    expect(screen.getByText("hecaitest1/executor-stage6-staging-fixture")).toBeVisible();
    expect(screen.getByText("Ship the safe beta")).toBeVisible();
    expect(screen.getByText("Verify connected panels")).toBeVisible();
    expect(screen.getByText("Fixture issue")).toBeVisible();
    expect(screen.getByText("Fresh")).toBeVisible();
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(main).toContainElement(
      screen.getByRole("button", { name: "启动首次同步" }),
    );
    expect(main).toContainElement(
      screen.getByRole("button", { name: "移除仓库数据" }),
    );
  });

  it.each([
    ["fresh", {}, "Fresh"],
    [
      "stale",
      { lastSuccessfulAt: "2026-08-16T12:59:59.999Z" },
      "Stale",
    ],
    [
      "syncing",
      {
        latestRun: {
          id: "55555555-5555-4555-8555-555555555555",
          status: "running",
          finishedAt: null,
          errorCode: null,
        },
      },
      "Syncing",
    ],
    [
      "failed",
      {
        latestRun: {
          id: "66666666-6666-4666-8666-666666666666",
          status: "failed",
          finishedAt: "2026-08-17T12:30:00.000Z",
          errorCode: "github_activity_timeout",
        },
      },
      "Failed",
    ],
    ["authorization revoked", { authorizationRevoked: true }, "Authorization revoked"],
  ])("preserves the existing %s Connected presentation", async (_case, overrides, label) => {
    mocks.productionLoad.mockResolvedValue(connectedSource(overrides));
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );
    expect(screen.getByText(label)).toBeVisible();
  });

  it("keeps the safe Connected project selector and Freshness details", async () => {
    mocks.productionLoad.mockResolvedValue(
      connectedSource({
        latestRun: {
          id: "66666666-6666-4666-8666-666666666666",
          status: "failed",
          finishedAt: "2026-08-17T12:30:00.000Z",
          errorCode: "github_activity_timeout",
        },
      }),
    );
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected", project: projectId }),
        now: () => now,
      }),
    );

    expect(screen.getByText("2026-08-17 12:00:00 UTC")).toBeVisible();
    expect(screen.getByText("github_activity_timeout")).toBeVisible();
    expect(mocks.createProductionPort).toHaveBeenCalledWith(projectId, expect.any(Function));
    expect(mocks.productionLoad).toHaveBeenCalledOnce();
  });

  it("does not query Connected for an unauthenticated request", async () => {
    mocks.productionLoad.mockRejectedValue(new Error("connected_panel_unauthenticated"));
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );

    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toHaveAttribute(
      "href",
      "/api/auth/github?returnTo=%2Fproject-galaxy%3Fmode%3Dconnected",
    );
    expect(mocks.productionLoad).toHaveBeenCalledOnce();
  });

  it("renders a safe empty state for no visible Connected project", async () => {
    mocks.productionLoad.mockRejectedValue(new Error("connected_panel_not_found"));
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({
          mode: "connected",
          project: "33333333-3333-4333-8333-333333333333",
        }),
        now: () => now,
      }),
    );

    expect(screen.getByText("没有可显示的项目")).toBeVisible();
    expect(screen.queryByText(/repository|private|not found/i)).not.toBeInTheDocument();
  });

  it("fails Connected closed without rendering Preview data", async () => {
    mocks.productionLoad.mockRejectedValue(new Error("connected_panel_read_failed"));
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );

    expect(screen.getByText("项目数据暂时不可用。")).toBeVisible();
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
  });

  it("rejects an unknown explicit mode without touching either source", async () => {
    render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "demo" }),
        now: () => now,
      }),
    );

    expect(screen.getByText("面板模式无效。")).toBeVisible();
    expect(mocks.createProductionPort).not.toHaveBeenCalled();
    expect(mocks.productionLoad).not.toHaveBeenCalled();
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
  });
});
