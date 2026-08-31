import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { BuildProjectBriefEvidenceSnapshotUseCase } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import { GenerateProjectBriefUseCase } from "@/application/project-brief/generate-project-brief";
import { DeepSeekStructuredGenerationAdapter } from "@/infrastructure/ai/deepseek-structured-generation-adapter";
import { SupabaseEnergyReservationClient } from "@/infrastructure/ai-usage/supabase-energy-reservation-client";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { ExistingProjectFreshnessEvidenceReader } from "@/infrastructure/project-brief-evidence/existing-project-freshness-evidence-reader";
import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";
import { SupabaseProjectBriefEvidenceReader } from "@/infrastructure/project-brief-evidence/supabase-project-brief-evidence-reader";
import { SupabaseProjectBriefCache } from "@/infrastructure/project-brief/supabase-project-brief-cache";
import { SupabaseProjectBriefGenerationPersistence } from "@/infrastructure/project-brief/supabase-project-brief-generation-persistence";
import { SupabaseProjectBriefAuthorizationGate } from "@/infrastructure/project-brief/supabase-project-brief-authorization-gate";
import { SupabaseProjectFreshnessReader } from "@/infrastructure/synchronization/supabase-project-freshness-reader";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import type { AIProvider } from "@/shared/ai/ai-provider";

export async function createProjectBriefGenerationRouteDependencies(
  responseHeaders: Headers,
  options: { readonly providerOverride?: AIProvider } = {},
) {
  const sessionClient = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: process.env.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders,
  });
  return {
    session: new SupabaseVerifiedSessionReader(sessionClient),
    async createUseCase(actorUserId: string) {
      const environment = parseServerEnvironment(process.env);
      if (
        !environment.NEXT_PUBLIC_SUPABASE_URL
        || !environment.SUPABASE_SERVICE_ROLE_KEY
        || !environment.DEEPSEEK_API_KEY
      ) {
        throw Object.assign(new Error("configuration"), { code: "internal_error" });
      }
      const trustedClient = createClient(
        environment.NEXT_PUBLIC_SUPABASE_URL,
        environment.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const fingerprint = new NodeProjectBriefEvidenceFingerprint();
      const phase5ProviderUrl =
        process.env.NODE_ENV !== "production" && process.env.PHASE5_E2E === "1"
          ? process.env.PHASE5_E2E_PROVIDER_URL
          : undefined;
      const evidenceBuilder = new BuildProjectBriefEvidenceSnapshotUseCase({
        sourceReader: new SupabaseProjectBriefEvidenceReader(
          sessionClient as ConstructorParameters<typeof SupabaseProjectBriefEvidenceReader>[0],
        ),
        freshnessReader: new ExistingProjectFreshnessEvidenceReader(
          new SupabaseProjectFreshnessReader(
            sessionClient as ConstructorParameters<typeof SupabaseProjectFreshnessReader>[0],
          ),
        ),
        fingerprint,
      });
      const evidenceValidator = new ValidateProjectBriefEvidenceUseCase({ fingerprint });
      const provider = options.providerOverride ??
        new DeepSeekStructuredGenerationAdapter({
          apiKey: environment.DEEPSEEK_API_KEY,
          model: "deepseek-chat",
          timeoutMs: 60_000,
          fetcher: phase5ProviderUrl
            ? (input, init) => {
                const source =
                  typeof input === "string"
                    ? input
                    : input instanceof URL
                      ? input.href
                      : input.url;
                const original = new URL(source);
                return fetch(new URL(original.pathname, phase5ProviderUrl), init);
              }
            : undefined,
        });
      return new GenerateProjectBriefUseCase({
        authorization: new SupabaseProjectBriefAuthorizationGate(
          sessionClient as ConstructorParameters<typeof SupabaseProjectBriefAuthorizationGate>[0],
        ),
        evidenceBuilder,
        evidenceValidator,
        cache: new SupabaseProjectBriefCache(
          sessionClient as ConstructorParameters<typeof SupabaseProjectBriefCache>[0],
        ),
        energyReservations: new SupabaseEnergyReservationClient(
          sessionClient as ConstructorParameters<typeof SupabaseEnergyReservationClient>[0],
        ),
        provider,
        persistence: new SupabaseProjectBriefGenerationPersistence({
          trustedRpc: trustedClient,
          authenticatedRpc: sessionClient as ConstructorParameters<
            typeof SupabaseProjectBriefGenerationPersistence
          >[0]["authenticatedRpc"],
          actorUserId,
        }),
      });
    },
    clock: { now: () => new Date() },
  };
}
