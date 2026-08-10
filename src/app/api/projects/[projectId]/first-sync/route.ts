import { handleFirstSyncRequest } from "@/infrastructure/synchronization/first-sync-http";
import { createFirstSyncRouteDependencies } from "./first-sync-route-dependencies";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const responseHeaders = new Headers();
  let dependencies: Awaited<ReturnType<typeof createFirstSyncRouteDependencies>> | null = null;
  const getDependencies = async () => {
    dependencies ??= await createFirstSyncRouteDependencies(responseHeaders);
    return dependencies;
  };
  return handleFirstSyncRequest({
    request,
    appOrigin: process.env.APP_ORIGIN,
    projectId: (await context.params).projectId,
    responseHeaders,
    execute: async (input) => (await getDependencies()).entry.execute(input),
    onFailure: (failure) => console.warn(JSON.stringify({
      contract_version: failure.contractVersion,
      failure_id: failure.failureId,
      phase: failure.phase,
      failure_code: failure.failureCode,
      status: failure.status,
    })),
  });
}
