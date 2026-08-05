import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AuthorizedGitHubRepository } from "../../../src/domain/github-repository/authorized-github-repository";
import { SupabaseSelectedRepositoryWriter } from "../../../src/infrastructure/github-repository-selection/supabase-selected-repository-writer";

type LocalSupabaseConfiguration = {
  readonly apiUrl: string;
  readonly serviceRoleKey: string;
};

type SelectionRow = {
  readonly id: string;
  readonly user_id: string;
  readonly github_installation_id: string;
  readonly github_repository_id: number;
  readonly owner_login: string;
  readonly full_name: string;
  readonly selected_at: string;
  readonly created_at: string;
  readonly updated_at: string;
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

function repository(
  id: number,
  overrides: Partial<AuthorizedGitHubRepository> = {},
): AuthorizedGitHubRepository {
  return {
    id,
    ownerLogin: "synthetic-owner",
    name: `repository-${id}`,
    fullName: `synthetic-owner/repository-${id}`,
    isPrivate: true,
    isFork: false,
    isArchived: false,
    isDisabled: false,
    visibility: "private",
    defaultBranch: "main",
    ...overrides,
  };
}

describe("github-repository-selection-storage.v1 with Local Supabase", () => {
  let configuration: LocalSupabaseConfiguration;
  const authUserIds = new Set<string>();

  beforeAll(() => {
    configuration = readLocalSupabaseConfiguration();
  });

  function createUserWithInstallation(seed: number) {
    const userId = randomUUID();
    const githubInstallationId = randomUUID();
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
      insert into public.users (id) values ('${userId}');
      insert into public.github_identities (
        user_id, github_user_id, github_login
      )
      values (
        '${userId}',
        ${9_700_000 + seed},
        'selection-${seed}'
      );
      insert into public.github_installations (
        id,
        user_id,
        installation_id,
        github_account_id,
        github_account_login,
        account_type,
        repository_selection,
        status,
        last_verified_at
      )
      values (
        '${githubInstallationId}',
        '${userId}',
        ${9_800_000 + seed},
        ${9_700_000 + seed},
        'selection-${seed}',
        'User',
        'selected',
        'active',
        now()
      );
    `);
    return { userId, githubInstallationId };
  }

  function createWriter() {
    return new SupabaseSelectedRepositoryWriter({
      supabaseUrl: configuration.apiUrl,
      serviceRoleKey: configuration.serviceRoleKey,
    });
  }

  function selectRows(whereClause: string) {
    const output = executeLocalSql(`
      select coalesce(json_agg(rows order by github_repository_id), '[]'::json)
      from (
        select
          id,
          user_id,
          github_installation_id,
          github_repository_id,
          owner_login,
          full_name,
          selected_at,
          created_at,
          updated_at
        from public.selected_repositories
        where ${whereClause}
      ) rows
    `);
    return JSON.parse(output.trim()) as SelectionRow[];
  }

  function snapshotExistingIdentityAndInstallationRows(userId: string) {
    return executeLocalSql(`
      select json_build_object(
        'auth_users',
        (
          select row_to_json(auth_user_record)
          from auth.users auth_user_record
          where auth_user_record.id = '${userId}'
        ),
        'users',
        (
          select row_to_json(user_record)
          from public.users user_record
          where user_record.id = '${userId}'
        ),
        'github_identities',
        (
          select row_to_json(identity_record)
          from public.github_identities identity_record
          where identity_record.user_id = '${userId}'
        ),
        'github_installations',
        (
          select coalesce(
            json_agg(installation_record order by installation_record.id),
            '[]'::json
          )
          from public.github_installations installation_record
          where installation_record.user_id = '${userId}'
        ),
        'github_installation_states',
        (
          select coalesce(
            json_agg(state_record order by state_record.id),
            '[]'::json
          )
          from public.github_installation_states state_record
          where state_record.user_id = '${userId}'
        ),
        'database_baseline',
        (
          select coalesce(
            json_agg(baseline_record order by baseline_record.id),
            '[]'::json
          )
          from app_private.database_baseline baseline_record
        )
      )
    `).trim();
  }

  afterEach(() => {
    for (const userId of authUserIds) {
      executeLocalSql(`
        delete from public.selected_repositories
        where user_id = '${userId}';
        delete from auth.users where id = '${userId}';
      `);
    }
    authUserIds.clear();
  });

  it("fulfills all 16 concurrent identical ensures with one immutable logical selection", async () => {
    const identity = createUserWithInstallation(1);
    const writer = createWriter();
    const input = {
      ...identity,
      repository: repository(9_600_001),
    };

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => writer.ensureSelected(input)),
    );
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof writer.ensureSelected>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    const rows = selectRows(`user_id = '${identity.userId}'`);

    expect(fulfilled).toHaveLength(16);
    expect(rejected).toHaveLength(0);
    expect(new Set(fulfilled.map((result) => result.value.repositoryId))).toHaveProperty(
      "size",
      1,
    );
    expect(
      new Set(
        fulfilled.map((result) =>
          JSON.stringify({
            ...result.value,
            updatedAt: "refreshed-by-each-idempotent-upsert",
          }),
        ),
      ),
    ).toHaveProperty("size", 1);
    expect(
      new Set(fulfilled.map((result) => result.value.selectedAt)),
    ).toHaveProperty("size", 1);
    expect(rows).toHaveLength(1);
    expect(new Set(rows.map((row) => row.id))).toHaveProperty("size", 1);
    expect(new Set(rows.map((row) => row.selected_at))).toHaveProperty(
      "size",
      1,
    );
  });

  it("supports concurrent different repositories for one user", async () => {
    const identity = createUserWithInstallation(2);
    const writer = createWriter();
    const results = await Promise.allSettled([
      writer.ensureSelected({
        ...identity,
        repository: repository(9_600_002),
      }),
      writer.ensureSelected({
        ...identity,
        repository: repository(9_600_003),
      }),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(
      true,
    );
    expect(selectRows(`user_id = '${identity.userId}'`)).toHaveLength(2);
  });

  it("isolates concurrent same-repository selections for different users", async () => {
    const identities = [
      createUserWithInstallation(3),
      createUserWithInstallation(4),
    ];
    const writer = createWriter();
    const results = await Promise.allSettled(
      identities.map((identity) =>
        writer.ensureSelected({
          ...identity,
          repository: repository(9_600_004),
        }),
      ),
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(
      true,
    );
    expect(
      selectRows("github_repository_id = 9600004").map(
        (row) => row.user_id,
      ),
    ).toEqual(expect.arrayContaining(identities.map(({ userId }) => userId)));
  });

  it("refreshes rename metadata without changing selection identity or timestamps", async () => {
    const identity = createUserWithInstallation(5);
    const writer = createWriter();
    await writer.ensureSelected({
      ...identity,
      repository: repository(9_600_005),
    });
    const before = selectRows(`user_id = '${identity.userId}'`)[0]!;

    await writer.ensureSelected({
      ...identity,
      repository: repository(9_600_005, {
        ownerLogin: "renamed-owner",
        name: "renamed-repository",
        fullName: "renamed-owner/renamed-repository",
      }),
    });
    const after = selectRows(`user_id = '${identity.userId}'`)[0]!;

    expect(after).toMatchObject({
      id: before.id,
      user_id: before.user_id,
      github_installation_id: before.github_installation_id,
      github_repository_id: before.github_repository_id,
      owner_login: "renamed-owner",
      full_name: "renamed-owner/renamed-repository",
      selected_at: before.selected_at,
      created_at: before.created_at,
    });
  });

  it("fails closed on installation rebinding and leaves the original row unchanged", async () => {
    const first = createUserWithInstallation(6);
    const writer = createWriter();
    await writer.ensureSelected({
      ...first,
      repository: repository(9_600_006),
    });
    const before = selectRows(`user_id = '${first.userId}'`)[0]!;
    const otherInstallationId = randomUUID();
    executeLocalSql(`
      insert into public.github_installations (
        id,
        user_id,
        installation_id,
        github_account_id,
        github_account_login,
        account_type,
        repository_selection,
        status,
        last_verified_at
      )
      values (
        '${otherInstallationId}',
        '${first.userId}',
        9800096,
        9700096,
        'selection-rebound',
        'User',
        'selected',
        'active',
        now()
      );
    `);

    await expect(
      writer.ensureSelected({
        userId: first.userId,
        githubInstallationId: otherInstallationId,
        repository: repository(9_600_006, {
          fullName: "attacker/rebound",
        }),
      }),
    ).rejects.toThrow(
      "github_repository_selection_installation_mismatch",
    );
    expect(selectRows(`user_id = '${first.userId}'`)[0]).toEqual(before);
  });

  it("deletes only the current user's row and remains idempotent", async () => {
    const identities = [
      createUserWithInstallation(7),
      createUserWithInstallation(8),
    ];
    const writer = createWriter();
    for (const identity of identities) {
      await writer.ensureSelected({
        ...identity,
        repository: repository(9_600_007),
      });
    }

    await writer.removeSelection({
      userId: identities[0]!.userId,
      repositoryId: 9_600_007,
    });
    await writer.removeSelection({
      userId: identities[0]!.userId,
      repositoryId: 9_600_007,
    });

    expect(selectRows("github_repository_id = 9600007")).toEqual([
      expect.objectContaining({ user_id: identities[1]!.userId }),
    ]);
  });

  it("changes only Selection rows and leaves prior identity and Installation state byte-for-byte unchanged", async () => {
    const identity = createUserWithInstallation(9);
    const writer = createWriter();
    const before = snapshotExistingIdentityAndInstallationRows(
      identity.userId,
    );

    await writer.ensureSelected({
      ...identity,
      repository: repository(9_600_009),
    });
    expect(selectRows(`user_id = '${identity.userId}'`)).toHaveLength(1);
    expect(
      snapshotExistingIdentityAndInstallationRows(identity.userId),
    ).toBe(before);

    await writer.removeSelection({
      userId: identity.userId,
      repositoryId: 9_600_009,
    });
    expect(selectRows(`user_id = '${identity.userId}'`)).toHaveLength(0);
    expect(
      snapshotExistingIdentityAndInstallationRows(identity.userId),
    ).toBe(before);
  });
});
