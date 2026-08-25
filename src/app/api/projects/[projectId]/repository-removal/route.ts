import { handleRepositoryRemoval } from "@/infrastructure/repository-removal/repository-removal-http";

import { createRepositoryRemovalUseCase } from "./repository-removal-route-dependencies";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly projectId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const responseHeaders = new Headers();
  const requestId = crypto.randomUUID();
  let useCase: Awaited<ReturnType<typeof createRepositoryRemovalUseCase>> | null =
    null;
  const getUseCase = async () => {
    useCase ??= await createRepositoryRemovalUseCase(responseHeaders);
    return useCase;
  };

  return handleRepositoryRemoval({
    request,
    routeProjectId: (await context.params).projectId,
    appOrigin: process.env.APP_ORIGIN,
    responseHeaders,
    execute: async (command) => (await getUseCase()).execute(command),
    onFailure: (code, httpStatus) => {
      console.warn(JSON.stringify({
        contract_version: "repository-removal-failure.v1",
        request_id: requestId,
        phase: "repository_removal_http",
        failure_code: code,
        http_status: httpStatus,
        sensitive_content_logged: false,
      }));
    },
  });
}
