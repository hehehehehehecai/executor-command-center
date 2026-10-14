import { describe, expect, it, vi } from "vitest";
import { handleProjectSyncStatus } from "./project-sync-status-http";
import type { ProjectSyncStatusView } from "@/domain/synchronization/project-onboarding-sync";

const projectId = "11111111-1111-4111-8111-111111111111";
const origin = "https://example.invalid";
const view: ProjectSyncStatusView = { contractVersion: "project-onboarding-sync.v1", projectId, state: "not_started", syncRunId: null, queuedAt: null, finishedAt: null, retryRequestId: "onboarding" };
const request = (method = "GET", headers?: HeadersInit, query = "") => new Request(`${origin}/api/projects/${projectId}/sync-status${query}`, { method, headers });
function safeHeaders(response: Response) { expect(response.headers.get("cache-control")).toContain("private"); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("vary")).toMatch(/Cookie/); }
describe("T04 状态读取 HTTP 安全视图", () => {
  it("只返回严格的本人项目安全视图", async () => {
    const response = await handleProjectSyncStatus({ request: request(), projectId, appOrigin: origin, execute: async () => view });
    expect(response.status).toBe(200); safeHeaders(response); expect(await response.json()).toEqual({ sync: view });
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("%s 不执行读取依赖", async method => {
    const execute = vi.fn(async () => view);
    const response = await handleProjectSyncStatus({ request: request(method), projectId, appOrigin: origin, execute });
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("GET"); safeHeaders(response); expect(execute).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://foreign.invalid" }, { "sec-fetch-site": "cross-site" }, { origin, "sec-fetch-site": "same-site" }])("拒绝跨站来源 %j", async headers => {
    const execute = vi.fn(async () => view);
    const response = await handleProjectSyncStatus({ request: request("GET", headers), projectId, appOrigin: origin, execute });
    expect(response.status).toBe(403); safeHeaders(response); expect(execute).not.toHaveBeenCalled();
  });
  it.each(["?userId=foreign", "?status=completed"])("不接受客户端状态／所有者 %s", async query => {
    const execute = vi.fn(async () => view);
    const response = await handleProjectSyncStatus({ request: request("GET", undefined, query), projectId, appOrigin: origin, execute });
    expect(response.status).toBe(400); safeHeaders(response); expect(execute).not.toHaveBeenCalled();
  });
  it.each([["first_sync_unauthenticated", 401], ["first_sync_project_not_found", 404], ["private-storage-detail", 503]] as const)("%s 清除细节", async (code, expected) => {
    const response = await handleProjectSyncStatus({ request: request(), projectId, appOrigin: origin, execute: async () => { throw new Error(code); } });
    expect(response.status).toBe(expected); safeHeaders(response); expect(await response.text()).not.toContain("private-storage-detail");
  });
  it("拒绝错项目或额外私有字段", async () => {
    for (const value of [{ ...view, projectId: "22222222-2222-4222-8222-222222222222" }, { ...view, token: "private-value" }]) {
      const response = await handleProjectSyncStatus({ request: request(), projectId, appOrigin: origin, execute: async () => value });
      expect(response.status).toBeGreaterThanOrEqual(400); expect(await response.text()).not.toContain("private-value"); safeHeaders(response);
    }
  });
  it("保留会话核验过程中刷新的 Cookie", async () => {
    const responseHeaders = new Headers();
    const response = await handleProjectSyncStatus({ request: request(), projectId, appOrigin: origin, responseHeaders, execute: async () => { responseHeaders.append("set-cookie", "synthetic-session=refreshed; HttpOnly; SameSite=Lax"); return view; } });
    expect(response.headers.getSetCookie()).toEqual(["synthetic-session=refreshed; HttpOnly; SameSite=Lax"]); safeHeaders(response);
  });
});
