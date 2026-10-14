import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubInstallationStatus } from "./github-installation-status";
const subject = "61111111-1111-4111-8111-111111111111";
const view = { version: "github-installation-management.v1", subjectId: subject, status: "active", canSelectRepositories: true, reconnectRequired: false, managementUrl: "https://github.com/settings/installations/61", managementError: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("t06-onboarding-state-regression.v1 session expiration", () => {
  it("[T06-C19] logout invalidates an in-flight installation response and all old actions", async () => {
    let finish!: (r: Response) => void;
    const calls = vi.fn<typeof fetch>(async url => {
      if (url === "/api/github/installations/current") return new Promise(resolve => { finish = resolve; });
      if (url === "/api/projects") return Response.json({ projects: [] });
      return Response.json({ selectedRepositories: [] });
    });
    vi.stubGlobal("fetch", calls);
    render(<GitHubInstallationStatus authenticated userId={subject} installationStatus="active" />);
    fireEvent.click(screen.getByRole("button", { name: "已返回，刷新授权和仓库" }));
    act(() => window.dispatchEvent(new Event("executor:session-ended")));
    await act(async () => finish(Response.json(view)));
    expect(screen.queryByText("GitHub App Installation 已连接")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "管理 GitHub 仓库授权" })).not.toBeInTheDocument();
    expect(calls.mock.calls.some(([url]) => url === "/api/github/repositories")).toBe(false);
    expect(calls.mock.calls.filter(([, init]) => init?.method && init.method !== "GET")).toHaveLength(0);
  });
});
