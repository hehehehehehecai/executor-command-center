import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { AccountIdentity } from "./account-identity";
import { WorkspaceSessionBoundary } from "./workspace-session-boundary";
const A: WorkspaceContext = { status: "authenticated", userId: "account-a", identity: { status: "ready", data: { login: "octo-a", avatarUrl: "https://avatars.example.invalid/a" } }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [{ id: "project-a", name: "a/private", status: "in_planning" }] } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
describe("当前账号和退出交互", () => {
  it("T05 null 正式状态刷新不会损坏已登录摘要", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workspace: { ...A, projects: { status: "ready", data: [{ id: "project-a", name: "a/private", status: null }] } } }));
    render(<AccountIdentity workspace={A} fetcher={fetcher} />);
    act(() => window.dispatchEvent(new CustomEvent("installation-management-refreshed", { detail: { subjectId: A.userId, status: "active" } })));
    expect(await screen.findByText("我的项目（1）")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("@octo-a")).toBeVisible();
  });
  it("安装核验失败时账号卡也关闭旧摘要且不额外发请求", async () => {
    const fetcher=vi.fn(); render(<AccountIdentity workspace={A} fetcher={fetcher}/>);
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"read_failed"}})));
    expect(await screen.findByText("账号摘要读取失败，请再次刷新授权。")).toBeVisible(); expect(screen.queryByText("我的项目（1）")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("授权刷新后同账号的安装与真实项目摘要同步更新", async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({workspace:A}));
    render(<AccountIdentity workspace={{...A,installation:{status:"ready",data:{status:"revoked"}},projects:{status:"blocked"}}} fetcher={fetcher}/>);
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"active"}})));
    expect(await screen.findByText("GitHub App 已连接")).toBeVisible(); expect(screen.getByText("我的项目（1）")).toBeVisible();
    expect(fetcher).toHaveBeenCalledWith("/api/auth/workspace",expect.objectContaining({cache:"no-store",credentials:"same-origin"}));
  });
  it("远端撤销覆盖旧本地active摘要，错误不继续显示旧项目", async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({workspace:A})).mockResolvedValueOnce(Response.json({}, {status:503}));
    render(<AccountIdentity workspace={A} fetcher={fetcher}/>);
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"revoked"}})));
    expect(await screen.findByText("GitHub App 已撤销")).toBeVisible(); expect(screen.queryByText("我的项目（1）")).toBeNull();
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"active"}})));
    expect(await screen.findByText("账号摘要读取失败，请再次刷新授权。")).toBeVisible(); expect(screen.queryByText("我的项目（1）")).toBeNull();
  });
  it("摘要响应不属于当前账号时拒绝跨账号项目", async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({workspace:{...A,userId:"account-b",projects:{status:"ready",data:[{id:"b-project",name:"b/private",status:"in_planning"}]}}}));
    render(<AccountIdentity workspace={A} fetcher={fetcher}/>);
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"active"}})));
    expect(await screen.findByText("账号摘要读取失败，请再次刷新授权。")).toBeVisible(); expect(screen.queryByText("b/private")).toBeNull();
  });
  it("账号切换后迟到的摘要响应失效", async () => {
    let finish!:(r:Response)=>void; const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
    const ui=render(<AccountIdentity workspace={A} fetcher={fetcher}/>);
    act(()=>window.dispatchEvent(new CustomEvent("installation-management-refreshed",{detail:{subjectId:A.userId,status:"active"}})));
    ui.rerender(<AccountIdentity workspace={{...A,userId:"account-b",identity:{status:"ready",data:{login:"octo-b",avatarUrl:null}},projects:{status:"ready",data:[]}}} fetcher={fetcher}/>);
    await act(async()=>finish(Response.json({workspace:A}))); expect(screen.getByText("我的项目（0）")).toBeVisible(); expect(screen.queryByText("a/private")).toBeNull();
  });
  it("跨标签通知不可用时仍按真实成功结果退出", async () => {
    vi.stubGlobal("BroadcastChannel", vi.fn(function () { throw new Error("unavailable"); }));
    const navigate = vi.fn();
    render(<AccountIdentity workspace={A} fetcher={vi.fn().mockResolvedValue(Response.json({ signedOut: true }))} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "退出当前账号" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/?signedOut=1"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("真实资料与零项目分开，头像不产生外部请求", () => { render(<AccountIdentity workspace={A} />); expect(screen.getByText("@octo-a")).toBeVisible(); expect(screen.getByText("我的项目（1）")).toBeVisible(); expect(screen.queryByRole("img")).toBeNull(); });
  it("未知资料、安装与项目不得伪装匿名或零项目", () => { render(<AccountIdentity workspace={{ ...A, identity: { status: "failed" }, installation: { status: "failed" }, projects: { status: "blocked" } }} />); expect(screen.getByText("GitHub 身份资料暂不可用")).toBeVisible(); expect(screen.queryByText("当前账号暂无项目")).toBeNull(); expect(screen.getByRole("button", { name: "退出当前账号" })).toBeVisible(); });
  it("等待期间禁用退出、成功仅跳固定首页", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const navigate = vi.fn();
    render(<AccountIdentity workspace={A} fetcher={fetcher} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "退出当前账号" }));
    expect(screen.getByRole("button", { name: "正在退出…" })).toBeDisabled();
    await act(async () => finish(Response.json({ signedOut: true, redirectTo: "https://evil.invalid" })));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/?signedOut=1");
    expect(fetcher).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" }));
  });
  it("退出失败保留身份且可以重试", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: "failed" }, { status: 503 })).mockResolvedValueOnce(Response.json({ signedOut: true }));
    const navigate = vi.fn();
    render(<AccountIdentity workspace={A} fetcher={fetcher} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "退出当前账号" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("当前登录仍保留"); expect(screen.getByText("@octo-a")).toBeVisible(); expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "退出当前账号" })); await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  });
});
describe("账号切换缓存边界", () => {
  it("开发模式重复挂载不能隐藏未登录入口", () => {
    render(<StrictMode><WorkspaceSessionBoundary workspace={{ status: "signed_out", reason: "missing_session" }}><p>使用 GitHub 登录</p></WorkspaceSessionBoundary></StrictMode>);
    expect(screen.getByText("使用 GitHub 登录")).toBeVisible();
  });
  it("首次客户端确认前隐藏账号内容，验证后显示", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workspace: A }));
    render(<WorkspaceSessionBoundary workspace={A} fetcher={fetcher}><p>A 私有内容</p></WorkspaceSessionBoundary>);
    expect(screen.getByText("A 私有内容")).not.toBeVisible();
    await waitFor(() => expect(screen.getByText("A 私有内容")).toBeVisible());
  });
  it("pagehide 同步隐藏旧账号，历史恢复发现 B 时整页替换", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ workspace: A })).mockResolvedValueOnce(Response.json({ workspace: { ...A, userId: "account-b" } }));
    const navigate = vi.fn();
    window.history.replaceState({}, "", "/copilot?project=project-a&fromProjectId=project-a");
    render(<WorkspaceSessionBoundary workspace={A} fetcher={fetcher} navigate={navigate}><p>A 私有内容</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(screen.getByText("A 私有内容")).toBeVisible());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(screen.getByText("A 私有内容")).not.toBeVisible();
    act(() => window.dispatchEvent(new Event("pageshow")));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/copilot"));
    expect(screen.getByText("A 私有内容")).not.toBeVisible();
  });
  it("恢复验证失败时隐藏旧内容，重试成功才展示", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(Response.json({ workspace: A }));
    render(<WorkspaceSessionBoundary workspace={A} fetcher={fetcher}><p>A 私有内容</p></WorkspaceSessionBoundary>);
    expect(await screen.findByRole("alert")).toHaveTextContent("内容已隐藏"); expect(screen.getByText("A 私有内容")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重试验证" })); await waitFor(() => expect(screen.getByText("A 私有内容")).toBeVisible());
  });
  it("已退出事件立即隐藏内存里的账号与项目", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workspace: A }));
    const navigate = vi.fn();
    render(<WorkspaceSessionBoundary workspace={A} fetcher={fetcher} navigate={navigate}><p>A 私有内容</p></WorkspaceSessionBoundary>);
    await waitFor(() => expect(screen.getByText("A 私有内容")).toBeVisible());
    act(() => window.dispatchEvent(new Event("executor:session-ended")));
    act(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow")); });
    expect(screen.getByText("A 私有内容")).not.toBeVisible();
    expect(fetcher).toHaveBeenCalledOnce(); expect(navigate).not.toHaveBeenCalled();
  });
});
