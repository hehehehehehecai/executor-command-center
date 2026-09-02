import { cookies } from "next/headers";

import { CommandDeckPage } from "@/features/command-deck";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

export const dynamic = "force-dynamic";

function hasSupabaseSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): boolean {
  return cookieStore
    .getAll()
    .some(({ name }) => /^sb-.+-auth-token(?:\.\d+)?$/.test(name));
}

async function hasVerifiedSession(): Promise<boolean> {
  try {
    const environment = parseServerEnvironment(process.env);
    const cookieStore = await cookies();
    if (!hasSupabaseSessionCookie(cookieStore)) return false;
    const client = createSupabaseServerClient({
      environment,
      cookieStore,
      responseHeaders: new Headers(),
    });
    const { data, error } = await client.auth.getUser();
    return !error && Boolean(data.user);
  } catch {
    return false;
  }
}

export default async function Home() {
  return <CommandDeckPage authenticated={await hasVerifiedSession()} />;
}
