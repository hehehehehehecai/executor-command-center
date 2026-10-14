import { handleProjectContextWrite } from "@/infrastructure/project-calibration/project-context-http";
import { createProjectContextUseCases } from "../../project-context-route-dependencies";
export const dynamic = "force-dynamic";
async function handle(request: Request, route: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await route.params;
  const responseHeaders = new Headers();
  return handleProjectContextWrite({ request, operation: "patch", projectId, flag: process.env.PROJECT_CONTEXT_WRITES_ENABLED, appOrigin: process.env.APP_ORIGIN, responseHeaders, execute: async command => (await createProjectContextUseCases(responseHeaders)).patch(projectId, command) });
}
export { handle as PATCH, handle as GET, handle as PUT, handle as POST, handle as DELETE, handle as HEAD, handle as OPTIONS };
