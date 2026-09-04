import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { Inngest } from "inngest";

import { RunStagingVerification } from "@/application/staging-verification/run-staging-verification";
import {
  assertStagingVerificationEnvironment,
  ConsumeStagingVerificationTicket,
  CreateStagingVerificationTicket,
  type StagingVerificationTarget,
} from "@/application/staging-verification/staging-verification";
import {
  ProjectSyncRequestCoordinator,
  RunDailyRepositoryReconciliation,
  type ReconciliationProjectReader,
} from "@/application/synchronization/reconciliation-use-cases";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { GitHubRestActivityReader } from "@/infrastructure/github/github-activity-reader";
import { GitHubAppJwtSigner } from "@/infrastructure/github/github-app-jwt";
import { GitHubAuthorizedRepositoryGatewayAdapter } from "@/infrastructure/github/github-authorized-repository-gateway";
import { GitHubAuthorizedRepositoryReader } from "@/infrastructure/github/github-authorized-repository-reader";
import { GitHubFirstSyncTokenProvider } from "@/infrastructure/github/github-first-sync-token-provider";
import { GitHubInstallationTokenClient } from "@/infrastructure/github/github-installation-token-client";
import { SupabaseGitHubInstallationRepository } from "@/infrastructure/github/supabase-github-installation-repository";
import { InngestJobDispatcher } from "@/infrastructure/jobs/inngest-job-dispatcher";
import { GitHubReconciliationReader } from "@/infrastructure/synchronization/github-reconciliation-reader";
import { SupabaseReconciliationStore } from "@/infrastructure/synchronization/supabase-reconciliation-store";
import { SupabaseStagingVerificationTargetAuthorizer } from "@/infrastructure/staging-verification/supabase-staging-verification-target-authorizer";
import { createGitHubWebhookIngestion } from "@/app/api/github/webhook/webhook-route-dependencies";
import { createProjectBriefGenerationRouteDependencies } from "@/app/api/projects/[projectId]/briefs/generate/project-brief-generation-route-dependencies";
import type { AIProvider } from "@/shared/ai/ai-provider";
import {
  providerStructuredGenerationFailure,
  type StructuredGenerationResult,
} from "@/shared/ai/structured-generation-result";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

const controlledFailureProvider: AIProvider = {
  async generateStructured<T>(): Promise<StructuredGenerationResult<T>> {
    return providerStructuredGenerationFailure({
      reasonCode: "unavailable",
      metadata: {
        provider: "staging-controlled-failure",
        model: null,
      },
    });
  },
};

function configuredEnvironment() {
  const target = assertStagingVerificationEnvironment(process.env);
  const environment = parseServerEnvironment(process.env);
  if (
    !environment.APP_ORIGIN
    || !environment.NEXT_PUBLIC_SUPABASE_URL
    || !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || !environment.SUPABASE_SERVICE_ROLE_KEY
    || !environment.GITHUB_APP_ID
    || !environment.GITHUB_APP_PRIVATE_KEY
    || !environment.GITHUB_REST_API_VERSION
    || !environment.GITHUB_WEBHOOK_SECRET
    || !environment.INNGEST_EVENT_KEY
    || !environment.DEEPSEEK_API_KEY
  ) {
    throw new Error("staging_verification_unavailable");
  }
  return { environment, target };
}

export async function createStagingVerificationBoundary(responseHeaders: Headers) {
  const { environment, target } = configuredEnvironment();
  const sessionClient = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: environment.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders,
  });
  const session = new SupabaseVerifiedSessionReader(sessionClient);
  const authorizer = new SupabaseStagingVerificationTargetAuthorizer(
    sessionClient as ConstructorParameters<
      typeof SupabaseStagingVerificationTargetAuthorizer
    >[0],
  );
  const states = new SupabaseGitHubInstallationRepository({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!,
  });
  const issue = new CreateStagingVerificationTicket(states);
  const consume = new ConsumeStagingVerificationTicket(states);
  return { environment, target, session, authorizer, issue, consume };
}

export async function createStagingVerificationRuntime(input: {
  readonly userId: string;
  readonly responseHeaders: Headers;
  readonly target: StagingVerificationTarget;
  readonly repositoryId: number;
}) {
  const { environment } = configuredEnvironment();
  const clock = { now: () => new Date() };
  const client = new Inngest({
    id: "executor-staging-verification",
    eventKey: environment.INNGEST_EVENT_KEY,
  });
  const jwt = new GitHubAppJwtSigner({
    appId: environment.GITHUB_APP_ID!,
    privateKeyProvider: () => environment.GITHUB_APP_PRIVATE_KEY!,
    clock,
  });
  const tokenClient = new GitHubInstallationTokenClient({
    jwtSigner: jwt,
    restApiVersion: environment.GITHUB_REST_API_VERSION!,
    clock,
  });
  const tokens = new GitHubFirstSyncTokenProvider(tokenClient);
  const repositoryReader = new GitHubAuthorizedRepositoryReader({
    restApiVersion: environment.GITHUB_REST_API_VERSION!,
    clock,
  });
  const repositoryGateway = new GitHubAuthorizedRepositoryGatewayAdapter({
    tokenClient,
    repositoryReader,
  });
  const activityReader = new GitHubRestActivityReader({
    restApiVersion: environment.GITHUB_REST_API_VERSION!,
  });
  const reconciliationStore = new SupabaseReconciliationStore({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!,
  });
  const exactProjects: ReconciliationProjectReader = {
    async listEligible(window) {
      const projects = await reconciliationStore.listEligible(window);
      return projects.filter((project) => project.projectId === input.target.projectId);
    },
  };
  const reconciliation = new RunDailyRepositoryReconciliation({
    projects: exactProjects,
    reader: new GitHubReconciliationReader({
      tokens,
      repositoryGateway,
      activityReader,
    }),
    coordinator: new ProjectSyncRequestCoordinator({
      store: reconciliationStore,
      dispatcher: new InngestJobDispatcher(client),
    }),
  });
  const realBrief = await createProjectBriefGenerationRouteDependencies(
    input.responseHeaders,
  );
  const failedBrief = await createProjectBriefGenerationRouteDependencies(
    input.responseHeaders,
    { providerOverride: controlledFailureProvider },
  );
  const webhook = createGitHubWebhookIngestion();
  return new RunStagingVerification({
    target: { ...input.target, repositoryId: input.repositoryId },
    webhook,
    signWebhook: (body) =>
      `sha256=${createHmac("sha256", environment.GITHUB_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex")}`,
    reconciliation,
    async generate(generation) {
      const dependencies = generation.mode === "controlled_failure"
        ? failedBrief
        : realBrief;
      return (await dependencies.createUseCase(input.userId)).execute({
        userId: generation.userId,
        projectId: generation.projectId,
        rangeStart: generation.rangeStart,
        rangeEnd: generation.rangeEnd,
        now: generation.now,
        requestKey: generation.requestKey,
      });
    },
    clock,
    ids: { deliveryId: randomUUID },
  });
}
