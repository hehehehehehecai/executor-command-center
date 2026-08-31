import {
  parseStagingVerificationOperation,
} from "@/application/staging-verification/staging-verification";
import { handleStagingVerificationExecution } from "@/infrastructure/staging-verification/staging-verification-http";

import {
  createStagingVerificationBoundary,
  createStagingVerificationRuntime,
} from "../staging-verification-route-dependencies";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly operation: string }> },
) {
  let operation;
  try {
    operation = parseStagingVerificationOperation((await context.params).operation);
  } catch {
    return Response.json(
      { error: { code: "staging_verification_unavailable" } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  const responseHeaders = new Headers();
  try {
    const dependencies = await createStagingVerificationBoundary(responseHeaders);
    let authorizedTarget: Awaited<ReturnType<typeof dependencies.authorizer.assertTarget>> | null = null;
    return handleStagingVerificationExecution({
      request,
      responseHeaders,
      appOrigin: dependencies.environment.APP_ORIGIN,
      operation,
      getVerifiedUserId: () => dependencies.session.getVerifiedUserId(),
      authorize: async ({ userId, projectId }) => {
        authorizedTarget = await dependencies.authorizer.assertTarget({
          userId,
          expected: { ...dependencies.target, projectId },
        });
      },
      consume: (input) => dependencies.consume.execute(input),
      execute: async (input) => {
        if (!authorizedTarget) throw new Error("staging_verification_forbidden");
        const runtime = await createStagingVerificationRuntime({
          userId: input.userId,
          responseHeaders,
          target: authorizedTarget,
        });
        return runtime.execute(input);
      },
    });
  } catch {
    return Response.json(
      { error: { code: "staging_verification_unavailable" } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
}
