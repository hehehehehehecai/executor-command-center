import { handleManualResyncRequest } from "@/infrastructure/synchronization/reconciliation-http";
import { createManualResyncDependencies } from "./resync-route-dependencies";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const responseHeaders = new Headers();
  let dependencies: Awaited<ReturnType<typeof createManualResyncDependencies>> | null = null;
  const getDependencies = async () => {
    dependencies ??= await createManualResyncDependencies(responseHeaders);
    return dependencies;
  };
  return handleManualResyncRequest({
    request,
    appOrigin: process.env.APP_ORIGIN,
    responseHeaders,
    projectId: (await context.params).projectId,
    requestedAt: async () => (await getDependencies()).clock.now().toISOString(),
    execute: async (input) => (await getDependencies()).manual.execute(input),
  });
}
