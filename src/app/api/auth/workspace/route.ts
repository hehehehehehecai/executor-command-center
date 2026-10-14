import { readWorkspaceContext } from "@/infrastructure/workspace/workspace-server-context";
import { workspaceHeaders } from "@/infrastructure/workspace/workspace-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const workspace = await readWorkspaceContext();
  const project = new URL(request.url).searchParams.get("project");
  if (project && (workspace.status !== "authenticated" || workspace.projects.status !== "ready" || !workspace.projects.data.some((value) => value.id === project))) {
    return Response.json({ error: { code: "project_not_found" } }, { status: 404, headers: workspaceHeaders() });
  }
  return Response.json({ workspace }, { status: workspace.status === "unavailable" ? 503 : 200, headers: workspaceHeaders() });
}
