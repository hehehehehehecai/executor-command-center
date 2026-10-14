// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleProjectContextWrite } from "./project-context-http";
const origin = "https://workspace.example.test";
const id = "11111111-1111-4111-8111-111111111111";
const output = { contractVersion: "project-context.v1" as const, id, selectedRepositoryId: id, context: { coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null }, completeness: { complete: false, missingFields: ["coreGoal", "currentStageGoal", "status"] }, syncPreparation: { state: "ready" as const, requested: false as const } };
function request(body: unknown = { selectedRepositoryId: id }, method = "POST", headers: Record<string, string> = { origin }) {
  return new Request(origin + "/api/projects/from-repository", { method, headers: { "content-type": "application/json", ...headers }, ...(method === "GET" || method === "HEAD" ? {} : { body: JSON.stringify(body) }) });
}
describe("新背景写接口的公开安全边界", () => {
  it.each([
    new Request(origin + "/api/projects/from-repository?enabled=1", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ selectedRepositoryId: id }) }),
    new Request(origin + "/api/projects/from-repository", { method: "POST", headers: { origin, "content-type": "text/plain" }, body: "{}" }),
    new Request(origin + "/api/projects/from-repository", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" }),
  ])("查询参数、内容类型或畸形 JSON 在存储前拒绝 %#", async invalid => {
    const execute = vi.fn(); const response = await handleProjectContextWrite({ request: invalid, operation: "create", flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(400); expect(execute).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "true", "0", " 1", "1 ", true])("开关 %s 关闭且不能靠请求绕过", async flag => {
    const execute = vi.fn(); const response = await handleProjectContextWrite({ request: request({ selectedRepositoryId: id, enabled: "1" }), operation: "create", flag, appOrigin: origin, execute });
    expect(response.status).toBe(404); expect(execute).not.toHaveBeenCalled();
  });
  it("显式开启且同源时保持 null 语义和禁止缓存", async () => {
    const execute = vi.fn().mockResolvedValue(output);
    const response = await handleProjectContextWrite({ request: request(), operation: "create", flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ project: output });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0"); expect(response.headers.get("vary")).toBe("Cookie, Origin");
    expect(execute).toHaveBeenCalledWith({ selectedRepositoryId: id });
  });
  it.each([{}, { origin: "https://evil.example" }, { origin, "sec-fetch-site": "cross-site" }, { origin, "sec-fetch-site": "same-site" }] as Record<string, string>[])("缺失或跨站来源拒绝 %#", async headers => {
    const execute = vi.fn(); const response = await handleProjectContextWrite({ request: request(undefined, "POST", headers), operation: "create", flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(403); expect(execute).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT", "DELETE", "PATCH"])("创建路由拒绝 %s", async method => {
    const execute = vi.fn(); const response = await handleProjectContextWrite({ request: request(undefined, method), operation: "create", flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("POST"); expect(execute).not.toHaveBeenCalled();
  });
  it("PATCH 只转交实际字段并保留 null", async () => {
    const execute = vi.fn().mockResolvedValue(output);
    const response = await handleProjectContextWrite({ request: request({ coreGoal: null }, "PATCH"), operation: "patch", projectId: id, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(200); expect(execute).toHaveBeenCalledWith({ coreGoal: null });
  });
  it.each([{ userId: id }, { status: "invalid" }, {}, { currentStageGoal: " " }])("非法 PATCH 不调用写入 %#", async body => {
    const execute = vi.fn(); const response = await handleProjectContextWrite({ request: request(body, "PATCH"), operation: "patch", projectId: id, flag: "1", appOrigin: origin, execute });
    expect(response.status).toBe(400); expect(execute).not.toHaveBeenCalled();
  });
  it.each([["project_context_unauthenticated", 401], ["project_context_not_found", 404], ["project_context_authorization_unavailable", 403], ["project_context_archived", 409], ["project_context_account_unavailable", 409], ["project_context_repository_unavailable", 409], ["project_context_conflict", 409], ["raw SQL password private-data", 503]])("错误安全映射 %s", async (error, status) => {
    const response = await handleProjectContextWrite({ request: request(), operation: "create", flag: "1", appOrigin: origin, execute: async () => { throw new Error(String(error)); } });
    expect(response.status).toBe(status); const body = await response.json(); expect(JSON.stringify(body)).not.toMatch(/password|private-data|SQL/);
    expect(body.error.code).toBe(status === 503 ? "project_context_unavailable" : error);
  });
});
