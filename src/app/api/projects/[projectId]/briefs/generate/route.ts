import { handleProjectBriefGenerationRequest } from "@/infrastructure/project-brief/project-brief-http";

import { createProjectBriefGenerationRouteDependencies } from "./project-brief-generation-route-dependencies";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly projectId: string }> },
) {
  const responseHeaders = new Headers();
  let dependencies: Awaited<ReturnType<typeof createProjectBriefGenerationRouteDependencies>> | null = null;
  const getDependencies = async () => {
    dependencies ??= await createProjectBriefGenerationRouteDependencies(responseHeaders);
    return dependencies;
  };
  const projectId = (await context.params).projectId;
  return handleProjectBriefGenerationRequest({
    request,
    appOrigin: process.env.APP_ORIGIN,
    projectId,
    responseHeaders,
    now: async () => (await getDependencies()).clock.now().toISOString(),
    getVerifiedUserId: async () =>
      (await getDependencies()).session.getVerifiedUserId(),
    execute: async (input) =>
      (await (await getDependencies()).createUseCase(input.userId)).execute(input),
  });
}
