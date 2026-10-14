import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/async-workspace-render";
import { installWorkspaceEntryTransport, workspaceEntryResponse } from "@/test/workspace-entry-transport";

vi.mock("@supabase/ssr", async () => ({
  createServerClient: (await import("@/test/workspace-entry-transport")).workspaceEntryClient,
}));
vi.mock("next/headers", async () => ({
  cookies: async () => (await import("@/test/workspace-entry-transport")).workspaceEntryCookies(),
}));

beforeEach(() => installWorkspaceEntryTransport());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });


const mocks = vi.hoisted(() => ({
  createProductionPort: vi.fn(),
  productionLoad: vi.fn(),
}));

vi.mock("@/app/connected-panel-dependencies", () => ({
  createProjectGalaxyProductionConnectedPort: mocks.createProductionPort,
}));

import ProjectGalaxyPage from "./page";
import { AuthorizedRepositoryList } from "@/features/onboarding/authorized-repository-list";

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
  values: { readonly mode?: string; readonly project?: string | string[] } = { mode: "preview" },
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
    vi.unstubAllGlobals();
  });

  it("consumes the onboarding enter-project link as the connected project without another write", async () => {
    const selectionId = "11111111-1111-4111-8111-111111111111";
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.method ?? "GET").toBe("GET");
      const path = String(input);
      if (path === "/api/auth/workspace") return workspaceEntryResponse();
      if (path === "/api/github/repository-selections") {
        return Response.json({ selectedRepositories: [{
          repositoryId: 701, ownerLogin: "synthetic", name: "repo",
          fullName: "synthetic/repo", visibility: "private", isPrivate: true,
          isFork: false, isArchived: false, isDisabled: false, defaultBranch: "main",
          selectedAt: now, updatedAt: now, calibrationStatus: "pending",
        }] });
      }
      if (path === "/api/projects") {
        return Response.json({ projects: [{
          repository: { id: selectionId, repositoryId: 701, fullName: "synthetic/repo", visibility: "private", defaultBranch: "main" },
          calibration: { id: projectId, selectedRepositoryId: selectionId,
            coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null,
            createdAt: now, updatedAt: now },
        }] });
      }
      if (path === `/api/projects/${projectId}/sync-status`) {
        return Response.json({ sync: {
          contractVersion: "project-onboarding-sync.v1", projectId,
          state: "not_started", syncRunId: null, queuedAt: null,
          finishedAt: null, retryRequestId: "onboarding",
        } });
      }
      throw new Error(`unexpected read: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const onboarding = await render(<AuthorizedRepositoryList installationStatus="active" />);
    const link = await screen.findByRole("link", { name: "进入项目" });
    const destination = new URL(link.getAttribute("href")!, "http://localhost");
    expect(destination.pathname).toBe("/project-galaxy");
    onboarding.unmount();

    await render(await ProjectGalaxyPage({
      searchParams: parameters(Object.fromEntries(destination.searchParams)),
      now: () => now,
    }));

    expect(mocks.createProductionPort).toHaveBeenCalledWith(projectId, expect.any(Function));
    expect(mocks.productionLoad).toHaveBeenCalledOnce();
    expect(screen.getByText("Connected Mode")).toBeVisible();
    expect(screen.getByText("executor-stage6-staging-fixture")).toBeVisible();
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "启动首次同步" });
    expect(fetcher.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("loads the fictional Preview by default without touching Connected", async () => {
    await render(
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
    // This composition case checks action placement after the separate,
    // authoritative status request resolves; it does not start a sync.
    vi.stubGlobal("fetch", vi.fn(async input => String(input) === "/api/auth/workspace" ? workspaceEntryResponse() : Response.json({ sync: {
      contractVersion: "project-onboarding-sync.v1", projectId,
      state: "not_started", syncRunId: null, queuedAt: null,
      finishedAt: null, retryRequestId: "onboarding",
    } })));
    await render(
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
      await screen.findByRole("button", { name: "启动首次同步" }),
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
    await render(
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
    await render(
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
    await render(
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
    await render(
      await ProjectGalaxyPage({
        searchParams: parameters({
          mode: "connected",
          project: "33333333-3333-4333-8333-333333333333",
        }),
        now: () => now,
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/^原因：没有可显示的项目$/);
    expect(screen.queryByText(/repository|private|not found/i)).not.toBeInTheDocument();
  });

  it("fails Connected closed without rendering Preview data", async () => {
    mocks.productionLoad.mockRejectedValue(new Error("connected_panel_read_failed"));
    await render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "connected" }),
        now: () => now,
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/^原因：项目数据暂时不可用。$/);
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
  });

  it("rejects an unknown explicit mode without touching either source", async () => {
    await render(
      await ProjectGalaxyPage({
        searchParams: parameters({ mode: "demo" }),
        now: () => now,
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/^原因：面板模式无效。$/);
    expect(mocks.createProductionPort).not.toHaveBeenCalled();
    expect(mocks.productionLoad).not.toHaveBeenCalled();
    expect(screen.queryByText("Aurora Cartography")).not.toBeInTheDocument();
  });
});
