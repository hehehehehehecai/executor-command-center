import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), set: vi.fn(), getAll: vi.fn(), create: vi.fn(), environment: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
vi.mock("@/infrastructure/workspace/workspace-server-context", () => ({ workspaceEnvironment: mocks.environment }));
vi.mock("@/infrastructure/auth/supabase-server-client", () => ({ createSupabaseServerClient: mocks.create }));
import { GET, POST } from "./route";
const origin = "http://localhost:3000";
function request(headers: Record<string, string> = { origin }, suffix = "", body?: string) { return new Request(origin + "/api/auth/sign-out" + suffix, { method: "POST", headers, body }); }
describe("安全退出当前会话", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("APP_ORIGIN", origin);
    mocks.getAll.mockReturnValue([{ name: "sb-test-auth-token", value: "synthetic" }, { name: "theme", value: "dark" }]);
    mocks.environment.mockReturnValue({});
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.create.mockImplementation(() => ({ auth: { signOut: mocks.signOut } }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("GET 无副作用且只允许 POST", async () => { expect((await GET()).status).toBe(405); expect(mocks.create).not.toHaveBeenCalled(); });
  it.each([{}, { origin: "https://evil.invalid" }, { origin: "null" }, { origin, "sec-fetch-site": "cross-site" }, { origin, "sec-fetch-site": "same-site" }])("拒绝缺失或跨源请求 %#", async headers => {
    expect((await POST(request(headers as Record<string, string>))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("配置缺失时不信任请求自己声明的 origin", async () => {
    vi.stubEnv("APP_ORIGIN", undefined); expect((await POST(request())).status).toBe(403);
  });
  it.each([["?userId=B", undefined], ["?redirectTo=https://evil.invalid", undefined], ["", '{"userId":"B"}']])("拒绝身份和跳转参数 %#", async (suffix, body) => {
    expect((await POST(request({ origin }, suffix, body))).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("仅退出当前会话并提交 Supabase 的 Cookie 删除，不清理主题", async () => {
    mocks.create.mockImplementation(({ cookieStore, responseHeaders }) => {
      cookieStore.set("sb-test-auth-token", "", { maxAge: 0, path: "/" });
      responseHeaders.set("cache-control", "public");
      return { auth: { signOut: mocks.signOut } };
    });
    const response = await POST(request({ origin, "sec-fetch-site": "same-origin" }));
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith("sb-test-auth-token", "", { maxAge: 0, path: "/" });
    expect(await response.json()).toEqual({ signedOut: true, redirectTo: "/?signedOut=1" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("上游先删除本地 Cookie 再报错时不提交删除", async () => {
    mocks.create.mockImplementation(({ cookieStore }) => { cookieStore.set("sb-test-auth-token", "", { maxAge: 0 }); return { auth: { signOut: mocks.signOut } }; });
    mocks.signOut.mockResolvedValue({ error: { message: "sensitive upstream" } });
    const response = await POST(request()); expect(response.status).toBe(503); expect(mocks.set).not.toHaveBeenCalled(); expect(JSON.stringify(await response.json())).not.toContain("sensitive");
  });
  it("无会话的退出仍幂等完成", async () => { mocks.getAll.mockReturnValue([]); expect((await POST(request())).status).toBe(200); });
  it("框架内部地址与公开来源不同仍按可信配置验证", async () => {
    vi.stubEnv("APP_ORIGIN", "https://app.example.invalid");
    const response = await POST(new Request("http://localhost:3000/api/auth/sign-out", { method: "POST", headers: { origin: "https://app.example.invalid", "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(200); expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("配置或网络异常显示可重试失败", async () => { mocks.environment.mockImplementation(() => { throw new Error("secret"); }); expect((await POST(request())).status).toBe(503); expect(mocks.set).not.toHaveBeenCalled(); });
});
