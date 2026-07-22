import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SupabaseIdentityRpcClient } from "../../../src/infrastructure/auth/supabase-identity-rpc-client";
import { SupabaseUserRepository } from "../../../src/infrastructure/auth/supabase-user-repository";

type LocalSupabaseConfiguration = {
  readonly anonKey: string;
  readonly apiUrl: string;
  readonly jwtSecret: string;
  readonly serviceRoleKey: string;
};

type TestAuthUser = { readonly id: string };
type UserRow = { readonly id: string };
type GitHubIdentityRow = {
  readonly user_id: string;
  readonly github_user_id: number;
  readonly github_login: string;
  readonly avatar_url: string | null;
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

  if (result.status !== 0) {
    throw new Error("local_supabase_status_unavailable");
  }

  const values = Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2]?.replace(/"$/, "")]),
  );
  const anonKey = values.ANON_KEY;
  const apiUrl = values.API_URL;
  const jwtSecret = values.JWT_SECRET;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;

  if (!anonKey || !apiUrl || !jwtSecret || !serviceRoleKey) {
    throw new Error("local_supabase_credentials_unavailable");
  }

  return { anonKey, apiUrl, jwtSecret, serviceRoleKey };
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
}

function encodeJwtPart(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("SupabaseUserRepository with Local Supabase", () => {
  let configuration: LocalSupabaseConfiguration;
  const authUserIds = new Set<string>();

  beforeAll(() => {
    configuration = readLocalSupabaseConfiguration();
  });

  function createAuthUser(id = randomUUID()) {
    const email = `identity-${id}@example.test`;

    executeLocalSql(`
      insert into auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        '${id}',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        '${email}',
        '',
        now(),
        '{}'::jsonb,
        '{}'::jsonb,
        now(),
        now()
      )
    `);

    authUserIds.add(id);
    return { id } satisfies TestAuthUser;
  }

  function createAccessToken(user: TestAuthUser) {
    const now = Math.floor(Date.now() / 1000);
    const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
    const payload = encodeJwtPart({
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      iss: "supabase-demo",
      role: "authenticated",
      sub: user.id,
    });
    const signature = createHmac("sha256", configuration.jwtSecret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    return `${header}.${payload}.${signature}`;
  }

  async function selectRows<T>(
    table: string,
    query: string,
    accessToken: string,
  ): Promise<T[]> {
    const response = await fetch(
      `${configuration.apiUrl}/rest/v1/${table}?${query}`,
      {
        method: "GET",
        headers: {
          apikey: configuration.anonKey,
          authorization: `Bearer ${accessToken}`,
        },
      },
    );

    expect(response.status).toBe(200);
    return (await response.json()) as T[];
  }

  function createRepository() {
    return new SupabaseUserRepository(
      new SupabaseIdentityRpcClient({
        supabaseUrl: configuration.apiUrl,
        serviceRoleKey: configuration.serviceRoleKey,
      }),
    );
  }

  afterEach(() => {
    for (const authUserId of authUserIds) {
      executeLocalSql(`delete from auth.users where id = '${authUserId}'`);
    }
    authUserIds.clear();
  });

  it("fulfills every concurrent ensure for the same exact identity", async () => {
    const concurrencyWidth = 8;
    const iterationCount = 3;
    const reports = [];

    for (let iteration = 1; iteration <= iterationCount; iteration += 1) {
      const authUser = createAuthUser(
        `c1000000-0000-4000-8000-${String(iteration).padStart(12, "0")}`,
      );
      const githubUserId = 8_100_000_000 + iteration;
      const repository = createRepository();
      const results = await Promise.allSettled(
        Array.from({ length: concurrencyWidth }, () =>
          repository.ensureForAuthUser({
            authUserId: authUser.id,
            githubUserId,
            githubLogin: "concurrent-identity",
            avatarUrl: "https://avatars.example.test/concurrent.png",
          }),
        ),
      );
      const serialResult = await repository.ensureForAuthUser({
        authUserId: authUser.id,
        githubUserId,
        githubLogin: "concurrent-identity-refreshed",
        avatarUrl: null,
      });
      const accessToken = createAccessToken(authUser);
      const [users, identities] = await Promise.all([
        selectRows<UserRow>(
          "users",
          `select=id&id=eq.${authUser.id}`,
          accessToken,
        ),
        selectRows<GitHubIdentityRow>(
          "github_identities",
          `select=user_id,github_user_id,github_login,avatar_url&user_id=eq.${authUser.id}`,
          accessToken,
        ),
      ]);
      const outcomes = results.map((result, requestIndex) => {
        if (result.status === "fulfilled") {
          return {
            requestIndex,
            status: result.status,
            returnedUserId: result.value.userId,
          };
        }

        const errorCode =
          typeof result.reason === "object" &&
          result.reason !== null &&
          "code" in result.reason &&
          typeof result.reason.code === "string"
            ? result.reason.code
            : null;

        return {
          requestIndex,
          status: result.status,
          errorType:
            result.reason instanceof Error
              ? result.reason.name
              : typeof result.reason,
          errorCode,
        };
      });
      const fulfilledUserIds = outcomes.flatMap((outcome) =>
        outcome.status === "fulfilled" ? [outcome.returnedUserId] : [],
      );

      reports.push({
        iteration,
        authUserId: authUser.id,
        githubUserId,
        fulfilledCount: fulfilledUserIds.length,
        rejectedCount: outcomes.length - fulfilledUserIds.length,
        distinctUserIds: [...new Set(fulfilledUserIds)],
        serialUserId: serialResult.userId,
        usersCount: users.length,
        identitiesCount: identities.length,
        outcomes,
      });
    }

    expect(reports, JSON.stringify(reports, null, 2)).toMatchObject(
      reports.map((report) => ({
        fulfilledCount: concurrencyWidth,
        rejectedCount: 0,
        distinctUserIds: [report.authUserId],
        serialUserId: report.authUserId,
        usersCount: 1,
        identitiesCount: 1,
      })),
    );
  });

  it("allows only one concurrent GitHub binding for the same Auth user", async () => {
    const authUser = createAuthUser(
      "d1000000-0000-4000-8000-000000000001",
    );
    const repository = createRepository();
    const githubUserIds = [8_200_000_001, 8_200_000_002] as const;
    const results = await Promise.allSettled(
      githubUserIds.map((githubUserId) =>
        repository.ensureForAuthUser({
          authUserId: authUser.id,
          githubUserId,
          githubLogin: `same-auth-${githubUserId}`,
          avatarUrl: null,
        }),
      ),
    );
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ userId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toEqual([
      expect.objectContaining({ value: { userId: authUser.id } }),
    ]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      expect.objectContaining({ code: "auth_user_already_bound" }),
    );

    const accessToken = createAccessToken(authUser);
    const identities = await selectRows<GitHubIdentityRow>(
      "github_identities",
      `select=user_id,github_user_id,github_login,avatar_url&user_id=eq.${authUser.id}`,
      accessToken,
    );

    expect(identities).toHaveLength(1);
    expect(githubUserIds).toContain(identities[0]?.github_user_id);
  });

  it("allows only one Auth user to concurrently claim a GitHub identity", async () => {
    const authUsers = [
      createAuthUser("e1000000-0000-4000-8000-000000000001"),
      createAuthUser("e1000000-0000-4000-8000-000000000002"),
    ] as const;
    const repository = createRepository();
    const githubUserId = 8_300_000_001;
    const results = await Promise.allSettled(
      authUsers.map((authUser) =>
        repository.ensureForAuthUser({
          authUserId: authUser.id,
          githubUserId,
          githubLogin: "shared-github-identity",
          avatarUrl: null,
        }),
      ),
    );
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ userId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      expect.objectContaining({ code: "github_user_already_bound" }),
    );

    const winningUserId = fulfilled[0]?.value.userId;
    const winningUser = authUsers.find((user) => user.id === winningUserId);
    const losingUser = authUsers.find((user) => user.id !== winningUserId);

    expect(winningUser).toBeDefined();
    expect(losingUser).toBeDefined();

    const winnerAccessToken = createAccessToken(winningUser as TestAuthUser);
    const loserAccessToken = createAccessToken(losingUser as TestAuthUser);
    const [winnerIdentities, loserUsers] = await Promise.all([
      selectRows<GitHubIdentityRow>(
        "github_identities",
        `select=user_id,github_user_id,github_login,avatar_url&github_user_id=eq.${githubUserId}`,
        winnerAccessToken,
      ),
      selectRows<UserRow>(
        "users",
        `select=id&id=eq.${losingUser?.id}`,
        loserAccessToken,
      ),
    ]);

    expect(winnerIdentities).toEqual([
      expect.objectContaining({
        user_id: winningUserId,
        github_user_id: githubUserId,
      }),
    ]);
    expect(loserUsers).toEqual([]);
  });

  it("creates once, returns the Auth UUID, and refreshes display fields in place", async () => {
    const authUser = await createAuthUser();
    const repository = createRepository();
    const githubUserId = 8_000_000_001;

    const first = await repository.ensureForAuthUser({
      authUserId: authUser.id,
      githubUserId,
      githubLogin: "integration-user",
      avatarUrl: null,
    });
    const second = await repository.ensureForAuthUser({
      authUserId: authUser.id,
      githubUserId,
      githubLogin: "integration-user-renamed",
      avatarUrl: "https://avatars.example.test/integration.png",
    });

    expect(first).toEqual({ userId: authUser.id });
    expect(second).toEqual(first);
    expect(first.userId).not.toBe(String(githubUserId));
    const accessToken = createAccessToken(authUser);
    await expect(
      selectRows<UserRow>(
        "users",
        `select=id&id=eq.${authUser.id}`,
        accessToken,
      ),
    ).resolves.toEqual([{ id: authUser.id }]);
    await expect(
      selectRows<GitHubIdentityRow>(
        "github_identities",
        `select=user_id,github_user_id,github_login,avatar_url&user_id=eq.${authUser.id}`,
        accessToken,
      ),
    ).resolves.toEqual([
      {
        user_id: authUser.id,
        github_user_id: githubUserId,
        github_login: "integration-user-renamed",
        avatar_url: "https://avatars.example.test/integration.png",
      },
    ]);
  });

  it("rejects GitHub identity takeover without leaving an orphan user", async () => {
    const owner = await createAuthUser();
    const contender = await createAuthUser();
    const repository = createRepository();
    const githubUserId = 8_000_000_002;

    await repository.ensureForAuthUser({
      authUserId: owner.id,
      githubUserId,
      githubLogin: "identity-owner",
      avatarUrl: null,
    });

    await expect(
      repository.ensureForAuthUser({
        authUserId: contender.id,
        githubUserId,
        githubLogin: "identity-contender",
        avatarUrl: null,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "github_user_already_bound",
      }),
    );
    const contenderAccessToken = createAccessToken(contender);
    const ownerAccessToken = createAccessToken(owner);
    await expect(
      selectRows<UserRow>(
        "users",
        `select=id&id=eq.${contender.id}`,
        contenderAccessToken,
      ),
    ).resolves.toEqual([]);
    await expect(
      selectRows<GitHubIdentityRow>(
        "github_identities",
        `select=user_id,github_user_id,github_login,avatar_url&github_user_id=eq.${githubUserId}`,
        ownerAccessToken,
      ),
    ).resolves.toEqual([
      {
        user_id: owner.id,
        github_user_id: githubUserId,
        github_login: "identity-owner",
        avatar_url: null,
      },
    ]);
  });

  it("rejects silent GitHub identity switching and preserves the original binding", async () => {
    const authUser = await createAuthUser();
    const repository = createRepository();

    await repository.ensureForAuthUser({
      authUserId: authUser.id,
      githubUserId: 8_000_000_003,
      githubLogin: "original-identity",
      avatarUrl: null,
    });

    await expect(
      repository.ensureForAuthUser({
        authUserId: authUser.id,
        githubUserId: 8_000_000_004,
        githubLogin: "replacement-identity",
        avatarUrl: null,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "auth_user_already_bound",
      }),
    );
    const accessToken = createAccessToken(authUser);
    const identities = await selectRows<GitHubIdentityRow>(
      "github_identities",
      `select=user_id,github_user_id,github_login,avatar_url&user_id=eq.${authUser.id}`,
      accessToken,
    );

    expect(identities).toEqual([
      {
        user_id: authUser.id,
        github_user_id: 8_000_000_003,
        github_login: "original-identity",
        avatar_url: null,
      },
    ]);
  });
});
