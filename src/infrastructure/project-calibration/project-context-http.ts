import { parseProjectCreation, parseProjectContextPatch, parseProjectContextId, type ProjectContextView } from "@/domain/project-calibration/project-context";
import { workspaceHeaders } from "@/infrastructure/workspace/workspace-http";

const statuses: Readonly<Record<string, number>> = {
  project_context_disabled: 404, project_context_method_not_allowed: 405,
  project_context_origin_forbidden: 403, project_context_unauthenticated: 401,
  project_context_invalid_request: 400, project_context_not_found: 404,
  project_context_authorization_unavailable: 403, project_context_account_unavailable: 409,
  project_context_repository_unavailable: 409, project_context_archived: 409,
  project_context_conflict: 409, project_context_unavailable: 503,
};
export async function handleProjectContextWrite(input: { request: Request; operation: "create" | "patch"; projectId?: unknown; flag: unknown; appOrigin?: string; execute: (command: unknown) => Promise<ProjectContextView>; responseHeaders?: Headers }): Promise<Response> {
  const method = input.operation === "create" ? "POST" : "PATCH";
  try {
    if (input.request.method !== method) throw new Error("project_context_method_not_allowed");
    if (input.flag !== "1") throw new Error("project_context_disabled");
    let origin: URL;
    try { origin = new URL(input.appOrigin ?? ""); } catch { throw new Error("project_context_unavailable"); }
    if (!["https:", "http:"].includes(origin.protocol) || origin.origin !== input.appOrigin) throw new Error("project_context_unavailable");
    if (input.request.headers.get("origin") !== input.appOrigin || ![null, "same-origin"].includes(input.request.headers.get("sec-fetch-site"))) throw new Error("project_context_origin_forbidden");
    if (new URL(input.request.url).search || input.request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("project_context_invalid_request");
    let body: unknown;
    try { body = await input.request.json(); } catch { throw new Error("project_context_invalid_request"); }
    if (input.operation === "patch") parseProjectContextId(input.projectId);
    const command = input.operation === "create" ? parseProjectCreation(body) : parseProjectContextPatch(body);
    return Response.json({ project: await input.execute(command) }, { headers: workspaceHeaders(input.responseHeaders) });
  } catch (error) {
    const candidate = error instanceof Error ? error.message : "";
    const code = Object.hasOwn(statuses, candidate) ? candidate : "project_context_unavailable";
    const headers = workspaceHeaders(input.responseHeaders);
    if (statuses[code] === 405) headers.set("allow", method);
    return Response.json({ error: { code, message: "项目背景操作暂时无法完成。" } }, { status: statuses[code], headers });
  }
}
