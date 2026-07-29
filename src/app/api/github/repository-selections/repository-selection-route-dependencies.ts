import "server-only";

import { cookies } from "next/headers";

import { DeselectSelectedGitHubRepository } from "@/application/github-repository-selection/deselect-selected-github-repository";
import { ListSelectedGitHubRepositories } from "@/application/github-repository-selection/list-selected-github-repositories";
import { SelectAuthorizedGitHubRepository } from "@/application/github-repository-selection/select-authorized-github-repository";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { GitHubAppJwtSigner } from "@/infrastructure/github/github-app-jwt";
import { GitHubAuthorizedRepositoryGatewayAdapter } from "@/infrastructure/github/github-authorized-repository-gateway";
import { GitHubAuthorizedRepositoryReader } from "@/infrastructure/github/github-authorized-repository-reader";
import { GitHubInstallationTokenClient } from "@/infrastructure/github/github-installation-token-client";
import { SupabaseSelectedRepositoryReader } from "@/infrastructure/github-repository-selection/supabase-selected-repository-reader";
import { SupabaseSelectedRepositoryWriter } from "@/infrastructure/github-repository-selection/supabase-selected-repository-writer";
import { SupabaseSelectionInstallationQuery } from "@/infrastructure/github-repository-selection/supabase-selection-installation-query";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function serviceEnvironment() {
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
  } catch (error) {
    throw new Error("github_app_configuration_missing", {
      cause: error,
    });
  }
}

export async function createRepositorySelectionUseCases(
  responseHeaders: Headers,
) {
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
  const reader = new SupabaseSelectedRepositoryReader(
    sessionClient as ConstructorParameters<
      typeof SupabaseSelectedRepositoryReader
    >[0],
  );
  const installationQuery = {
    findByUserId(userId: string) {
      const environment = serviceEnvironment();
      return new SupabaseSelectionInstallationQuery({
        supabaseUrl: environment.supabaseUrl,
        serviceRoleKey: environment.serviceRoleKey,
      }).findByUserId(userId);
    },
  };
  const writer = {
    ensureSelected(
      input: Parameters<
        SupabaseSelectedRepositoryWriter["ensureSelected"]
      >[0],
    ) {
      const environment = serviceEnvironment();
      return new SupabaseSelectedRepositoryWriter({
        supabaseUrl: environment.supabaseUrl,
        serviceRoleKey: environment.serviceRoleKey,
      }).ensureSelected(input);
    },
    removeSelection(
      input: Parameters<
        SupabaseSelectedRepositoryWriter["removeSelection"]
      >[0],
    ) {
      const environment = serviceEnvironment();
      return new SupabaseSelectedRepositoryWriter({
        supabaseUrl: environment.supabaseUrl,
        serviceRoleKey: environment.serviceRoleKey,
      }).removeSelection(input);
    },
  };
  const repositoryGateway = {
    listAllForInstallation(installationId: number) {
      const environment = serviceEnvironment();
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
      const repositoryReader = new GitHubAuthorizedRepositoryReader({
        restApiVersion: environment.restApiVersion,
        clock: { now: () => new Date() },
      });
      return new GitHubAuthorizedRepositoryGatewayAdapter({
        tokenClient,
        repositoryReader,
      }).listAllForInstallation(installationId);
    },
  };

  return {
    list: new ListSelectedGitHubRepositories({
      sessionReader,
      reader,
    }),
    select: new SelectAuthorizedGitHubRepository({
      sessionReader,
      installationQuery,
      repositoryGateway,
      writer,
    }),
    deselect: new DeselectSelectedGitHubRepository({
      sessionReader,
      writer,
    }),
  };
}
