import { describe, expect, it, vi } from "vitest";
import { SupabaseWorkspaceContextReader, type WorkspaceSessionClient } from "./supabase-workspace-context-reader";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function setup(data: unknown = [], error: unknown = null) {
  const query = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) };
  const select = vi.fn(() => query);
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: A } }, error: null }) }, from: vi.fn(() => ({ select })) };
  return { client, query, select, reader: new SupabaseWorkspaceContextReader(client as unknown as WorkspaceSessionClient) };
}
describe("会话客户端读取工作区", () => {
  it.each([null, "in_planning", "in_development", "polishing", "dormant", "completed", "archived"])("T05 项目身份独立于背景状态 %s", async status => {
    const row = { id: B, user_id: A, status, selected_repositories: { user_id: A, full_name: "a/project", github_installations: { user_id: A, status: "active" } } };
    expect(await setup([row]).reader.readProjects(A)).toEqual([{ id: B, name: "a/project", status }]);
  });
  it.each([undefined, "", "  ", "invented"])("T05 不把畸形状态当未确认 %#", async status => {
    const row = { id: B, user_id: A, status, selected_repositories: { user_id: A, full_name: "a/project", github_installations: { user_id: A, status: "active" } } };
    await expect(setup([row]).reader.readProjects(A)).rejects.toThrow();
  });
  it("无 Cookie 时不调用验证服务", async () => {
    const { client } = setup();
    expect(await new SupabaseWorkspaceContextReader(client as unknown as WorkspaceSessionClient, false).verifySession()).toEqual({ status: "signed_out", reason: "missing_session" });
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });
  it("必须用 getUser 的已验证 UUID", async () => {
    const { reader, client } = setup();
    expect(await reader.verifySession()).toEqual({ status: "verified", user: { id: A } });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
  });
  it.each(["bad_jwt", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "session_expired"])("明确失效 %s", async code => {
    const { reader, client } = setup();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code } });
    expect(await reader.verifySession()).toEqual({ status: "signed_out", reason: "invalid_session" });
  });
  it.each([{ status: 401 }, { status: 503 }, { code: "unexpected_failure" }])("未知验证错误不伪装匿名 %#", async error => {
    const { reader, client } = setup();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error });
    expect(await reader.verifySession()).toEqual({ status: "unavailable", reason: "verification_failed" });
  });
  it("网络异常归为验证失败", async () => {
    const { reader, client } = setup();
    client.auth.getUser.mockRejectedValue(new Error("network"));
    expect((await reader.verifySession()).status).toBe("unavailable");
  });
  it("拒绝无有效用户 UUID 的验证结果", async () => {
    const { reader, client } = setup();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "fake" } }, error: null });
    expect((await reader.verifySession()).status).toBe("signed_out");
  });
  it("身份资料按用户过滤并核对返回归属", async () => {
    const { reader, query } = setup([{ user_id: A, github_login: "octo-a", avatar_url: null }]);
    expect(await reader.readIdentity(A)).toEqual({ login: "octo-a", avatarUrl: null });
    expect(query.eq).toHaveBeenCalledWith("user_id", A);
    await expect(setup([{ user_id: B, github_login: "octo-a", avatar_url: null }]).reader.readIdentity(A)).rejects.toThrow("workspace_owner_mismatch");
  });
  it.each([null, [{ user_id: A, status: "unexpected" }], [{ user_id: B, status: "active" }]])("坏安装数据不得当作未安装 %#", async data => {
    await expect(setup(data).reader.readInstallation(A)).rejects.toThrow();
  });
  it("真实空列表才表示未安装", async () => {
    expect(await setup().reader.readInstallation(A)).toBeNull();
    await expect(setup([], { message: "secret" }).reader.readInstallation(A)).rejects.toThrow("workspace_read_failed");
  });
  it("项目以会话用户过滤并返回最小字段", async () => {
    const row = { id: B, user_id: A, status: "in_planning", selected_repositories: { user_id: A, full_name: "a/project", github_installations: { user_id: A, status: "active" } } };
    const { reader, query } = setup([row]);
    expect(await reader.readProjects(A)).toEqual([{ id: B, name: "a/project", status: "in_planning" }]);
    expect(query.eq).toHaveBeenCalledWith("user_id", A);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it.each(["project", "repository", "installation", "suspended", "revoked"])("阻止项目关联越权或失效安装 %s", async boundary => {
    const row = { id: B, user_id: boundary === "project" ? B : A, status: "in_planning", selected_repositories: { user_id: boundary === "repository" ? B : A, full_name: "a/project", github_installations: { user_id: boundary === "installation" ? B : A, status: ["suspended", "revoked"].includes(boundary) ? boundary : "active" } } };
    await expect(setup([row]).reader.readProjects(A)).rejects.toThrow();
  });
});
