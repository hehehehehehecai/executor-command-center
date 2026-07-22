import "server-only";

import type { UserRepository } from "@/application/auth/user-repository";
import { parseServerEnvironment } from "@/shared/configuration/server-environment";
import { SupabaseIdentityRpcClient } from "./supabase-identity-rpc-client";
import { SupabaseUserRepository } from "./supabase-user-repository";

export function createServiceRoleUserRepository(
  source: Readonly<Record<string, string | undefined>> = process.env,
): UserRepository {
  const environment = parseServerEnvironment(source);
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("missing_supabase_identity_repository_configuration");
  }

  return new SupabaseUserRepository(
    new SupabaseIdentityRpcClient({ supabaseUrl, serviceRoleKey }),
  );
}
