import "server-only";
import { cookies } from "next/headers";
import { ReadAuthenticatedProjectSyncStatus } from "@/application/synchronization/first-sync-production-entry";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { SupabaseFirstSyncProjectOwnershipReader } from "@/infrastructure/synchronization/supabase-first-sync-project-ownership-reader";
import { SupabaseFirstSyncStore } from "@/infrastructure/synchronization/supabase-first-sync-store";
import { SupabaseSyncRunRepository } from "@/infrastructure/synchronization/supabase-sync-run-repository";

export async function createProjectSyncStatusReader(responseHeaders: Headers) {
  const client = createSupabaseServerClient({ environment: { APP_ORIGIN: process.env.APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, cookieStore: await cookies(), responseHeaders });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("project_sync_status_unavailable");
  return new ReadAuthenticatedProjectSyncStatus({ session: new SupabaseVerifiedSessionReader(client), ownership: new SupabaseFirstSyncProjectOwnershipReader(client as ConstructorParameters<typeof SupabaseFirstSyncProjectOwnershipReader>[0]), contexts: new SupabaseFirstSyncStore({ supabaseUrl, serviceRoleKey }), runs: new SupabaseSyncRunRepository({ supabaseUrl, serviceRoleKey }) });
}
