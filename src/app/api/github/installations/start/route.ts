import { cookies } from "next/headers";

import { StartGitHubInstallation } from "@/application/github-installation/start-github-installation";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import {
  createGitHubInstallationFailureRecord,
  handleGitHubInstallationStart,
} from "@/infrastructure/github/github-installation-http";
import { SupabaseGitHubInstallationRepository } from "@/infrastructure/github/supabase-github-installation-repository";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function copyHeaders(source: Headers, target: Headers) {
  source.forEach((value, name) => target.set(name, value));
}

function logFailure(code: string, sessionValid?: boolean | null) {
  console.warn(
    JSON.stringify(
      createGitHubInstallationFailureRecord({
        failureId: crypto.randomUUID(),
        stage: "installation_start",
        requestId: crypto.randomUUID(),
        failureCode: code,
        installationIdPresent: false,
        stateValid: false,
        sessionValid:
          sessionValid === undefined
            ? code === "unauthenticated"
              ? false
              : true
            : sessionValid,
        githubApiCalled: false,
        accountType: null,
        ownershipMatch: null,
        installationPersisted: false,
      }),
    ),
  );
}

export async function GET(request: Request) {
  let sessionValid: boolean | null = null;

  try {
    const responseHeaders = new Headers();
    const sessionClient = createSupabaseServerClient({
      environment: {
        APP_ORIGIN: process.env.APP_ORIGIN,
        NEXT_PUBLIC_SUPABASE_URL:
          process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      cookieStore: await cookies(),
      responseHeaders,
    });
    const sessionReader = new SupabaseVerifiedSessionReader(sessionClient);
    const userId = await sessionReader.getVerifiedUserId();
    sessionValid = Boolean(userId);

    if (!userId) {
      logFailure("unauthenticated");
      const response = new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: "/auth/error",
        },
      });
      copyHeaders(responseHeaders, response.headers);
      return response;
    }

    let environment;

    try {
      environment = parseServerEnvironment(process.env);
    } catch {
      throw new Error("github_app_configuration_missing");
    }
    const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
    const trustedOrigin = environment.APP_ORIGIN;
    const appSlug = environment.GITHUB_APP_SLUG;

    if (!supabaseUrl || !serviceRoleKey || !trustedOrigin || !appSlug) {
      throw new Error("github_app_configuration_missing");
    }

    const repository = new SupabaseGitHubInstallationRepository({
      supabaseUrl,
      serviceRoleKey,
    });
    const useCase = new StartGitHubInstallation({
      sessionReader: { getVerifiedUserId: async () => userId },
      stateRepository: repository,
      configuredAppSlug: appSlug,
    });
    const response = await handleGitHubInstallationStart({
      request,
      trustedOrigin,
      execute: (input) => useCase.execute(input),
      onFailure: logFailure,
    });
    copyHeaders(responseHeaders, response.headers);
    return response;
  } catch (error) {
    const code =
      error instanceof Error &&
      error.message === "github_app_configuration_missing"
        ? error.message
        : "github_installation_registration_failed";
    logFailure(code, sessionValid);
    return new Response("GitHub App installation is not configured.", {
      status: 503,
    });
  }
}
