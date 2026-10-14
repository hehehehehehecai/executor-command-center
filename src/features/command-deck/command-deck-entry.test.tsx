import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceContext, WorkspaceProject } from "@/application/workspace/load-workspace-context";
import { CommandDeckPage } from "./command-deck-page";
import { CommandDeckNavigation } from "./command-deck-navigation";

const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const beta = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function workspace(projects: readonly WorkspaceProject[]): WorkspaceContext {
  return { status: "authenticated", userId: "11111111-1111-4111-8111-111111111111", identity: { status: "ready", data: { login: "current-captain", avatarUrl: null } }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: projects } };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("T07 formal homepage and actual navigation", () => {
  it("T07-H01 anonymous homepage consumes no personal fixture", () => {
    render(<CommandDeckPage workspace={{ status: "signed_out", reason: "missing_session" }} />);
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeVisible();
    expect(screen.queryByText(/Aurora|演示数据版本|完全虚构|虚构活动/)).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("T07-H02 a single owned null-background project opens all five exact destinations", () => {
    render(<CommandDeckPage workspace={workspace([{ id: alpha, name: "current/private-project", status: null }])} />);
    expect(screen.getAllByText("current/private-project").length).toBeGreaterThan(0);
    const entries = within(screen.getByRole("navigation", { name: "Command Deck 面板入口" })).getAllByRole("link");
    expect(entries.map(link => link.getAttribute("href"))).toEqual([
      `/project-galaxy?project=${alpha}`, `/flight-log?project=${alpha}`, `/mission-control?project=${alpha}`, `/decision-archive?project=${alpha}`, `/copilot?projectId=${alpha}`,
    ]);
    expect(screen.queryByText(/演示数据|后续 Phase/)).not.toBeInTheDocument();
  });
  it("T07-H03 no-project state offers onboarding without inventing a project", () => {
    render(<CommandDeckPage workspace={workspace([])} />);
    expect(screen.getByRole("link", { name: "接入项目" })).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByText(/Aurora|演示数据/)).not.toBeInTheDocument();
  });
  it("T07-H04 same-name projects have readable choices without UUID typing", () => {
    render(<CommandDeckPage workspace={workspace([{ id: alpha, name: "team/same", status: null }, { id: beta, name: "team/same", status: null }])} />);
    const select = screen.getByRole("combobox", { name: "选择项目" });
    expect(within(select).getAllByRole("option").filter(option => option.getAttribute("value"))).toHaveLength(2);
    expect(new Set(within(select).getAllByRole("option").map(option => option.textContent)).size).toBe(3);
    expect(screen.queryByRole("textbox", { name: /项目.*ID/i })).not.toBeInTheDocument();
  });
  it("T07-H05 verification failure displays recovery instead of demo or empty success", () => {
    render(<CommandDeckPage workspace={{ status: "unavailable", reason: "verification_failed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法");
    expect(screen.getByRole("link", { name: "重试读取" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/Aurora|演示数据|还没有项目/)).not.toBeInTheDocument();
  });
  it("T07-H06 project read failure remains distinct from no projects", () => {
    const value = workspace([]); if (value.status !== "authenticated") throw new Error("fixture_invalid");
    render(<CommandDeckPage workspace={{ ...value, projects: { status: "failed" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("项目");
    expect(screen.queryByRole("link", { name: "接入项目" })).not.toBeInTheDocument();
  });
  it("T07-H07 formal render performs no business request", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(<CommandDeckPage workspace={workspace([{ id: alpha, name: "current/private-project", status: null }])} />);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("T07-H08 actual mobile drawer preserves selected project and current panel", () => {
    render(<CommandDeckNavigation projectId={alpha} current="flight-log" />);
    fireEvent.click(screen.getByRole("button", { name: "打开主导航" }));
    const nav = within(screen.getByRole("navigation", { name: "移动主导航" }));
    expect(nav.getByRole("link", { name: "舰桥总览" })).toHaveAttribute("href", `/?project=${alpha}`);
    expect(nav.getByRole("link", { name: "Copilot AI 副驾驶" })).toHaveAttribute("href", `/copilot?projectId=${alpha}`);
    expect(nav.getByRole("link", { name: "Flight Log 航行日志" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "舰桥总览" })).not.toHaveAttribute("aria-current");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "打开主导航" })).toHaveFocus();
  });
});
