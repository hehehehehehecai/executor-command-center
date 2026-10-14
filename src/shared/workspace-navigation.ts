import type { FeatureId } from "@/shared/features/feature-definition";
import { featureRegistry } from "@/shared/features/feature-registry";
import type { PanelMode } from "@/shared/panel-query";

export type WorkspaceDestination = FeatureId | "home";
export type WorkspaceSearchParams = Readonly<Record<string, string | string[] | undefined>>;
export const workspaceProjectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const workspaceQueryKeys: Readonly<Record<WorkspaceDestination, readonly string[]>> = {
  home: ["mode", "project", "projectId", "signedOut"],
  "project-galaxy": ["mode", "project", "projectId"],
  "flight-log": ["mode", "project", "projectId", "apply", "range", "type"],
  "mission-control": ["mode", "project", "projectId", "action", "suggestionId", "nextStatus"],
  "decision-archive": ["mode", "project", "projectId", "action", "alternatives", "candidateId", "decision", "reason", "revisitCondition"],
  copilot: ["mode", "project", "projectId", "action", "evidenceReferenceIds", "featureId", "fromEvidence", "fromFeatureId", "fromProjectId", "selectedEvidence", "briefId"],
};
const repeatedKeys = new Set(["type", "fromEvidence", "evidenceReferenceIds"]);

export function validateWorkspaceQuery(target: WorkspaceDestination, query: WorkspaceSearchParams): boolean {
  return Object.entries(query).every(([key, value]) => value === undefined || (
    workspaceQueryKeys[target].includes(key) &&
    (typeof value === "string" || (repeatedKeys.has(key) && value.every(item => typeof item === "string")))
  ));
}

export function workspaceHref(target: WorkspaceDestination, input: {
  readonly projectId?: string | null;
  readonly mode?: PanelMode;
  readonly query?: WorkspaceSearchParams;
} = {}): string {
  const route = target === "home" ? "/" : featureRegistry.find(feature => feature.id === target)?.route;
  if (!route) throw new Error("workspace_destination_invalid");
  if (input.projectId && !workspaceProjectIdPattern.test(input.projectId)) throw new Error("workspace_project_invalid");
  const query = input.query ?? {};
  if (!validateWorkspaceQuery(target, query)) throw new Error("workspace_query_invalid");
  const params = new URLSearchParams();
  if (input.mode) params.set("mode", input.mode);
  if (input.projectId) params.set(target === "copilot" ? "projectId" : "project", input.projectId);
  for (const [key, value] of Object.entries(query)) {
    if (["mode", "project", "projectId"].includes(key) || value === undefined) continue;
    for (const item of typeof value === "string" ? [value] : value) params.append(key, item);
  }
  return route + (params.size ? `?${params.toString()}` : "");
}

export function workspaceProjectParameter(target: WorkspaceDestination, query: WorkspaceSearchParams): string | null | "invalid" {
  const first = query.project;
  const alias = query.projectId;
  if ((first !== undefined && typeof first !== "string") || (alias !== undefined && typeof alias !== "string")) return "invalid";
  if (first !== undefined && alias !== undefined && first !== alias) return "invalid";
  let value = first ?? alias;
  if (target === "copilot" && query.action === "evidence") {
    if (typeof query.fromProjectId !== "string" || (value !== undefined && value !== query.fromProjectId)) return "invalid";
    value = query.fromProjectId;
  }
  if (value === undefined) return null;
  return workspaceProjectIdPattern.test(value) ? value : "invalid";
}

export function workspaceProjectLabel(project: { readonly id: string; readonly name: string }, projects: readonly { readonly id: string; readonly name: string }[]): string {
  const duplicates = projects.filter(item => item.name === project.name);
  return duplicates.length > 1 ? `${project.name}（项目 ${duplicates.findIndex(item => item.id === project.id) + 1}）` : project.name;
}
