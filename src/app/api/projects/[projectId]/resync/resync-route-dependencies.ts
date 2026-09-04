import "server-only";

import { Inngest } from "inngest";
import { cookies } from "next/headers";

import {
  ManualRepositoryResync,
  ProjectSyncRequestCoordinator,
} from "@/application/synchronization/reconciliation-use-cases";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { InngestJobDispatcher } from "@/infrastructure/jobs/inngest-job-dispatcher";
import { SupabaseReconciliationStore } from "@/infrastructure/synchronization/supabase-reconciliation-store";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export async function createManualResyncDependencies(responseHeaders: Headers) {
  const environment = parseServerEnvironment(process.env);
  if (
    !environment.NEXT_PUBLIC_SUPABASE_URL
    || !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || !environment.SUPABASE_SERVICE_ROLE_KEY
    || !environment.INNGEST_EVENT_KEY
  ) {
    throw new Error("manual_resync_configuration_missing");
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
  const store = new SupabaseReconciliationStore({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  });
  const coordinator = new ProjectSyncRequestCoordinator({
    store,
    dispatcher: new InngestJobDispatcher(new Inngest({
      id: "executor-command-center-reconciliation",
      eventKey: environment.INNGEST_EVENT_KEY,
    })),
  });
  return {
    manual: new ManualRepositoryResync({
      session: new SupabaseVerifiedSessionReader(sessionClient),
      coordinator,
    }),
    clock: { now: () => new Date() },
  };
}
