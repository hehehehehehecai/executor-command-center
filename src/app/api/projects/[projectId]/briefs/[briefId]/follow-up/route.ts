import { handleProjectBriefFollowUpRequest } from "@/infrastructure/project-brief/project-brief-http";

import { createProjectBriefFollowUpRouteDependencies } from "./project-brief-follow-up-route-dependencies";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly projectId: string;
      readonly briefId: string;
    }>;
  },
) {
  const responseHeaders = new Headers();
  let dependencies: Awaited<ReturnType<typeof createProjectBriefFollowUpRouteDependencies>> | null = null;
  const getDependencies = async () => {
    dependencies ??= await createProjectBriefFollowUpRouteDependencies(responseHeaders);
    return dependencies;
  };
  const params = await context.params;
  return handleProjectBriefFollowUpRequest({
    request,
    appOrigin: process.env.APP_ORIGIN,
    projectId: params.projectId,
    briefId: params.briefId,
    responseHeaders,
    now: async () => (await getDependencies()).clock.now().toISOString(),
    getVerifiedUserId: async () =>
      (await getDependencies()).session.getVerifiedUserId(),
    execute: async (input) => (await getDependencies()).followUp.execute(input),
  });
}
