import { projectSyncStatusSchema, type ProjectSyncStatusView } from "@/domain/synchronization/project-onboarding-sync";
import { workspaceHeaders } from "@/infrastructure/workspace/workspace-http";

export async function handleProjectSyncStatus(input: { request: Request; projectId: string; appOrigin?: string; responseHeaders?: Headers; execute: (projectId: string) => Promise<ProjectSyncStatusView> }) {
  const fail = (code: string, status: number) => { const headers = workspaceHeaders(input.responseHeaders); if (status === 405) headers.set("allow", "GET"); return Response.json({ error: { code } }, { status, headers }); };
  if (input.request.method !== "GET") return fail("project_sync_status_method_not_allowed", 405);
  const origin = input.request.headers.get("origin");
  if ((origin !== null && origin !== input.appOrigin) || ![null, "same-origin", "none"].includes(input.request.headers.get("sec-fetch-site"))) return fail("project_sync_status_origin_forbidden", 403);
  if (new URL(input.request.url).search || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.projectId)) return fail("first_sync_invalid_request", 400);
  try {
    const sync = projectSyncStatusSchema.parse(await input.execute(input.projectId));
    if (sync.projectId !== input.projectId) throw new Error("first_sync_project_not_found");
    return Response.json({ sync }, { headers: workspaceHeaders(input.responseHeaders) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "first_sync_unauthenticated") return fail(code, 401);
    if (code === "first_sync_project_not_found") return fail(code, 404);
    return fail("project_sync_status_unavailable", 503);
  }
}
