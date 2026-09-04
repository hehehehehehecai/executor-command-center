import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SupabaseSelectionInstallationQuery } from "../../../src/infrastructure/github-repository-selection/supabase-selection-installation-query";

type LocalSupabaseConfiguration = {
  readonly apiUrl: string;
  readonly serviceRoleKey: string;
};

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const supabaseCliPath = path.join(
  projectRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const databaseContainerName = "supabase_db_executor-command-center";

function readLocalSupabaseConfiguration(): LocalSupabaseConfiguration {
  const result = spawnSync(
    process.execPath,
    [supabaseCliPath, "status", "--output", "env"],
    { cwd: projectRoot, encoding: "utf8", env: process.env },
  );
  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]?.replace(/"$/, "")]),
  );

  if (result.status !== 0 || !values.API_URL || !values.SERVICE_ROLE_KEY) {
    throw new Error("local_supabase_credentials_unavailable");
  }

  return {
    apiUrl: values.API_URL,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
  };
}

function executeLocalSql(sql: string) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      databaseContainerName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { cwd: projectRoot, encoding: "utf8", env: process.env },
  );

  if (result.status !== 0) {
    throw new Error("local_supabase_fixture_sql_failed");
  }

  return result.stdout;
}

describe("selection installation query with Local Supabase", () => {
  let configuration: LocalSupabaseConfiguration;
  const authUserIds = new Set<string>();

  beforeAll(() => {
    configuration = readLocalSupabaseConfiguration();
  });

  afterEach(() => {
    for (const userId of authUserIds) {
      executeLocalSql(`delete from auth.users where id = '${userId}'`);
    }
    authUserIds.clear();
  });

  it("reads only the current user's selection installation through service_role", async () => {
    const userId = randomUUID();
    const installationRecordId = randomUUID();
    const installationId = 8_700_001;
    authUserIds.add(userId);
    executeLocalSql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        '${userId}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        '${userId}@example.test',
        '',
        now(),
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      );
      insert into public.users (id) values ('${userId}');
      insert into public.github_installations (
        id,
        user_id,
        installation_id,
        github_account_id,
        github_account_login,
        account_type,
        repository_selection,
        status,
        suspended_at,
        revoked_at,
        last_verified_at
      ) values (
        '${installationRecordId}',
        '${userId}',
        ${installationId},
        7700001,
        'selection-installation-query-fixture',
        'User',
        'selected',
        'active',
        null,
        null,
        now()
      );
    `);
    const query = new SupabaseSelectionInstallationQuery({
      supabaseUrl: configuration.apiUrl,
      serviceRoleKey: configuration.serviceRoleKey,
    });

    await expect(query.findByUserId(userId)).resolves.toEqual({
      githubInstallationId: installationRecordId,
      installationId,
      status: "active",
    });
  });
});
