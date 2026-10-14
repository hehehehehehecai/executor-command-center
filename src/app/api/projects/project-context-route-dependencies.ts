import "server-only";
import { cookies } from "next/headers";
import { ProjectContextUseCases, type ProjectContextWriter } from "@/application/project-calibration/project-context-use-cases";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { SupabaseProjectContextWriter } from "@/infrastructure/project-calibration/supabase-project-context-writer";
export async function createProjectContextUseCases(responseHeaders: Headers) {
  const client = createSupabaseServerClient({ environment: { APP_ORIGIN: process.env.APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }, cookieStore: await cookies(), responseHeaders });
  function writer() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error("project_context_unavailable");
    return new SupabaseProjectContextWriter({ supabaseUrl, serviceRoleKey });
  }
  const storage: ProjectContextWriter = { create: input => writer().create(input), patch: input => writer().patch(input) };
  return new ProjectContextUseCases({ sessionReader: new SupabaseVerifiedSessionReader(client), writer: storage });
}
