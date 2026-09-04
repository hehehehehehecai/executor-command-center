import "server-only";

import { Inngest } from "inngest";
import { cookies } from "next/headers";

import { StartAuthenticatedFirstRepositorySync } from "@/application/synchronization/first-sync-production-entry";
import { StartFirstRepositorySync } from "@/application/synchronization/first-sync-use-cases";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { InngestJobDispatcher } from "@/infrastructure/jobs/inngest-job-dispatcher";
import { SupabaseFirstSyncProjectOwnershipReader } from "@/infrastructure/synchronization/supabase-first-sync-project-ownership-reader";
import { SupabaseFirstSyncStore } from "@/infrastructure/synchronization/supabase-first-sync-store";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export const firstSyncRouteCompositionContract =
  "first-sync-route-composition.v1" as const;

export async function createFirstSyncRouteDependencies(
  responseHeaders: Headers,
  source: Readonly<Record<string, string | undefined>> = process.env,
) {
  let environment: ReturnType<typeof parseServerEnvironment>;
  try {
    environment = parseServerEnvironment(source);
    if (
      !environment.APP_ORIGIN
      || !environment.NEXT_PUBLIC_SUPABASE_URL
      || !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || !environment.SUPABASE_SERVICE_ROLE_KEY
      || !environment.INNGEST_EVENT_KEY
    ) {
      throw new Error("missing");
    }
  } catch (error) {
    throw new Error("first_sync_configuration_missing", { cause: error });
  }

  const sessionClient = createSupabaseServerClient({
    environment: {
      APP_ORIGIN: environment.APP_ORIGIN,
      NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    cookieStore: await cookies(),
    responseHeaders,
  });
  const store = new SupabaseFirstSyncStore({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  });
  const start = new StartFirstRepositorySync({
    runs: store,
    contexts: store,
    dispatcher: new InngestJobDispatcher(new Inngest({
      id: "executor-command-center-first-sync",
      eventKey: environment.INNGEST_EVENT_KEY,
    })),
  });
  return {
    entry: new StartAuthenticatedFirstRepositorySync({
      session: new SupabaseVerifiedSessionReader(sessionClient),
      ownership: new SupabaseFirstSyncProjectOwnershipReader(
        sessionClient as ConstructorParameters<typeof SupabaseFirstSyncProjectOwnershipReader>[0],
      ),
      contexts: store,
      start,
    }),
  };
}
