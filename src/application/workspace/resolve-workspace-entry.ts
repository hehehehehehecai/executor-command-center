import type { WorkspaceContext, WorkspaceProject } from "./load-workspace-context";
import { safeReturnTo } from "@/application/auth/safe-return-to";
import { validateWorkspaceQuery, workspaceHref, workspaceProjectParameter, workspaceProjectIdPattern, type WorkspaceDestination, type WorkspaceSearchParams } from "@/shared/workspace-navigation";

type EntryBase = { readonly target: WorkspaceDestination; readonly query: WorkspaceSearchParams; readonly returnTo: string };
export type WorkspaceEntry = EntryBase & (
  | { readonly kind: "preview" }
  | { readonly kind: "ready"; readonly project: WorkspaceProject; readonly projects: readonly WorkspaceProject[] }
  | { readonly kind: "choose"; readonly projects: readonly WorkspaceProject[] }
  | { readonly kind: "sign_in" | "onboarding" }
  | { readonly kind: "invalid" | "not_found" | "unavailable" | "revoked"; readonly reason: string }
);

export function resolveWorkspaceEntry(input: {
  readonly target: WorkspaceDestination;
  readonly searchParams: WorkspaceSearchParams;
  readonly workspace: WorkspaceContext;
  readonly previewAllowed: boolean;
}): WorkspaceEntry {
  const { target, searchParams: query, workspace } = input;
  const fallback = { target, query: {}, returnTo: workspaceHref(target) };
  if (!validateWorkspaceQuery(target, query)) return { ...fallback, kind: "invalid", reason: "入口参数无效，请重新选择项目。" };
  if (query.mode !== undefined && query.mode !== "connected" && query.mode !== "preview") return { ...fallback, kind: "invalid", reason: "面板模式无效。" };
  if (query.project !== undefined && query.projectId !== undefined && query.project !== query.projectId) return { ...fallback, kind: "invalid", reason: "项目参数冲突，请重新选择项目。" };
  if (query.mode === "preview") {
    if (!input.previewAllowed) return { ...fallback, kind: "invalid", reason: "正式入口不提供演示工作区，请使用当前账号所属项目。" };
    return { target, query, returnTo: safeReturnTo(workspaceHref(target, { mode: "preview", query })), kind: "preview" };
  }
  const requested = workspaceProjectParameter(target, query);
  if (requested === "invalid") return { ...fallback, kind: "invalid", reason: "项目参数无效，请重新选择项目。" };
  if (query.fromProjectId !== undefined && (typeof query.fromProjectId !== "string" || !workspaceProjectIdPattern.test(query.fromProjectId))) return { ...fallback, kind: "invalid", reason: "项目参数无效，请重新选择项目。" };
  const base = { target, query, returnTo: safeReturnTo(workspaceHref(target, { projectId: requested, mode: query.mode === "connected" ? "connected" : undefined, query })) };
  if (workspace.status === "signed_out") return { ...base, kind: "sign_in" };
  if (workspace.status === "unavailable") return { ...base, kind: "unavailable", reason: "暂时无法确认当前账号，请重试读取。" };
  if (workspace.identity.status === "failed") return { ...base, kind: "unavailable", reason: "暂时无法读取当前账号资料，请重试读取。" };
  if (workspace.installation.status === "failed") return { ...base, kind: "unavailable", reason: "暂时无法读取 GitHub App 状态，请重试读取。" };
  if (workspace.installation.data !== null && workspace.installation.data.status !== "active") return { ...base, kind: "revoked", reason: "GitHub App 授权已暂停或撤销，请到接入页检查授权。" };
  if (workspace.projects.status !== "ready") return { ...base, kind: "unavailable", reason: "暂时无法读取当前账号所属项目，请重试读取。" };
  const projects = workspace.projects.data;
  if (projects.length === 0) return { ...base, kind: "onboarding" };
  if (query.fromProjectId && !projects.some(project => project.id === query.fromProjectId)) return { ...base, kind: "not_found", reason: "没有可显示的项目" };
  if (!requested && projects.length > 1) return { ...base, kind: "choose", projects };
  const project = requested ? projects.find(project => project.id === requested) : projects[0];
  if (!project) return { ...base, kind: "not_found", reason: "没有可显示的项目" };
  return { ...base, kind: "ready", project, projects };
}
