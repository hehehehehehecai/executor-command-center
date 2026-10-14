import "server-only";
import { z } from "zod";
import type { ProjectContextWriter } from "@/application/project-calibration/project-context-use-cases";
import { contextCompleteness, projectContextContract, type ProjectContextView } from "@/domain/project-calibration/project-context";
import { projectStatuses } from "@/domain/project-calibration/project-calibration";
const text = z.string().min(1).max(2000).refine(value => value.trim() === value).nullable();
const rowSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), selected_repository_id: z.string().uuid(),
  core_goal: text, current_stage_goal: text, status: z.enum(projectStatuses).nullable(), current_blocker: text,
  created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }),
  repository_data_state: z.literal("connected"), repository_data_version: z.number().int().positive(), repository_removed_at: z.null(),
}).strict();
const publicErrors = new Set(["project_context_invalid_request", "project_context_not_found", "project_context_authorization_unavailable", "project_context_account_unavailable", "project_context_repository_unavailable", "project_context_archived", "project_context_conflict"]);
export class SupabaseProjectContextWriter implements ProjectContextWriter {
  constructor(private readonly options: { supabaseUrl: string; serviceRoleKey: string; fetcher?: typeof fetch }) {}
  private async invoke(name: string, body: Record<string, unknown>, expected: { userId: string; projectId?: string; selectedRepositoryId?: string }): Promise<ProjectContextView> {
    let response: Response, payload: unknown;
    try {
      response = await (this.options.fetcher ?? fetch)(`${this.options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST", cache: "no-store", headers: { apikey: this.options.serviceRoleKey, authorization: `Bearer ${this.options.serviceRoleKey}`, "content-type": "application/json" }, body: JSON.stringify(body),
      });
      payload = await response.json();
    } catch { throw new Error("project_context_unavailable"); }
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "message" in payload ? payload.message : null;
      throw new Error(typeof message === "string" && publicErrors.has(message) ? message : "project_context_unavailable");
    }
    const parsed = rowSchema.safeParse(payload);
    if (!parsed.success || parsed.data.user_id !== expected.userId || (expected.projectId && parsed.data.id !== expected.projectId) || (expected.selectedRepositoryId && parsed.data.selected_repository_id !== expected.selectedRepositoryId)) throw new Error("project_context_unavailable");
    const row = parsed.data;
    const context = { coreGoal: row.core_goal, currentStageGoal: row.current_stage_goal, status: row.status, currentBlocker: row.current_blocker };
    return { contractVersion: projectContextContract, id: row.id, selectedRepositoryId: row.selected_repository_id, context, completeness: contextCompleteness(context), syncPreparation: { state: row.status === "archived" ? "blocked" : "ready", requested: false } };
  }
  create(input: Parameters<ProjectContextWriter["create"]>[0]) {
    return this.invoke("create_project_from_repository", { p_actor_user_id: input.userId, p_selected_repository_id: input.selectedRepositoryId }, input);
  }
  patch(input: Parameters<ProjectContextWriter["patch"]>[0]) {
    return this.invoke("patch_project_context", { p_actor_user_id: input.userId, p_project_id: input.projectId, p_changes: input.changes }, input);
  }
}
