import { handleProjectContextWrite } from "@/infrastructure/project-calibration/project-context-http";
import { createProjectContextUseCases } from "../project-context-route-dependencies";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const responseHeaders = new Headers();
  return handleProjectContextWrite({ request, operation: "create", flag: process.env.PROJECT_CONTEXT_WRITES_ENABLED, appOrigin: process.env.APP_ORIGIN, responseHeaders, execute: async command => (await createProjectContextUseCases(responseHeaders)).create(command) });
}
export { handle as POST, handle as GET, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
