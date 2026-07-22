import { cookies } from "next/headers";

import { createAuthFailureLog } from "@/application/auth/auth-log-redaction";
import { CompleteGitHubSignIn } from "@/application/auth/complete-github-sign-in";
import { createServiceRoleUserRepository } from "@/infrastructure/auth/service-role-user-repository";
import { handleGitHubOAuthCallback } from "@/infrastructure/auth/github-auth-http";
import { SupabaseGitHubSignInGateway } from "@/infrastructure/auth/supabase-github-sign-in-gateway";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export async function GET(request: Request) {
  try {
    const environment = parseServerEnvironment(process.env);
    if (!environment.APP_ORIGIN) throw new Error("auth_configuration_missing");

    const responseHeaders = new Headers();
    const client = createSupabaseServerClient({
      environment,
      cookieStore: await cookies(),
      responseHeaders,
    });
    const useCase = new CompleteGitHubSignIn(
      new SupabaseGitHubSignInGateway(client),
      createServiceRoleUserRepository(process.env),
    );
    const response = await handleGitHubOAuthCallback({
      request,
      trustedOrigin: environment.APP_ORIGIN,
      execute: (input) => useCase.execute(input),
      onFailure: (failureCode) =>
        console.warn(
          createAuthFailureLog({
            failureId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            failureCode: failureCode as Parameters<
              typeof createAuthFailureLog
            >[0]["failureCode"],
            oauthStage: "callback",
            sessionCreated: false,
            identityPersisted: false,
            redirectTarget: "/auth/error",
          }),
        ),
    });
    responseHeaders.forEach((value, name) => response.headers.set(name, value));
    return response;
  } catch {
    return new Response("Authentication is not configured.", { status: 503 });
  }
}
