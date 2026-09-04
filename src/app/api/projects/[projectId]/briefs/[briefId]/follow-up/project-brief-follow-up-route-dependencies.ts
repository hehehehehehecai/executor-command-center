import "server-only";

import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";

export async function createProjectBriefFollowUpRouteDependencies(
  responseHeaders: Headers,
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
    followUp: {
      execute: async (input: unknown): Promise<never> => {
        void input;
        throw Object.assign(new Error("follow_up_unavailable"), {
          code: "follow_up_unavailable",
        });
      },
    },
    clock: { now: () => new Date() },
  };
}
