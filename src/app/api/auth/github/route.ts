import { cookies } from "next/headers";

import { StartGitHubSignIn } from "@/application/auth/start-github-sign-in";
import { createAuthFailureLog } from "@/application/auth/auth-log-redaction";
import { handleGitHubOAuthStart } from "@/infrastructure/auth/github-auth-http";
import { SupabaseGitHubSignInGateway } from "@/infrastructure/auth/supabase-github-sign-in-gateway";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import { writeSafeSecurityWarning } from "@/shared/security/safe-log-redaction";

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
    const useCase = new StartGitHubSignIn(
      new SupabaseGitHubSignInGateway(client),
    );
    const response = await handleGitHubOAuthStart({
      request,
      trustedOrigin: environment.APP_ORIGIN,
      execute: (input) => useCase.execute(input),
      onFailure: (failureCode) =>
        writeSafeSecurityWarning(
          createAuthFailureLog({
            failureId: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            failureCode: failureCode as "oauth_start_failed",
            oauthStage: "oauth_start",
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
