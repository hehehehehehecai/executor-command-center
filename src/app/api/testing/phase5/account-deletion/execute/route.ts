import { createClient } from "@supabase/supabase-js";

import { ExecuteDueAccountDeletion } from "@/application/account-deletion/account-deletion-use-cases";
import { SupabaseAccountDeletionRepository } from "@/infrastructure/account-deletion/supabase-account-deletion-repository";
import { SupabaseAuthIdentityAdmin } from "@/infrastructure/account-deletion/supabase-auth-identity-admin";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.PHASE5_E2E !== "1") {
    return new Response(null, { status: 404 });
  }
  if (
    request.headers.get("origin") !== process.env.APP_ORIGIN ||
    !process.env.PHASE5_E2E_CONTROL_TOKEN ||
    request.headers.get("x-phase5-e2e-control-token") !==
      process.env.PHASE5_E2E_CONTROL_TOKEN
  ) {
    return new Response(null, { status: 404 });
  }
  const payload = (await request.json().catch(() => null)) as {
    operationId?: unknown;
    simulateAuthFailure?: unknown;
  } | null;
  if (!payload || typeof payload.operationId !== "string" || !uuid.test(payload.operationId)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const environment = parseServerEnvironment(process.env);
  if (!environment.NEXT_PUBLIC_SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "configuration_missing" }, { status: 503 });
  }
  const trustedClient = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const execute = new ExecuteDueAccountDeletion({
    repository: new SupabaseAccountDeletionRepository({
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    }),
    authAdmin:
      payload.simulateAuthFailure === true
        ? {
            async deleteIdentity() {
              throw new Error("phase5_synthetic_auth_failure");
            },
          }
        : new SupabaseAuthIdentityAdmin(trustedClient),
  });
  return Response.json(await execute.execute({ operationId: payload.operationId }));
}
