import { beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/workspace/workspace-server-context", () => ({ readWorkspaceContext: read }));
import { GET } from "./route";
const workspace = { status: "authenticated", userId: "A", identity: { status: "ready", data: { login: "account-a", avatarUrl: null } }, installation: { status: "ready", data: { status: "active" } }, projects: { status: "ready", data: [{ id: "project-a", name: "a/own", status: "in_planning" }] } };
describe("工作区读取入口", () => {
  beforeEach(() => read.mockResolvedValue(workspace));
  it("注入用户参数不能更换会话且禁止缓存", async () => { const response = await GET(new Request("http://localhost/api/auth/workspace?userId=B")); expect((await response.json()).workspace.userId).toBe("A"); expect(response.headers.get("cache-control")).toContain("no-store"); expect(read).toHaveBeenCalledWith(); });
  it("拒绝跨用户项目 ID", async () => { const response = await GET(new Request("http://localhost/api/auth/workspace?project=project-b")); expect(response.status).toBe(404); expect(JSON.stringify(await response.json())).not.toContain("a/own"); });
  it("允许当前账号真实持有的项目", async () => { expect((await GET(new Request("http://localhost/api/auth/workspace?project=project-a"))).status).toBe(200); });
  it("服务错误不得返回匿名成功", async () => { read.mockResolvedValue({ status: "unavailable", reason: "verification_failed" }); expect((await GET(new Request("http://localhost/api/auth/workspace"))).status).toBe(503); });
});
