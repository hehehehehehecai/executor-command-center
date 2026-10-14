import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { handleDecisionRecordWrite } from "@/infrastructure/decision-records/decision-record-http";
import { SupabaseDecisionRecordStore, type DecisionRecordSessionClient } from "@/infrastructure/decision-records/supabase-decision-record-store";

export const dynamic = "force-dynamic";

async function handle(request: Request, route: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await route.params;
  const responseHeaders = new Headers();
  return handleDecisionRecordWrite({
    request, projectId, responseHeaders, flag: process.env.DECISION_RECORD_WRITES_ENABLED, appOrigin: process.env.APP_ORIGIN,
    execute: async (ownedProjectId, command) => {
      const client = createSupabaseServerClient({
        environment: { APP_ORIGIN: process.env.APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
        cookieStore: await cookies(), responseHeaders,
      });
      const userId = await new SupabaseVerifiedSessionReader(client).getVerifiedUserId();
      if (userId === null) throw new Error("decision_record_unauthenticated");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) throw new Error("decision_record_unavailable");
      // Like project-context writes, only this server path delegates the freshly
      // verified actor. Authenticated Data API clients have no write grant.
      const writer = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      return new SupabaseDecisionRecordStore(writer as unknown as DecisionRecordSessionClient).create({ userId, projectId: ownedProjectId, command });
    },
  });
}

export { handle as POST, handle as GET, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
