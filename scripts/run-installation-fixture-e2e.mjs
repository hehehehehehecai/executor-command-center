import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

if (process.env.NODE_ENV === "production") {
  console.error("installation_fixture_forbidden_in_production");
  process.exit(1);
}

const hostname = "127.0.0.1";
const appPort = 3002;
const fixturePort = 54332;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const authUserId = "11111111-1111-4111-8111-111111111111";
const internalUserId = authUserId;
const githubUserId = 71001;
const githubAppId = 900001;
const installationId = 81001;
const installationRecordId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixtureTimestamp = "2026-07-23T00:00:00.000Z";
const originalFetch = globalThis.fetch.bind(globalThis);
const states = new Map();
let identityEnsureCalls = 0;
let stateCreateCalls = 0;
let stateConsumeCalls = 0;
let installationRegisterCalls = 0;
let githubApiCalls = 0;
let repositoryApiCalls = 0;
let accessTokenCalls = 0;
let installationRecord = null;
let githubSnapshotAccountType = "User";

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
  email: "installation-fixture@example.invalid",
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
        user_name: "synthetic-installation-user",
        avatar_url:
          "https://avatars.example.invalid/synthetic-installation-user",
        fixture_only: true,
      },
      provider: "github",
      email: "installation-fixture@example.invalid",
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
      identityEnsureCalls += 1;
      writeJson(response, 200, internalUserId);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/create_github_installation_state"
    ) {
      const body = JSON.parse(await readBody(request));
      if (
        body.p_user_id !== authUserId ||
        !/^[0-9a-f]{64}$/.test(body.p_state_hash) ||
        !String(body.p_return_to).startsWith("/")
      ) {
        writeJson(response, 400, {
          message: "invalid_fixture_installation_state",
        });
        return;
      }
      stateCreateCalls += 1;
      states.set(body.p_state_hash, {
        userId: body.p_user_id,
        returnTo: body.p_return_to,
        consumed: false,
        expiresAt: new Date(body.p_expires_at).getTime(),
      });
      writeJson(
        response,
        200,
        `bbbbbbbb-bbbb-4bbb-8bbb-${String(stateCreateCalls).padStart(12, "0")}`,
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/consume_github_installation_state"
    ) {
      const body = JSON.parse(await readBody(request));
      const state = states.get(body.p_state_hash);
      if (!state) {
        writeJson(
          response,
          404,
          { code: "P0002", message: "installation_state_invalid" },
        );
        return;
      }
      if (state.userId !== body.p_user_id) {
        writeJson(
          response,
          400,
          { code: "P0001", message: "installation_state_wrong_user" },
        );
        return;
      }
      if (state.consumed) {
        writeJson(
          response,
          400,
          { code: "P0001", message: "installation_state_replayed" },
        );
        return;
      }
      if (state.expiresAt <= Date.now()) {
        writeJson(
          response,
          400,
          { code: "P0001", message: "installation_state_expired" },
        );
        return;
      }
      state.consumed = true;
      stateConsumeCalls += 1;
      writeJson(response, 200, state.returnTo);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/read_current_github_identity"
    ) {
      const body = JSON.parse(await readBody(request));
      writeJson(
        response,
        200,
        body.p_user_id === internalUserId ? githubUserId : null,
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/register_verified_github_installation"
    ) {
      const body = JSON.parse(await readBody(request));
      if (
        body.p_user_id !== authUserId ||
        body.p_installation_id !== installationId ||
        body.p_github_account_id !== githubUserId ||
        body.p_account_type !== "User"
      ) {
        writeJson(response, 400, {
          message: "invalid_fixture_registration",
        });
        return;
      }
      installationRegisterCalls += 1;
      installationRecord = {
        id: installationRecordId,
        status: body.p_status,
      };
      writeJson(response, 200, installationRecordId);
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/rest/v1/github_installations"
    ) {
      writeJson(
        response,
        200,
        installationRecord ? [{ status: installationRecord.status }] : [],
      );
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/__fixture/state"
    ) {
      writeJson(response, 200, {
        fixture_id: "valid_active_personal_installation",
        fixture_version: "1.0.0",
        source_type: "synthetic",
        contains_real_secret: false,
        synthetic_key_label:
          "synthetic-test-key fixture-only not-for-production",
        real_github_called: false,
        real_private_key_used: false,
        real_installation_used: false,
        identity_ensure_calls: identityEnsureCalls,
        state_create_calls: stateCreateCalls,
        state_consume_calls: stateConsumeCalls,
        installation_register_calls: installationRegisterCalls,
        installation_record_count: installationRecord ? 1 : 0,
        github_installation_api_calls: githubApiCalls,
        repository_api_calls: repositoryApiCalls,
        installation_access_token_calls: accessTokenCalls,
        installation_state: installationRecord?.status ?? "not_registered",
        repository_access: "not_loaded",
        selected_repositories: "none",
        projects: "none",
      });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/__fixture/github-account-type"
    ) {
      const body = JSON.parse(await readBody(request));
      if (!["User", "Organization"].includes(body.account_type)) {
        writeJson(response, 400, { error: "invalid_fixture_account_type" });
        return;
      }
      githubSnapshotAccountType = body.account_type;
      writeJson(response, 200, { account_type: githubSnapshotAccountType });
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

  if (url.origin === "https://api.github.com") {
    if (
      init?.method === "GET" &&
      url.pathname === `/app/installations/${installationId}`
    ) {
      githubApiCalls += 1;
      return new Response(
        JSON.stringify({
          id: installationId,
          app_id: githubAppId,
          account: {
            id: githubUserId,
            login: "synthetic-installation-user",
            type: githubSnapshotAccountType,
          },
          repository_selection: "selected",
          suspended_at: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.pathname.includes("repositories")) {
      repositoryApiCalls += 1;
    }
    if (url.pathname.includes("access_tokens")) {
      accessTokenCalls += 1;
    }
    return new Response(
      JSON.stringify({ message: "unexpected_fixture_github_endpoint" }),
      { status: 500 },
    );
  }

  return originalFetch(input, init);
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
  const playwrightPackage = require.resolve("@playwright/test/package.json");
  const playwrightCli = path.join(
    path.dirname(playwrightPackage),
    "cli.js",
  );
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--config=playwright.installation-fixture.config.ts",
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
process.env.GITHUB_APP_ID = String(githubAppId);
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
