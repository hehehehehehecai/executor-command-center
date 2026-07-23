import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SupabaseGitHubInstallationRepository } from "../../../src/infrastructure/github/supabase-github-installation-repository";

type LocalSupabaseConfiguration = {
  readonly apiUrl: string;
  readonly serviceRoleKey: string;
};

type InstallationRow = {
  readonly id: string;
  readonly user_id: string;
  readonly installation_id: number;
  readonly github_account_id: number;
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

describe("github-installation-storage.v1 with Local Supabase", () => {
  let configuration: LocalSupabaseConfiguration;
  const authUserIds = new Set<string>();

  beforeAll(() => {
    configuration = readLocalSupabaseConfiguration();
  });

  function createIdentity(githubUserId: number) {
    const userId = randomUUID();
    authUserIds.add(userId);
    executeLocalSql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      )
      values (
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
      select public.ensure_user_identity(
        '${userId}',
        ${githubUserId},
        'synthetic-${githubUserId}',
        null
      );
    `);
    return { userId, githubUserId };
  }

  function createRepository() {
    return new SupabaseGitHubInstallationRepository({
      supabaseUrl: configuration.apiUrl,
      serviceRoleKey: configuration.serviceRoleKey,
    });
  }

  function selectInstallations(whereClause: string) {
    const output = executeLocalSql(
      `
        select coalesce(json_agg(rows), '[]'::json)
        from (
          select id, user_id, installation_id, github_account_id
          from public.github_installations
          where ${whereClause}
        ) rows
      `,
    );
    return JSON.parse(output.trim()) as InstallationRow[];
  }

  afterEach(() => {
    for (const userId of authUserIds) {
      executeLocalSql(`delete from auth.users where id = '${userId}'`);
    }
    authUserIds.clear();
  });

  it("fulfills every concurrent identical registration with one stable record", async () => {
    const identity = createIdentity(7_400_001);
    const repository = createRepository();
    const input = {
      userId: identity.userId,
      installationId: 8_400_001,
      githubAccountId: identity.githubUserId,
      githubAccountLogin: "synthetic-concurrent-user",
      accountType: "User" as const,
      repositorySelection: "selected" as const,
      status: "active" as const,
      suspendedAt: null,
      verifiedAt: "2026-07-23T08:00:00.000Z",
    };

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        repository.registerVerified(input),
      ),
    );
    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        installationRecordId: string;
      }> => result.status === "fulfilled",
    );
    const rows = selectInstallations(
      `user_id = '${identity.userId}'`,
    );

    expect(results.filter((result) => result.status === "rejected")).toEqual(
      [],
    );
    expect(fulfilled).toHaveLength(8);
    expect(
      new Set(fulfilled.map((result) => result.value.installationRecordId)),
    ).toHaveProperty("size", 1);
    expect(rows).toEqual([
      expect.objectContaining({
        id: fulfilled[0]?.value.installationRecordId,
        user_id: identity.userId,
        installation_id: 8_400_001,
        github_account_id: identity.githubUserId,
      }),
    ]);
  });

  it("allows only one concurrent user to claim the same installation id", async () => {
    const identities = [createIdentity(7_400_002), createIdentity(7_400_003)];
    const repository = createRepository();
    const results = await Promise.allSettled(
      identities.map((identity) =>
        repository.registerVerified({
          userId: identity.userId,
          installationId: 8_400_002,
          githubAccountId: identity.githubUserId,
          githubAccountLogin: `synthetic-${identity.githubUserId}`,
          accountType: "User",
          repositorySelection: "all",
          status: "active",
          suspendedAt: null,
          verifiedAt: "2026-07-23T08:00:00.000Z",
        }),
      ),
    );
    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    const rows = selectInstallations(
      "installation_id = 8400002",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      new Error("github_installation_already_bound"),
    );
    expect(rows).toHaveLength(1);
    expect(identities.map((identity) => identity.userId)).toContain(
      rows[0]?.user_id,
    );
  });
});
