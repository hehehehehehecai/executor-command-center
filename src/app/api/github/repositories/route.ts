import { cookies } from "next/headers";

import { ListAuthorizedGitHubRepositories } from "@/application/github-repository/list-authorized-github-repositories";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { GitHubAppJwtSigner } from "@/infrastructure/github/github-app-jwt";
import { GitHubAuthorizedRepositoryGatewayAdapter } from "@/infrastructure/github/github-authorized-repository-gateway";
import { GitHubAuthorizedRepositoryReader } from "@/infrastructure/github/github-authorized-repository-reader";
import { GitHubInstallationTokenClient } from "@/infrastructure/github/github-installation-token-client";
import {
  createGitHubRepositoryFailureRecord,
  githubRepositoryFailureDefinitions,
  handleGitHubRepositoryList,
} from "@/infrastructure/github/github-repository-http";
import { SupabaseCurrentGitHubInstallationQuery } from "@/infrastructure/github/supabase-current-github-installation-query";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import { writeSafeSecurityWarning } from "@/shared/security/safe-log-redaction";

export const dynamic = "force-dynamic";

function copyHeaders(source: Headers, target: Headers) {
  source.forEach((value, name) => target.set(name, value));
}

function repositoryEnvironment() {
  try {
    const environment = parseServerEnvironment(process.env);

    if (
      !environment.NEXT_PUBLIC_SUPABASE_URL ||
      !environment.SUPABASE_SERVICE_ROLE_KEY ||
      !environment.GITHUB_APP_ID ||
      !environment.GITHUB_APP_PRIVATE_KEY ||
      !environment.GITHUB_REST_API_VERSION
    ) {
      throw new Error("missing");
    }

    return {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
      appId: environment.GITHUB_APP_ID,
      privateKey: environment.GITHUB_APP_PRIVATE_KEY,
      restApiVersion: environment.GITHUB_REST_API_VERSION,
    };
  } catch {
    throw new Error("github_app_configuration_missing");
  }
}

function logFailure(code: string, httpStatus: number) {
  const definition = githubRepositoryFailureDefinitions[code];
  const tokenCreated = definition?.tokenCreated ?? false;
  const revocationAttempted =
    definition?.revocationAttempted ?? false;

  writeSafeSecurityWarning(
      createGitHubRepositoryFailureRecord({
        failureId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        stage: definition?.stage ?? "http",
        failureCode: code,
        sessionValid: code === "unauthenticated" ? false : true,
        installationFound:
          code === "unauthenticated" ||
          code === "github_installation_not_registered"
            ? false
            : null,
        installationStatus:
          code === "github_installation_suspended"
            ? "suspended"
            : code === "github_installation_revoked"
              ? "revoked"
              : null,
        tokenCreated,
        tokenUsed: code.startsWith("github_repository"),
        revocationAttempted,
        tokenRevoked: revocationAttempted ? null : false,
        pageNumber: null,
        expectedTotalCount: null,
        observedTotalCount: null,
        repositoriesCollected: 0,
        httpStatus,
      }),
  );
}

export async function GET(request: Request) {
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
  const installationQuery = {
    findByUserId(userId: string) {
      const environment = repositoryEnvironment();
      return new SupabaseCurrentGitHubInstallationQuery({
        supabaseUrl: environment.supabaseUrl,
        serviceRoleKey: environment.serviceRoleKey,
      }).findByUserId(userId);
    },
  };
  const repositoryGateway = {
    listAllForInstallation(installationId: number) {
      const environment = repositoryEnvironment();
      const jwtSigner = new GitHubAppJwtSigner({
        appId: environment.appId,
        privateKeyProvider: () => environment.privateKey,
        clock: { now: () => new Date() },
      });
      const tokenClient = new GitHubInstallationTokenClient({
        jwtSigner,
        restApiVersion: environment.restApiVersion,
        clock: { now: () => new Date() },
      });
      const reader = new GitHubAuthorizedRepositoryReader({
        restApiVersion: environment.restApiVersion,
        clock: { now: () => new Date() },
      });
      const gateway = new GitHubAuthorizedRepositoryGatewayAdapter({
        tokenClient,
        repositoryReader: reader,
        onSecondaryFailure: (failure) =>
          logFailure(failure.failureCode, 502),
      });

      return gateway.listAllForInstallation(installationId);
    },
  };
  const useCase = new ListAuthorizedGitHubRepositories({
    sessionReader,
    installationQuery,
    repositoryGateway,
  });
  const response = await handleGitHubRepositoryList({
    request,
    execute: () => useCase.execute(),
    onFailure: logFailure,
  });
  copyHeaders(responseHeaders, response.headers);
  return response;
}
