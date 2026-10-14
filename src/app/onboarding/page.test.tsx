import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext, WorkspaceProject } from "@/application/workspace/load-workspace-context";
import OnboardingPage from "./page";

const port = vi.hoisted(() => ({ read: vi.fn(), redirect: vi.fn() }));
vi.mock("@/infrastructure/workspace/workspace-server-context", () => ({ readWorkspaceContext: port.read }));
// The browser suite separately exercises the real session boundary and its HTTP reader.
vi.mock("@/features/onboarding/workspace-session-boundary", () => ({ WorkspaceSessionBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/navigation", () => ({ redirect: port.redirect }));

const account = "61111111-1111-4111-8111-111111111111";
const firstId = "62222222-2222-4222-8222-222222222222";
const secondId = "63333333-3333-4333-8333-333333333333";
const foreignId = "64444444-4444-4444-8444-444444444444";
const first: WorkspaceProject = { id: firstId, name: "synthetic-owner/alpha", status: null };
const second: WorkspaceProject = { id: secondId, name: "synthetic-owner/beta", status: "in_development" };
const context = (projects: readonly WorkspaceProject[] = []): WorkspaceContext => ({
  status: "authenticated", userId: account,
  identity: { status: "ready", data: { login: "synthetic-owner", avatarUrl: null } },
  installation: { status: "ready", data: { status: "active" } },
  projects: { status: "ready", data: projects },
});
let workspace: WorkspaceContext;
let network: ReturnType<typeof vi.fn<typeof fetch>>;
async function show(params: Record<string, string> = {}) {
  port.read.mockResolvedValue(workspace);
  return render(await OnboardingPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  workspace = context();
  port.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  network = vi.fn<typeof fetch>(async (url) => {
    if (url === "/api/auth/workspace") return Response.json({ workspace });
    if (url === "/api/github/repository-selections") return Response.json({ selectedRepositories: [] });
    if (url === "/api/projects") return Response.json({ projects: [] });
    if (url === "/api/github/repositories") return Response.json({ repositorySelection: "selected", totalCount: 0, repositories: [], loadedAt: "2026-10-08T00:00:00Z" });
    return Response.json({ error: { code: "unexpected_fixture_request" } }, { status: 500 });
  });
  vi.stubGlobal("fetch", network);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("t06-onboarding-state-regression.v1 actual page", () => {
  it("[T06-C01] anonymous sign-in preserves a legal local target and hides private names", async () => {
    workspace = { status: "signed_out", reason: "missing_session" };
    const target = `/project-galaxy?mode=connected&project=${firstId}&tab=activity`;
    await show({ returnTo: target });
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toHaveAttribute("href", `/api/auth/github?returnTo=${encodeURIComponent(target)}`);
    expect(screen.queryByText("@synthetic-owner")).not.toBeInTheDocument();
    expect(screen.queryByText(first.name)).not.toBeInTheDocument();
  });
  it("[T06-C02] expired session asks for sign-in without inventing an account", async () => {
    workspace = { status: "signed_out", reason: "invalid_session" };
    await show();
    expect(screen.getByText("登录已失效，请重新登录。")).toBeVisible();
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeVisible();
    expect(network).not.toHaveBeenCalled();
  });
  it("[T06-C03] unavailable session has a visible retry and no project empty-state", async () => {
    workspace = { status: "unavailable", reason: "verification_failed" };
    await show();
    expect(screen.getByRole("button", { name: "重新读取接入状态" })).toBeVisible();
    expect(screen.queryByText("当前账号暂无项目")).not.toBeInTheDocument();
  });
  it("[T06-C04] not installed uses the verified login and a clear installation action", async () => {
    const ready = context();
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, installation: { status: "ready", data: null } };
    await show();
    expect(screen.getByText("@synthetic-owner")).toBeVisible();
    expect(screen.getByRole("link", { name: "安装只读 GitHub App" })).toHaveAttribute("data-onboarding-primary", "true");
  });
  it("[T06-C05] configuration failure stays visible with an installation recovery", async () => {
    const ready = context();
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, installation: { status: "ready", data: null } };
    await show({ installation: "configuration_failed" });
    expect(screen.getByText("GitHub App Installation 配置失败")).toBeVisible();
    expect(screen.getByRole("link", { name: "安装只读 GitHub App" })).toBeVisible();
  });
  it("[T06-C06] an empty accessible list can load authorized repositories without background completion", async () => {
    await show();
    const button = await screen.findByRole("button", { name: "加载已授权仓库" });
    expect(button).toHaveAttribute("data-onboarding-primary", "true");
    fireEvent.click(button);
    expect(await screen.findByText("当前授权范围内没有仓库。")).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存项目背景" })).not.toBeInTheDocument();
    expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
  it("[T06-C07] failed project read is an error with retry, never a fabricated empty list", async () => {
    const ready = context();
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, projects: { status: "failed" } };
    await show();
    expect(screen.getByRole("alert", { name: "项目读取失败" })).toBeVisible();
    expect(screen.getByRole("button", { name: "重新读取接入状态" })).toBeVisible();
    expect(screen.queryByText("当前账号暂无项目")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载已授权仓库" })).not.toBeInTheDocument();
  });
  it("[T06-C08] installation read failure has a primary recovery without exposing selection", async () => {
    const ready = context();
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, installation: { status: "failed" }, projects: { status: "blocked" } };
    await show();
    expect(screen.getByRole("button", { name: "已返回，刷新授权和仓库" })).toHaveAttribute("data-onboarding-primary", "true");
    expect(screen.queryByRole("button", { name: "加载已授权仓库" })).not.toBeInTheDocument();
  });
  it("[T06-C09] one project with null formal status enters the exact connected project", async () => {
    workspace = context([first]);
    await show();
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${firstId}`);
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("data-onboarding-primary", "true");
    expect(screen.getByText(first.name)).toBeVisible();
    expect(screen.queryByRole("button", { name: "保存项目背景" })).not.toBeInTheDocument();
  });
  it("[T06-C10] multiple projects require a readable choice and preserve the chosen ID", async () => {
    workspace = context([first, second]);
    await show();
    const select = screen.getByRole("combobox", { name: "选择要进入的项目" });
    expect(screen.getByRole("button", { name: "进入项目" })).toBeDisabled();
    fireEvent.change(select, { target: { value: secondId } });
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${secondId}`);
    expect(screen.getByRole("option", { name: second.name })).toBeInTheDocument();
  });
  it("[T06-C11] duplicate readable names are distinguishable without displaying UUIDs", async () => {
    workspace = context([first, { ...second, name: first.name }]);
    await show();
    const options = screen.getAllByRole("option").map(option => option.textContent);
    expect(options).toContain(`${first.name}（第 1 个）`);
    expect(options).toContain(`${first.name}（第 2 个）`);
    expect(options.join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/);
  });
  it("[T06-C12] ready login returns to a server-owned local target with its complete query", async () => {
    workspace = context([first, second]);
    const target = `/project-galaxy?mode=connected&project=${secondId}&tab=activity`;
    await expect(show({ returnTo: target })).rejects.toThrow(`NEXT_REDIRECT:${target}`);
  });
  it("[T06-C13] a foreign project return is rejected and never presented as enterable", async () => {
    workspace = context([first]);
    await show({ returnTo: `/project-galaxy?mode=connected&project=${foreignId}` });
    expect(port.redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: "返回目标不可用" })).toBeVisible();
    expect(screen.getByRole("link", { name: "进入项目" })).toHaveAttribute("href", `/project-galaxy?mode=connected&project=${firstId}`);
  });
  it("[T06-C14] onboarding itself is a usable fallback rather than a redirect loop", async () => {
    workspace = context([first]);
    await show({ returnTo: "/onboarding?returnTo=%2Fonboarding" });
    expect(port.redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "进入项目" })).toBeVisible();
  });
  it("[T06-C15] internal state fields live in closed diagnostics", async () => {
    await show();
    const diagnostic = screen.getByText("authenticated", { selector: "dt" }).closest("details");
    expect(diagnostic).not.toBeNull();
    expect(diagnostic).not.toHaveAttribute("open");
    expect(screen.getByText("authenticated", { selector: "dt" })).not.toBeVisible();
    expect(screen.getByText("@synthetic-owner")).toBeVisible();
  });
  it("[T06-C16] suspended installation offers management recovery and preserves stored records", async () => {
    const ready = context([first]);
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, installation: { status: "ready", data: { status: "suspended" } }, projects: { status: "blocked" } };
    await show();
    expect(screen.getByRole("link", { name: "管理 GitHub 仓库授权" })).toHaveAttribute("data-onboarding-primary", "true");
    expect(screen.getByText(/请在 GitHub 安装设置中恢复授权/)).toBeVisible();
    expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });
  it("[T06-C17] revoked installation offers reinstallation without a background form gate", async () => {
    const ready = context();
    if (ready.status !== "authenticated") throw new Error("fixture_invalid");
    workspace = { ...ready, installation: { status: "ready", data: { status: "revoked" } }, projects: { status: "blocked" } };
    await show();
    expect(screen.getByRole("link", { name: "重新安装 GitHub App" })).toHaveAttribute("data-onboarding-primary", "true");
    expect(screen.queryByRole("button", { name: "保存项目背景" })).not.toBeInTheDocument();
  });
  it("[T06-C18] mounting an existing project does not create, sync or save", async () => {
    workspace = context([first]);
    await show();
    await waitFor(() => expect(network.mock.calls.some(([url]) => url === "/api/github/repository-selections")).toBe(true));
    expect(network.mock.calls.filter(([, init]) => init?.method && init.method !== "GET")).toHaveLength(0);
  });
  it("[T06-C24] opening secondary repository management does not create a competing primary action", async () => {
    workspace = context([first]);
    await show();
    fireEvent.click(screen.getByText("添加仓库与授权管理", { selector: "summary" }));
    await screen.findByRole("button", { name: "加载已授权仓库" });
    const visibleActions = [...screen.getAllByRole("link"), ...screen.getAllByRole("button")].filter(element => element.getAttribute("data-onboarding-primary") === "true");
    expect(visibleActions).toHaveLength(1);
    expect(visibleActions[0]).toHaveTextContent("进入项目");
  });
});
