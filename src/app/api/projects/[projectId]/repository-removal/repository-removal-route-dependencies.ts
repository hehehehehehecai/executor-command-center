import "server-only";

import { cookies } from "next/headers";

import { RemoveRepositoryData } from "@/application/repository-removal/repository-removal-use-case";
import { createSupabaseServerClient } from "@/infrastructure/auth/supabase-server-client";
import { SupabaseVerifiedSessionReader } from "@/infrastructure/auth/supabase-verified-session-reader";
import { SupabaseRepositoryRemovalRepository } from "@/infrastructure/repository-removal/supabase-repository-removal-repository";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";

function serviceEnvironment() {
  try {
    const environment = parseServerEnvironment(process.env);
    if (
      !environment.NEXT_PUBLIC_SUPABASE_URL ||
      !environment.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("missing");
    }
    return {
      supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    };
  } catch (error) {
    throw new Error("repository_removal_configuration_missing", {
      cause: error,
    });
  }
}

export async function createRepositoryRemovalUseCase(
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
  const sessionReader = new SupabaseVerifiedSessionReader(sessionClient);
  const repository = {
    execute(
      input: Parameters<SupabaseRepositoryRemovalRepository["execute"]>[0],
    ) {
      const environment = serviceEnvironment();
      return new SupabaseRepositoryRemovalRepository(environment).execute(input);
    },
  };

  return new RemoveRepositoryData({ sessionReader, repository });
}
