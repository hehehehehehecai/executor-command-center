import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), read: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })) }));
vi.mock("@/shared/configuration/server-environment", () => ({ parseServerEnvironment: vi.fn(() => ({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key", APP_ORIGIN: "https://executor.example.test" })) }));
vi.mock("@/infrastructure/auth/supabase-server-client", () => ({ createSupabaseServerClient: vi.fn(() => ({ auth: { getUser: mocks.getUser }, from: vi.fn() })) }));
vi.mock("@/infrastructure/synchronization/supabase-project-freshness-reader", () => ({ SupabaseProjectFreshnessReader: class { read = mocks.read; } }));

import ProjectGalaxyPage from "./page";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const now = "2026-08-12T13:00:00.000Z";

function view(overrides: Record<string, unknown> = {}) {
  return { projectId, input: { provenance: "real" as const, authorizationRevoked: false, latestRun: { id: "44444444-4444-4444-8444-444444444444", status: "completed" as const, finishedAt: "2026-08-12T12:00:00.000Z", errorCode: null }, lastSuccessfulAt: "2026-08-12T12:00:00.000Z", coverageComplete: true, now, ...overrides } };
}

describe("/project-galaxy real Freshness page", () => {
  beforeEach(() => { mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null }); mocks.read.mockResolvedValue(view()); });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("renders a real Freshness route instead of 404/demo data", async () => {
    render(await ProjectGalaxyPage({ searchParams: Promise.resolve({}), now: () => now }));
    expect(screen.getByRole("heading", { name: "Project Galaxy" })).toBeVisible();
    expect(screen.getByText("真实项目数据")).toBeVisible();
    expect(screen.queryByText(/演示数据|Helios Archive/)).not.toBeInTheDocument();
  });

  it.each([
    ["fresh", {}, "Fresh"],
    ["stale", { lastSuccessfulAt: "2026-08-11T12:59:59.999Z" }, "Stale"],
    ["syncing", { latestRun: { id: "55555555-5555-4555-8555-555555555555", status: "running", finishedAt: null, errorCode: null } }, "Syncing"],
    ["failed", { latestRun: { id: "66666666-6666-4666-8666-666666666666", status: "failed", finishedAt: "2026-08-12T12:30:00.000Z", errorCode: "github_activity_timeout" } }, "Failed"],
    ["authorization revoked", { authorizationRevoked: true }, "Authorization revoked"],
  ])("renders %s through the existing domain presentation", async (_case, overrides, label) => {
    mocks.read.mockResolvedValue(view(overrides));
    render(await ProjectGalaxyPage({ searchParams: Promise.resolve({}), now: () => now }));
    expect(screen.getByText(label)).toBeVisible();
  });

  it("shows last successful time, latest safe run id and allowlisted error code", async () => {
    mocks.read.mockResolvedValue(view({ latestRun: { id: "66666666-6666-4666-8666-666666666666", status: "failed", finishedAt: "2026-08-12T12:30:00.000Z", errorCode: "github_activity_timeout" } }));
    render(await ProjectGalaxyPage({ searchParams: Promise.resolve({ project: projectId }), now: () => now }));
    expect(screen.getByText("2026-08-12 12:00:00 UTC")).toBeVisible();
    expect(screen.getByText(/failed/)).toBeVisible();
    expect(screen.getByText("github_activity_timeout")).toBeVisible();
    expect(mocks.read).toHaveBeenCalledWith({ userId, projectId, now });
  });

  it("does not query projects for an unauthenticated request", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(await ProjectGalaxyPage({ searchParams: Promise.resolve({}), now: () => now }));
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toHaveAttribute("href", "/api/auth/github?returnTo=%2Fproject-galaxy");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("renders a safe empty state for no visible project", async () => {
    mocks.read.mockResolvedValue(null);
    render(await ProjectGalaxyPage({ searchParams: Promise.resolve({ project: "33333333-3333-4333-8333-333333333333" }), now: () => now }));
    expect(screen.getByText("没有可显示的项目")).toBeVisible();
    expect(screen.queryByText(/repository|private|not found/i)).not.toBeInTheDocument();
  });
});
