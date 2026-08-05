import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SupabaseProjectCalibrationWriter } from "../../../src/infrastructure/project-calibration/supabase-project-calibration-storage";

type LocalConfiguration = {
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

function configuration(): LocalConfiguration {
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
  return { apiUrl: values.API_URL, serviceRoleKey: values.SERVICE_ROLE_KEY };
}

function sql(statement: string) {
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
      statement,
    ],
    { cwd: projectRoot, encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) throw new Error("local_project_fixture_sql_failed");
  return result.stdout.trim();
}

describe("project-calibration-storage.v1 with Local Supabase", () => {
  let local: LocalConfiguration;
  const userIds = new Set<string>();

  beforeAll(() => {
    local = configuration();
  });

  afterEach(() => {
    for (const userId of userIds) {
      sql(`delete from auth.users where id = '${userId}'`);
    }
    userIds.clear();
  });

  function fixture(seed: number) {
    const userId = randomUUID();
    const installationId = randomUUID();
    userIds.add(userId);
    sql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        '${userId}', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '${userId}@example.test', '',
        now(), '{}'::jsonb, '{}'::jsonb, now(), now()
      );
      insert into public.users (id) values ('${userId}');
      insert into public.github_identities (
        user_id, github_user_id, github_login
      ) values ('${userId}', ${9_800_000 + seed}, 'phase6-${seed}');
      insert into public.github_installations (
        id, user_id, installation_id, github_account_id,
        github_account_login, account_type, repository_selection,
        status, last_verified_at
      ) values (
        '${installationId}', '${userId}', ${9_900_000 + seed},
        ${9_800_000 + seed}, 'phase6-${seed}', 'User', 'selected',
        'active', now()
      );
      select public.ensure_selected_github_repository(
        '${userId}', '${installationId}', ${9_700_000 + seed},
        'synthetic-owner', 'repository-${seed}',
        'synthetic-owner/repository-${seed}', 'private',
        true, false, false, false, 'main'
      );
    `);
    const selectedRepositoryId = sql(`
      select id from public.selected_repositories
      where user_id = '${userId}'
        and github_repository_id = ${9_700_000 + seed}
    `);
    return { userId, selectedRepositoryId };
  }

  function writer() {
    return new SupabaseProjectCalibrationWriter({
      supabaseUrl: local.apiUrl,
      serviceRoleKey: local.serviceRoleKey,
    });
  }

  it("serializes 16 concurrent repeated saves into one active project", async () => {
    const identity = fixture(1);
    const storage = writer();
    const input = {
      userId: identity.userId,
      command: {
        selectedRepositoryId: identity.selectedRepositoryId,
        coreGoal: "Ship a trustworthy MVP",
        currentStageGoal: "Calibrate the first project",
        status: "in_planning" as const,
        currentBlocker: null,
      },
    };
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => storage.save(input)),
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(
      sql(`
        select count(*) from public.projects
        where selected_repository_id = '${identity.selectedRepositoryId}'
          and status <> 'archived'
      `),
    ).toBe("1");
  });

  it("retains archived history and creates one replacement active project", async () => {
    const identity = fixture(2);
    const storage = writer();
    const base = {
      userId: identity.userId,
      command: {
        selectedRepositoryId: identity.selectedRepositoryId,
        coreGoal: "First goal",
        currentStageGoal: "First stage",
        status: "in_planning" as const,
        currentBlocker: null,
      },
    };
    await storage.save(base);
    await storage.save({
      ...base,
      command: { ...base.command, status: "archived" as const },
    });
    await storage.save({
      ...base,
      command: {
        ...base.command,
        coreGoal: "Replacement goal",
        status: "in_development" as const,
      },
    });
    expect(
      sql(`
        select string_agg(status || ':' || core_goal, ',' order by status)
        from public.projects
        where selected_repository_id = '${identity.selectedRepositoryId}'
      `),
    ).toBe("archived:First goal,in_development:Replacement goal");
  });
});
