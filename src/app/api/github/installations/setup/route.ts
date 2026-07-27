import { cookies } from "next/headers";

import { CompleteGitHubInstallationRegistration } from "@/application/github-installation/register-github-installation";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { GitHubAppInstallationReaderAdapter } from "@/infrastructure/github/github-app-installation-reader";
import { GitHubAppJwtSigner } from "@/infrastructure/github/github-app-jwt";
import {
  createGitHubInstallationFailureRecord,
  handleGitHubInstallationSetup,
} from "@/infrastructure/github/github-installation-http";
import { SupabaseGitHubInstallationRepository } from "@/infrastructure/github/supabase-github-installation-repository";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function copyHeaders(source: Headers, target: Headers) {
  source.forEach((value, name) => target.set(name, value));
}

const stateFailureCodes = new Set([
  "installation_state_missing",
  "installation_state_invalid",
  "installation_state_expired",
  "installation_state_replayed",
  "installation_state_wrong_user",
]);

const githubApiCalledCodes = new Set([
  "github_installation_not_found",
  "github_api_forbidden",
  "github_api_rate_limited",
  "github_api_timeout",
  "github_api_invalid_response",
  "github_api_unavailable",
  "installation_app_mismatch",
  "installation_id_mismatch",
  "unsupported_installation_account_type",
  "current_github_identity_missing",
  "installation_account_mismatch",
  "github_installation_already_bound",
  "installation_persistence_failed",
]);

function logFailure(input: {
  code: string;
  installationIdPresent: boolean;
  sessionValid?: boolean | null;
  stateValid?: boolean | null;
}) {
  const code = input.code;
  const accountType =
    code === "current_github_identity_missing" ||
    code === "installation_account_mismatch" ||
    code === "github_installation_already_bound" ||
    code === "installation_persistence_failed"
      ? "User"
      : null;
  const ownershipMatch =
    code === "installation_account_mismatch"
      ? false
      : (
          code === "github_installation_already_bound" ||
          code === "installation_persistence_failed"
        )
        ? true
        : null;
  const githubApiCalled =
    code === "github_app_authentication_failed" ||
    code === "github_installation_registration_failed"
      ? null
      : githubApiCalledCodes.has(code);
  const installationPersisted =
    code === "installation_persistence_failed" ||
    code === "github_installation_registration_failed"
      ? null
      : false;

  console.warn(
    JSON.stringify(
      createGitHubInstallationFailureRecord({
        failureId: crypto.randomUUID(),
        stage: "installation_setup",
        requestId: crypto.randomUUID(),
        failureCode: code,
        installationIdPresent: input.installationIdPresent,
        stateValid:
          input.stateValid === undefined
            ? code === "unauthenticated"
              ? null
              : !stateFailureCodes.has(code)
            : input.stateValid,
        sessionValid:
          input.sessionValid === undefined
            ? code === "unauthenticated"
              ? false
              : true
            : input.sessionValid,
        githubApiCalled,
        accountType,
        ownershipMatch,
        installationPersisted,
      }),
    ),
  );
}

export async function GET(request: Request) {
  let sessionValid: boolean | null = null;
  let installationIdPresent = false;

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
    const requestUrl = new URL(request.url);
    installationIdPresent = requestUrl.searchParams.has("installation_id");

    if (!userId) {
      logFailure({ code: "unauthenticated", installationIdPresent });
      const response = new Response(null, {
        status: 303,
        headers: {
          "cache-control": "no-store",
          location: "/onboarding?installation=configuration_failed",
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
    const appId = environment.GITHUB_APP_ID;
    const privateKey = environment.GITHUB_APP_PRIVATE_KEY;
    const restApiVersion = environment.GITHUB_REST_API_VERSION;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !trustedOrigin ||
      !appId ||
      !privateKey ||
      !restApiVersion
    ) {
      throw new Error("github_app_configuration_missing");
    }

    const repository = new SupabaseGitHubInstallationRepository({
      supabaseUrl,
      serviceRoleKey,
    });
    const jwtSigner = new GitHubAppJwtSigner({
      appId,
      privateKeyProvider: () => privateKey,
      clock: { now: () => new Date() },
    });
    const installationReader =
      new GitHubAppInstallationReaderAdapter({
        jwtSigner,
        restApiVersion,
      });
    const useCase = new CompleteGitHubInstallationRegistration({
      stateRepository: repository,
      installationReader,
      identityReader: repository,
      installationRepository: repository,
      configuredAppId: appId,
      clock: { now: () => new Date() },
    });
    const response = await handleGitHubInstallationSetup({
      request,
      trustedOrigin,
      execute: (input) => useCase.execute({ ...input, userId }),
      onFailure: (code) =>
        logFailure({ code, installationIdPresent }),
    });
    copyHeaders(responseHeaders, response.headers);
    return response;
  } catch (error) {
    const code =
      error instanceof Error &&
      error.message === "github_app_configuration_missing"
        ? error.message
        : "github_installation_registration_failed";
    logFailure({
      code,
      installationIdPresent,
      sessionValid,
      stateValid: null,
    });
    return new Response("GitHub App installation is not configured.", {
      status: 503,
    });
  }
}
