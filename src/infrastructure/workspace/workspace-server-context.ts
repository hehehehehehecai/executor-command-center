import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { loadWorkspaceContext } from "@/application/workspace/load-workspace-context";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import { SupabaseWorkspaceContextReader, type WorkspaceSessionClient } from "./supabase-workspace-context-reader";

export function workspaceEnvironment() {
  const environment = parseServerEnvironment({
    APP_ORIGIN: process.env.APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!environment.NEXT_PUBLIC_SUPABASE_URL || !environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error("workspace_configuration_missing");
  return environment;
}

// React.cache is scoped to the current server render/request, never a user-data singleton.
export const readWorkspaceContext = cache(async () => {
  let environment;
  try { environment = workspaceEnvironment(); }
  catch { return loadWorkspaceContext(null); }
  const cookieStore = await cookies();
  const client = createSupabaseServerClient({
    environment,
    cookieStore: { getAll: () => cookieStore.getAll(), set: () => undefined },
    responseHeaders: new Headers(),
    createClient: (url, key, options) => createServerClient(url, key, { ...options, global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } }),
  });
  const hasSession = cookieStore.getAll().some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
  return loadWorkspaceContext(new SupabaseWorkspaceContextReader(client as unknown as WorkspaceSessionClient, hasSession));
});
