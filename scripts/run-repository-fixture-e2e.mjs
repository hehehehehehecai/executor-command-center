import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

if (process.env.NODE_ENV === "production") {
  console.error("repository_fixture_forbidden_in_production");
  process.exit(1);
}

const hostname = "127.0.0.1";
const appPort = 3003;
const fixturePort = 54333;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const authUserId = "11111111-1111-4111-8111-111111111111";
const githubUserId = 71001;
const installationId = 81001;
const fixtureTimestamp = "2026-07-27T00:00:00.000Z";
const opaqueFixtureToken = "fixture::opaque::future-format";
const originalFetch = globalThis.fetch.bind(globalThis);
let installationQueryCalls = 0;
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
  email: "repository-fixture@example.invalid",
  email_confirmed_at: fixtureTimestamp,
  phone: "",
  confirmed_at: fixtureTimestamp,
  last_sign_in_at: fixtureTimestamp,
  app_metadata: { provider: "github", providers: ["github"] },
  user_metadata: { fixture_only: true },
  identities: [
    {
      identity_id: "33333333-3333-4333-8333-333333333333",
      id: String(githubUserId),
      user_id: authUserId,
      provider_id: String(githubUserId),
      identity_data: {
        user_name: "synthetic-repository-user",
        avatar_url:
          "https://avatars.example.invalid/synthetic-repository-user",
        fixture_only: true,
      },
      provider: "github",
      email: "repository-fixture@example.invalid",
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
    refresh_token: "synthetic-not-a-real-refresh-token",
    user: syntheticUser,
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
      callback.searchParams.set("code", "synthetic-callback-code");
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
      const body = JSON.parse(await readBody(request));
      if (
        body.p_auth_user_id !== authUserId ||
        body.p_github_user_id !== githubUserId
      ) {
        writeJson(response, 400, {
          message: "invalid_fixture_identity",
        });
        return;
      }
      writeJson(response, 200, authUserId);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/read_current_github_installation"
    ) {
      installationQueryCalls += 1;
      const body = JSON.parse(await readBody(request));
      writeJson(
        response,
        200,
        body.p_user_id === authUserId
          ? [
              {
                installation_id: installationId,
                repository_selection: "selected",
                status: "active",
              },
            ]
          : [],
      );
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/rest/v1/github_installations"
    ) {
      installationQueryCalls += 1;
      const select = requestUrl.searchParams.get("select") ?? "";
      writeJson(
        response,
        200,
        select.includes("installation_id")
          ? [
              {
                installation_id: installationId,
                repository_selection: "selected",
                status: "active",
              },
            ]
          : [{ status: "active" }],
      );
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/__fixture/state"
    ) {
      writeJson(response, 200, {
        fixture_id: "active_private_repository",
        fixture_version: "1.0.0",
        source_type: "synthetic",
        contains_real_secret: false,
        real_github_called: false,
        real_private_key_used: false,
        real_app_jwt_used: false,
        real_installation_token_used: false,
        installation_query_calls: installationQueryCalls,
        token_create_calls: tokenCreateCalls,
        repository_page_calls: repositoryPageCalls,
        token_revoke_calls: tokenRevokeCalls,
        forbidden_endpoint_calls: forbiddenEndpointCalls,
        repository_write_calls: 0,
        installation_update_calls: 0,
        repository_list_persisted: false,
        selected_repositories: "none",
        projects: "none",
        token_created: tokenCreateCalls === 1,
        revocation_attempted: tokenRevokeCalls === 1,
        token_revoked: tokenRevokeCalls === 1,
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
    const body = JSON.parse(String(init.body));
    const headers = new Headers(init.headers);
    if (
      headers.get("accept") !== "application/vnd.github+json" ||
      headers.get("x-github-api-version") !== "2026-03-10" ||
      !headers.get("authorization")?.startsWith("Bearer ") ||
      JSON.stringify(body) !==
        JSON.stringify({ permissions: { metadata: "read" } }) ||
      "repositories" in body ||
      "repository_ids" in body
    ) {
      return new Response(
        JSON.stringify({ message: "invalid_token_request" }),
        { status: 400 },
      );
    }
    tokenCreateCalls += 1;
    return new Response(
      JSON.stringify({
        token: opaqueFixtureToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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
    url.pathname === "/installation/repositories" &&
    url.searchParams.get("per_page") === "100" &&
    url.searchParams.get("page") === "1" &&
    new Headers(init.headers).get("authorization") ===
      `Bearer ${opaqueFixtureToken}`
  ) {
    repositoryPageCalls += 1;
    return new Response(
      JSON.stringify({
        total_count: 2,
        repositories: [
          {
            id: 701,
            name: "synthetic-private-repository",
            full_name:
              "synthetic-owner/synthetic-private-repository",
            owner: { login: "synthetic-owner" },
            private: true,
            fork: false,
            archived: true,
            disabled: false,
            visibility: "private",
            default_branch: "trunk",
          },
          {
            id: 702,
            name: "synthetic-public-repository",
            full_name:
              "synthetic-owner/synthetic-public-repository",
            owner: { login: "synthetic-owner" },
            private: false,
            fork: false,
            archived: false,
            disabled: false,
            visibility: "public",
            default_branch: "main",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (
    init?.method === "DELETE" &&
    url.pathname === "/installation/token" &&
    new Headers(init.headers).get("authorization") ===
      `Bearer ${opaqueFixtureToken}`
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
      "--config=playwright.repository-fixture.config.ts",
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
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-service-role-key";
process.env.GITHUB_APP_ID = "900001";
process.env.GITHUB_APP_SLUG = "executor-fixture-app";
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
