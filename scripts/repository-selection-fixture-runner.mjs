import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const hostname = "127.0.0.1";
const appPort = 3004;
const fixturePort = 54334;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const authUserId = "15111111-1111-4111-8111-111111111111";
const githubUserId = 7_150_001;
const githubInstallationId =
  "15222222-2222-4222-8222-222222222222";
const installationId = 8_150_001;
const fixtureTimestamp = "2026-07-29T00:00:00.000Z";
const fixtureToken = "fixture-opaque-installation-token";
const originalFetch = globalThis.fetch.bind(globalThis);
let installationStatus = "active";
let removedAfterLoad = false;
let selectionReadCalls = 0;
let selectionWriteCalls = 0;
let selectionDeleteCalls = 0;
let tokenCreateCalls = 0;
let repositoryPageCalls = 0;
let tokenRevokeCalls = 0;
let forbiddenEndpointCalls = 0;

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const syntheticAccessToken = [
  base64Url({ alg: "HS256", typ: "JWT" }),
  base64Url({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: `http://${hostname}:${fixturePort}/auth/v1`,
    role: "authenticated",
    sub: authUserId,
  }),
  "fixture-only-signature",
].join(".");

const syntheticUser = {
  id: authUserId,
  aud: "authenticated",
  role: "authenticated",
  email: "repository-selection-fixture@example.invalid",
  email_confirmed_at: fixtureTimestamp,
  phone: "",
  confirmed_at: fixtureTimestamp,
  last_sign_in_at: fixtureTimestamp,
  app_metadata: { provider: "github", providers: ["github"] },
  user_metadata: { fixture_only: true },
  identities: [
    {
      identity_id: "15333333-3333-4333-8333-333333333333",
      id: String(githubUserId),
      user_id: authUserId,
      provider_id: String(githubUserId),
      identity_data: {
        user_name: "synthetic-selection-user",
        avatar_url:
          "https://avatars.example.invalid/synthetic-selection-user",
        fixture_only: true,
      },
      provider: "github",
      email: "repository-selection-fixture@example.invalid",
      created_at: fixtureTimestamp,
      last_sign_in_at: fixtureTimestamp,
      updated_at: fixtureTimestamp,
    },
  ],
  created_at: fixtureTimestamp,
  updated_at: fixtureTimestamp,
  is_anonymous: false,
};

function sessionPayload() {
  return {
    access_token: syntheticAccessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "synthetic-selection-refresh-token",
    user: syntheticUser,
  };
}

const githubRepositories = [
  {
    id: 701,
    name: "restored-repository",
    full_name: "synthetic-owner/restored-repository",
    owner: { login: "synthetic-owner" },
    private: true,
    fork: false,
    archived: false,
    disabled: false,
    visibility: "private",
    default_branch: "main",
  },
  {
    id: 702,
    name: "selectable-repository",
    full_name: "synthetic-owner/selectable-repository",
    owner: { login: "synthetic-owner" },
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    visibility: "public",
    default_branch: "trunk",
  },
  {
    id: 703,
    name: "removed-after-load",
    full_name: "synthetic-owner/removed-after-load",
    owner: { login: "synthetic-owner" },
    private: false,
    fork: true,
    archived: true,
    disabled: false,
    visibility: "public",
    default_branch: "main",
  },
];

function selectionRow(repository, timestamps = {}) {
  return {
    id:
      repository.id === 701
        ? "15444444-4444-4444-8444-444444444441"
        : "15444444-4444-4444-8444-444444444442",
    user_id: authUserId,
    github_installation_id: githubInstallationId,
    github_repository_id: repository.id,
    owner_login: repository.owner.login,
    name: repository.name,
    full_name: repository.full_name,
    visibility: repository.visibility,
    is_private: repository.private,
    is_fork: repository.fork,
    is_archived: repository.archived,
    is_disabled: repository.disabled,
    default_branch: repository.default_branch,
    selected_at: timestamps.selected_at ?? fixtureTimestamp,
    created_at: timestamps.created_at ?? fixtureTimestamp,
    updated_at: timestamps.updated_at ?? fixtureTimestamp,
  };
}

let selectedRows = [selectionRow(githubRepositories[0])];

function selectionProjection(row) {
  return {
    github_repository_id: row.github_repository_id,
    owner_login: row.owner_login,
    name: row.name,
    full_name: row.full_name,
    visibility: row.visibility,
    is_private: row.is_private,
    is_fork: row.is_fork,
    is_archived: row.is_archived,
    is_disabled: row.is_disabled,
    default_branch: row.default_branch,
    selected_at: row.selected_at,
    updated_at: row.updated_at,
  };
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    request.on("error", reject);
  });
}

function installationResponse(select) {
  if (select === "status") {
    return [{ status: installationStatus }];
  }
  if (select.includes("id,installation_id,status")) {
    return [
      {
        id: githubInstallationId,
        installation_id: installationId,
        status: installationStatus,
      },
    ];
  }
  return [
    {
      installation_id: installationId,
      repository_selection: "selected",
      status: installationStatus,
    },
  ];
}

function createFixtureServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${hostname}:${fixturePort}`,
    );

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/auth/v1/authorize"
    ) {
      const redirectTo = requestUrl.searchParams.get("redirect_to");
      if (!redirectTo) {
        writeJson(response, 400, { error: "missing_redirect_to" });
        return;
      }
      const callback = new URL(redirectTo);
      callback.searchParams.set("code", "synthetic-selection-code");
      response.writeHead(302, { location: callback.toString() });
      response.end();
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/auth/v1/token"
    ) {
      await readBody(request);
      writeJson(response, 200, sessionPayload());
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/auth/v1/user"
    ) {
      writeJson(response, 200, syntheticUser);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/rest/v1/rpc/ensure_user_identity"
    ) {
      await readBody(request);
      writeJson(response, 200, authUserId);
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/rest/v1/github_installations"
    ) {
      writeJson(
        response,
        200,
        installationResponse(requestUrl.searchParams.get("select") ?? ""),
      );
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/rest/v1/selected_repositories"
    ) {
      selectionReadCalls += 1;
      writeJson(response, 200, selectedRows.map(selectionProjection));
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/ensure_selected_github_repository"
    ) {
      const body = JSON.parse(await readBody(request));
      const repository = githubRepositories.find(
        (candidate) => candidate.id === body.p_github_repository_id,
      );
      if (
        !repository ||
        body.p_user_id !== authUserId ||
        body.p_github_installation_id !== githubInstallationId
      ) {
        writeJson(response, 400, {
          message: "github_repository_selection_storage_failed",
        });
        return;
      }
      const existing = selectedRows.find(
        (row) => row.github_repository_id === repository.id,
      );
      const row = selectionRow(repository, {
        selected_at: existing?.selected_at ?? fixtureTimestamp,
        created_at: existing?.created_at ?? fixtureTimestamp,
        updated_at: new Date().toISOString(),
      });
      selectedRows = [
        ...selectedRows.filter(
          (candidate) =>
            candidate.github_repository_id !== repository.id,
        ),
        row,
      ];
      selectionWriteCalls += 1;
      writeJson(response, 200, row);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/remove_selected_github_repository"
    ) {
      const body = JSON.parse(await readBody(request));
      const before = selectedRows.length;
      selectedRows = selectedRows.filter(
        (row) =>
          !(
            body.p_user_id === authUserId &&
            row.github_repository_id === body.p_github_repository_id
          ),
      );
      if (selectedRows.length !== before) selectionDeleteCalls += 1;
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/__fixture/remove-repository"
    ) {
      removedAfterLoad = true;
      writeJson(response, 200, { removed: true });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/__fixture/revoke"
    ) {
      installationStatus = "revoked";
      writeJson(response, 200, { status: installationStatus });
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/__fixture/state"
    ) {
      writeJson(response, 200, {
        fixture_id: "refresh_restores_selection",
        fixture_version: "1.0.0",
        source_type: "synthetic",
        contains_real_secret: false,
        real_github_called: false,
        selection_read_calls: selectionReadCalls,
        selection_write_calls: selectionWriteCalls,
        selection_delete_calls: selectionDeleteCalls,
        selected_repository_count: selectedRows.length,
        token_create_calls: tokenCreateCalls,
        repository_page_calls: repositoryPageCalls,
        token_revoke_calls: tokenRevokeCalls,
        forbidden_endpoint_calls: forbiddenEndpointCalls,
        project_created: false,
        sync_started: false,
      });
      return;
    }

    writeJson(response, 404, { error: "fixture_route_not_found" });
  });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL
      ? input.toString()
      : input.url,
  );

  if (url.origin !== "https://api.github.com") {
    return originalFetch(input, init);
  }

  if (
    init?.method === "POST" &&
    url.pathname ===
      `/app/installations/${installationId}/access_tokens`
  ) {
    tokenCreateCalls += 1;
    return new Response(
      JSON.stringify({
        token: fixtureToken,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        repository_selection: "selected",
        permissions: { metadata: "read" },
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (
    init?.method === "GET" &&
    url.pathname === "/installation/repositories"
  ) {
    repositoryPageCalls += 1;
    const repositories = removedAfterLoad
      ? githubRepositories.filter((repository) => repository.id !== 703)
      : githubRepositories;
    return new Response(
      JSON.stringify({
        total_count: repositories.length,
        repositories,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (
    init?.method === "DELETE" &&
    url.pathname === "/installation/token"
  ) {
    tokenRevokeCalls += 1;
    return new Response(null, { status: 204 });
  }

  forbiddenEndpointCalls += 1;
  return new Response(
    JSON.stringify({ message: "forbidden_fixture_endpoint" }),
    { status: 500 },
  );
};

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(port, hostname);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

function runPlaywright() {
  const require = createRequire(import.meta.url);
  const playwrightPackage = require.resolve(
    "@playwright/test/package.json",
  );
  const playwrightCli = path.join(
    path.dirname(playwrightPackage),
    "cli.js",
  );
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--config=playwright.repository-selection-fixture.config.ts",
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        E2E_LIFECYCLE_MANAGED_SERVER: "1",
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright exited from ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

for (const variableName of [
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
]) {
  delete process.env[variableName];
}

const syntheticKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.APP_ORIGIN = `http://${hostname}:${appPort}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${hostname}:${fixturePort}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-only-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "fixture-only-service-role-key";
process.env.GITHUB_APP_ID = "9150001";
process.env.GITHUB_APP_SLUG = "executor-selection-fixture";
process.env.GITHUB_APP_PRIVATE_KEY = syntheticKeyPair.privateKey;
process.env.GITHUB_REST_API_VERSION = "2026-03-10";

const fixtureServer = createFixtureServer();
const app = next({
  dev: true,
  dir: projectRoot,
  hostname,
  port: appPort,
  turbopack: true,
});
let appServer;

try {
  await listen(fixtureServer, fixturePort);
  await app.prepare();
  appServer = createServer((request, response) => {
    app.getRequestHandler()(request, response).catch(() => {
      response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });
  appServer.on("upgrade", app.getUpgradeHandler());
  await listen(appServer, appPort);
  process.exitCode = await runPlaywright();
} finally {
  await closeServer(appServer);
  await app.close();
  await closeServer(fixtureServer);
  globalThis.fetch = originalFetch;
}

process.exit(process.exitCode ?? 1);
