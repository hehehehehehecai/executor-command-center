import {
  parseStagingVerificationOperation,
} from "@/application/staging-verification/staging-verification";
import { handleStagingVerificationTicketIssue } from "@/infrastructure/staging-verification/staging-verification-http";

import { createStagingVerificationBoundary } from "../../staging-verification-route-dependencies";

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
    return handleStagingVerificationTicketIssue({
      request,
      responseHeaders,
      appOrigin: dependencies.environment.APP_ORIGIN,
      operation,
      expectedProjectId: dependencies.target.projectId,
      getVerifiedUserId: () => dependencies.session.getVerifiedUserId(),
      authorize: async ({ userId }) => {
        await dependencies.authorizer.assertTarget({
          userId,
          expected: dependencies.target,
        });
      },
      issue: (input) => dependencies.issue.execute(input),
    });
  } catch {
    return Response.json(
      { error: { code: "staging_verification_unavailable" } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
}
