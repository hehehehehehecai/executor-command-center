import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSessionBoundary } from "./workspace-session-boundary";

const alpha = "11111111-1111-4111-8111-111111111111";
const project = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const path = `/flight-log?project=${project}&apply=1&range=24h&type=issue#main-content`;
const initialUrl = window.location.href;
const workspace = {
  status: "authenticated", userId: alpha,
  identity: { status: "ready", data: { login: "current-alpha", avatarUrl: null } },
  installation: { status: "ready", data: { status: "active" } },
  projects: { status: "ready", data: [{ id: project, name: "current/project", status: null }] },
} as const;
afterEach(() => { cleanup(); window.history.replaceState({}, "", initialUrl); });

describe("T07 actual navigation session boundary", () => {
  it("T07-S01 anonymous revalidation retains a public safe login project destination", async () => {
    window.history.replaceState({}, "", path);
    const signedOut = { status: "signed_out", reason: "missing_session" } as const;
    const fetcher = vi.fn(async () => Response.json({ workspace: signedOut }));
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={signedOut} fetcher={fetcher} navigate={navigate} preserveWorkspaceQuery><p>公开登录说明</p></WorkspaceSessionBoundary>);
    fireEvent.focus(window);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("公开登录说明")).toBeVisible());
    expect(navigate).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(path);
  });
  it("T07-S02 same-account changed summary retains the owned project and required filter query", async () => {
    window.history.replaceState({}, "", path);
    const changed = { ...workspace, projects: { status: "ready", data: [...workspace.projects.data, { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "current/second", status: null }] } };
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={workspace} fetcher={async () => Response.json({ workspace: changed })} navigate={navigate} preserveWorkspaceQuery><p>前账户隐私</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(path));
    expect(screen.getByText("前账户隐私")).not.toBeVisible();
  });
  it("T07-S03 a changed account drops previous project and query before exposing private content", async () => {
    window.history.replaceState({}, "", path);
    const changed = { ...workspace, userId: "22222222-2222-4222-8222-222222222222" };
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={workspace} fetcher={async () => Response.json({ workspace: changed })} navigate={navigate} preserveWorkspaceQuery><p>前账户隐私</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/flight-log"));
    expect(screen.getByText("前账户隐私")).not.toBeVisible();
    cleanup();
    navigate.mockClear();
    window.history.replaceState({}, "", path);
    const emptyAccount = { ...changed, projects: { status: "ready", data: [] } } as const;
    render(<WorkspaceSessionBoundary workspace={emptyAccount} fetcher={async () => Response.json({ workspace: emptyAccount })} navigate={navigate} preserveWorkspaceQuery><p>历史前账户隐私</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/flight-log?apply=1&range=24h&type=issue"));
    expect(screen.getByText("历史前账户隐私")).not.toBeVisible();
  });
  it("T07-S04 same-account verification retains a denied foreign URL without silently selecting another project", async () => {
    const foreignPath = "/flight-log?project=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    window.history.replaceState({}, "", foreignPath);
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={workspace} fetcher={async () => Response.json({ workspace })} navigate={navigate} preserveWorkspaceQuery><p>没有可显示的项目</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(screen.getByText("没有可显示的项目")).toBeVisible());
    expect(navigate).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(foreignPath);
  });
  it("T07-S05 a removed project stays in the same-account server destination while former content remains hidden", async () => {
    window.history.replaceState({}, "", path);
    const changed = { ...workspace, projects: { status: "ready", data: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "current/remaining-project", status: null }] } };
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={workspace} fetcher={async () => Response.json({ workspace: changed })} navigate={navigate} preserveWorkspaceQuery><p>前项目隐私</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(path));
    expect(screen.getByText("前项目隐私")).not.toBeVisible();
  });
});
