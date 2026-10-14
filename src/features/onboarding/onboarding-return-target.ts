import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { safeReturnTo } from "@/application/auth/safe-return-to";

export function resolveOnboardingReturnTarget(workspace: WorkspaceContext, value: string | undefined): { readonly path: string | null; readonly rejected: boolean } {
  const safe = safeReturnTo(value);
  if (value && safe !== value) return { path: null, rejected: true };
  const url = new URL(safe, "https://return-to.invalid");
  let pathname = url.pathname;
  for (let depth = 0; depth < 16; depth += 1) {
    const next = decodeURIComponent(pathname);
    if (next === pathname) break;
    pathname = next;
  }
  pathname = new URL(pathname, url.origin).pathname;
  if (pathname.replace(/\/+$/, "") === "/onboarding") return { path: null, rejected: false };
  if (workspace.status !== "authenticated" || workspace.projects.status !== "ready" || workspace.projects.data.length === 0) return { path: null, rejected: false };
  const projects = workspace.projects.data;
  const requestedIds: string[] = [];
  for (const key of ["project", "projectId", "fromProjectId"]) {
    const ids = url.searchParams.getAll(key);
    requestedIds.push(...ids);
    if (ids.length > 1 || ids.some(id => !projects.some(project => project.id === id))) return { path: null, rejected: true };
  }
  if (new Set(requestedIds).size > 1) return { path: null, rejected: true };
  if (url.searchParams.has("project") || url.searchParams.has("projectId") || url.searchParams.has("fromProjectId")) {
    if (url.searchParams.getAll("mode").length > 1) return { path: null, rejected: true };
    if (url.searchParams.get("mode") !== "connected") {
      url.searchParams.set("mode", "connected");
      return { path: url.pathname + url.search + url.hash, rejected: false };
    }
  } else if (pathname === "/project-galaxy") {
    if (workspace.projects.data.length !== 1) return { path: null, rejected: false };
    url.searchParams.set("mode", "connected");
    url.searchParams.set("project", workspace.projects.data[0].id);
    return { path: url.pathname + url.search + url.hash, rejected: false };
  }
  return { path: safe, rejected: false };
}
