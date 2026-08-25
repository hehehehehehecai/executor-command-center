import "server-only";

import { cookies } from "next/headers";
import { Inngest } from "inngest";

import {
  CancelAccountDeletion,
  GetAccountDeletionStatus,
  RequestAccountDeletion,
} from "@/application/account-deletion/account-deletion-use-cases";
import { InngestAccountDeletionDispatcher } from "@/infrastructure/account-deletion/inngest-account-deletion-dispatcher";
import { SupabaseAccountDeletionRepository } from "@/infrastructure/account-deletion/supabase-account-deletion-repository";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export async function createAccountDeletionUseCases(responseHeaders: Headers) {
  const environment = parseServerEnvironment(process.env);
  if (!environment.NEXT_PUBLIC_SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY || !environment.INNGEST_EVENT_KEY) {
    throw new Error("account_deletion_configuration_missing");
  }
  const sessionClient = createSupabaseServerClient({
    environment,
    cookieStore: await cookies(),
    responseHeaders,
  });
  const sessionReader = new SupabaseVerifiedSessionReader(sessionClient);
  const repository = new SupabaseAccountDeletionRepository({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  });
  const client = new Inngest({ id: "executor-command-center", eventKey: environment.INNGEST_EVENT_KEY });
  return {
    request: new RequestAccountDeletion({ sessionReader, repository, dispatcher: new InngestAccountDeletionDispatcher(client) }),
    status: new GetAccountDeletionStatus({ sessionReader, repository }),
    cancel: new CancelAccountDeletion({ sessionReader, repository }),
  };
}
