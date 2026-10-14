// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SupabaseProjectContextWriter } from "./supabase-project-context-writer";
const userId = "11111111-1111-4111-8111-111111111111", projectId = "22222222-2222-4222-8222-222222222222", selectedRepositoryId = "33333333-3333-4333-8333-333333333333";
const row = { id: projectId, user_id: userId, selected_repository_id: selectedRepositoryId, core_goal: null, current_stage_goal: null, status: null, current_blocker: null, created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z", repository_data_state: "connected", repository_data_version: 1, repository_removed_at: null };
function writer(value: unknown = row, status = 200) { const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(value, { status })); return { fetcher, storage: new SupabaseProjectContextWriter({ supabaseUrl: "http://127.0.0.1:56321", serviceRoleKey: "synthetic-service-key", fetcher }) }; }
describe("项目背景存储响应与绑定验证", () => {
  it("PATCH 仅发送实际字段，显式 null 不转换成缺失", async () => {
    const { storage, fetcher } = writer(); const view = await storage.patch({ userId, projectId, changes: { coreGoal: null } });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ p_actor_user_id: userId, p_project_id: projectId, p_changes: { coreGoal: null } });
    expect(view.context).toEqual({ coreGoal: null, currentStageGoal: null, status: null, currentBlocker: null });
    expect(view.syncPreparation).toEqual({ state: "ready", requested: false });
  });
  it.each([{ user_id: projectId }, { id: userId }, { status: "invented" }, { core_goal: " " }, { unexpected: true }, { repository_data_state: "removing" }, { repository_removed_at: "2026-09-28T00:00:00Z" }])("拒绝错主体或非法响应 %#", async changes => {
    await expect(writer({ ...row, ...changes }).storage.patch({ userId, projectId, changes: { coreGoal: null } })).rejects.toThrow("project_context_unavailable");
  });
  it("创建响应必须绑定原已选仓库", async () => {
    await expect(writer({ ...row, selected_repository_id: projectId }).storage.create({ userId, selectedRepositoryId })).rejects.toThrow("project_context_unavailable");
  });
  it("未知数据库错误隐藏原始 SQL、密钥与私有内容", async () => {
    await expect(writer({ message: "SQL private-data synthetic-secret" }, 500).storage.create({ userId, selectedRepositoryId })).rejects.toThrow(/^project_context_unavailable$/);
  });
  it("非 JSON 或网络错误不泄漏原始异常", async () => {
    const { storage, fetcher } = writer(); fetcher.mockResolvedValueOnce(new Response("SQL private-data"));
    await expect(storage.create({ userId, selectedRepositoryId })).rejects.toThrow(/^project_context_unavailable$/);
    fetcher.mockRejectedValueOnce(new Error("private-address"));
    await expect(storage.create({ userId, selectedRepositoryId })).rejects.toThrow(/^project_context_unavailable$/);
  });
});
