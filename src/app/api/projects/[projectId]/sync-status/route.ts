import { handleProjectSyncStatus } from "@/infrastructure/synchronization/project-sync-status-http";
import { createProjectSyncStatusReader } from "./sync-status-route-dependencies";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const responseHeaders = new Headers();
  return handleProjectSyncStatus({ request, projectId: (await context.params).projectId, appOrigin: process.env.APP_ORIGIN, responseHeaders, execute: async projectId => (await createProjectSyncStatusReader(responseHeaders)).execute(projectId) });
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
