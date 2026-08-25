import { spawnSync } from "node:child_process";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SupabaseAuthIdentityAdmin } from "@/infrastructure/account-deletion/supabase-auth-identity-admin";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const supabaseCliPath = path.join(projectRoot, "node_modules", "supabase", "dist", "supabase.js");
const databaseContainerName = "supabase_db_executor-command-center";
const syntheticUserId = "b3a00000-0000-4000-8000-000000000001";

function localConfiguration() {
  const result = spawnSync(process.execPath, [supabaseCliPath, "status", "--output", "env"], {
    cwd: projectRoot, encoding: "utf8", env: process.env,
  });
  const values = Object.fromEntries(result.stdout.split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => [match[1], match[2]?.replace(/"$/, "")]));
  if (result.status !== 0 || !values.API_URL || !values.SERVICE_ROLE_KEY) {
    throw new Error("local_supabase_credentials_unavailable");
  }
  return { apiUrl: values.API_URL, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

function sql(statement: string) {
  const result = spawnSync("docker", ["exec", databaseContainerName, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", statement], {
    cwd: projectRoot, encoding: "utf8", env: process.env,
  });
  if (result.status !== 0) throw new Error("local_auth_fixture_sql_failed");
  return result.stdout.trim();
}

describe("SupabaseAuthIdentityAdmin with Local Supabase Auth", () => {
  let configuration: ReturnType<typeof localConfiguration>;

  beforeAll(() => { configuration = localConfiguration(); });
  afterEach(() => { sql(`delete from auth.users where id = '${syntheticUserId}'`); });

  it("hard-deletes one synthetic Auth identity and safely replays an already-absent delete", async () => {
    sql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        '${syntheticUserId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '${syntheticUserId}@example.test', '',
        '', '', '', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now()
      );
    `);

    const client = createClient(configuration.apiUrl, configuration.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adapter = new SupabaseAuthIdentityAdmin(client);

    await expect(adapter.deleteIdentity({ userId: syntheticUserId })).resolves.toMatchObject({ outcome: "deleted" });
    expect(sql(`select count(*) from auth.users where id = '${syntheticUserId}'`)).toBe("0");
    await expect(adapter.deleteIdentity({ userId: syntheticUserId })).resolves.toMatchObject({ outcome: "already_absent" });
  });
});
