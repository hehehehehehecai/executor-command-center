import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

if (process.env.NODE_ENV === "production") {
  console.error("auth_fixture_forbidden_in_production");
  process.exit(1);
}

const hostname = "127.0.0.1";
const appPort = 3000;
const fixturePort = 54322;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const authUserId = "11111111-1111-4111-8111-111111111111";
const internalUserId = "22222222-2222-4222-8222-222222222222";
const fixtureTimestamp = "2026-07-22T00:00:00.000Z";
let identityEnsureCalls = 0;

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
  email: "fixture-user@example.invalid",
  email_confirmed_at: fixtureTimestamp,
  phone: "",
  confirmed_at: fixtureTimestamp,
  last_sign_in_at: fixtureTimestamp,
  app_metadata: { provider: "github", providers: ["github"] },
  user_metadata: { fixture_only: true },
  identities: [
    {
      identity_id: "33333333-3333-4333-8333-333333333333",
      id: "12345678",
      user_id: authUserId,
      provider_id: "12345678",
      identity_data: {
        user_name: "octo-fixture",
        avatar_url: "https://avatars.example.test/synthetic/12345678",
        fixture_only: true,
      },
      provider: "github",
      email: "fixture-user@example.invalid",
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
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function createFixtureServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${hostname}:${fixturePort}`,
    );

    if (request.method === "GET" && requestUrl.pathname === "/auth/v1/authorize") {
      const redirectTo = requestUrl.searchParams.get("redirect_to");
      if (!redirectTo) return writeJson(response, 400, { error: "missing_redirect_to" });
      const callback = new URL(redirectTo);
      callback.searchParams.set("code", "synthetic-callback-code");
      response.writeHead(302, { location: callback.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/auth/v1/token") {
      await readBody(request);
      writeJson(response, 200, sessionPayload());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/auth/v1/user") {
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
        body.p_github_user_id !== 12345678 ||
        body.p_github_login !== "octo-fixture"
      ) {
        writeJson(response, 400, { message: "invalid_fixture_identity" });
        return;
      }
      identityEnsureCalls += 1;
      writeJson(response, 200, internalUserId);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/__fixture/state") {
      writeJson(response, 200, {
        fixture_id: "valid_github_auth_user",
        fixture_version: "1.0.0",
        source_type: "synthetic",
        provider: "github",
        contains_real_secret: false,
        real_github_called: false,
        real_private_data_used: false,
        provider_token_persisted: false,
        installation_created: false,
        repository_access: "none",
        internal_user_count: identityEnsureCalls > 0 ? 1 : 0,
        identity_ensure_calls: identityEnsureCalls,
      });
      return;
    }

    writeJson(response, 404, { error: "fixture_route_not_found" });
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(port, hostname);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) return resolve();
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

function runPlaywright() {
  const require = createRequire(import.meta.url);
  const playwrightPackage = require.resolve("@playwright/test/package.json");
  const playwrightCli = path.join(path.dirname(playwrightPackage), "cli.js");
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--config=playwright.auth-fixture.config.ts"],
    {
      cwd: projectRoot,
      env: { ...process.env, E2E_LIFECYCLE_MANAGED_SERVER: "1" },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      signal ? reject(new Error(`Playwright exited from ${signal}`)) : resolve(code ?? 1),
    );
  });
}

for (const variableName of [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
]) {
  delete process.env[variableName];
}

process.env.APP_ORIGIN = `http://${hostname}:${appPort}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${hostname}:${fixturePort}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-only-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-service-role-key";

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
}

process.exit(process.exitCode ?? 1);
