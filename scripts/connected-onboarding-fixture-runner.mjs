import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

import { finalizeFixtureLifecycle } from "./connected-onboarding-fixture-lifecycle.mjs";

const hostname = "127.0.0.1";
const appPort = 3005;
const fixturePort = 54335;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureTimestamp = "2026-08-01T00:00:00.000Z";
const githubAppId = 9_170_001;
const primaryInstallationId = 8_170_001;
const secondaryInstallationId = 8_180_001;
const originalFetch = globalThis.fetch.bind(globalThis);
const allowedNetworkOrigins = new Set([
  `http://${hostname}:${appPort}`,
  `http://${hostname}:${fixturePort}`,
]);

const users = {
  primary: {
    authUserId: "17111111-1111-4111-8111-111111111111",
    githubUserId: 7_170_001,
    login: "connected-primary",
    email: "connected-primary@example.invalid",
    identityId: "17333333-3333-4333-8333-333333333331",
    installationId: primaryInstallationId,
  },
  secondary: {
    authUserId: "18111111-1111-4111-8111-111111111111",
    githubUserId: 7_180_001,
    login: "connected-secondary",
    email: "connected-secondary@example.invalid",
    identityId: "18333333-3333-4333-8333-333333333332",
    installationId: secondaryInstallationId,
  },
};
const usersById = new Map(Object.values(users).map((user) => [user.authUserId, user]));
let activeLoginUserId = users.primary.authUserId;

const githubRepositories = [
  {
    id: 1_701,
    name: "connected-target",
    full_name: "fixture-owner/connected-target",
    owner: { login: "fixture-owner" },
    private: true,
    fork: false,
    archived: false,
    disabled: false,
    visibility: "private",
    default_branch: "main",
  },
  {
    id: 1_702,
    name: "revoked-before-selection",
    full_name: "fixture-owner/revoked-before-selection",
    owner: { login: "fixture-owner" },
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    visibility: "public",
    default_branch: "trunk",
  },
];
const unauthorizedRepository = {
  id: 1_799,
  full_name: "fixture-owner/not-authorized",
};

const states = new Map();
const identities = new Map();
const installations = new Map();
const revokedRepositoryIds = new Set();
let selectedRows = [];
let projectRows = [];
const counters = {
  identityEnsure: 0,
  stateCreate: 0,
  stateConsume: 0,
  installationRegister: 0,
  tokenCreate: 0,
  repositoryList: 0,
  tokenRevoke: 0,
  selectionRead: 0,
  selectionWrite: 0,
  projectRead: 0,
  projectWrite: 0,
};
const forbiddenExternalRequests = [];
const blockedFrameworkRequests = [];

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessTokenFor(user) {
  return [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      iss: `http://${hostname}:${fixturePort}/auth/v1`,
      role: "authenticated",
      sub: user.authUserId,
    }),
    "fixture-only-signature",
  ].join(".");
}

function syntheticUser(user) {
  return {
    id: user.authUserId,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: fixtureTimestamp,
    phone: "",
    confirmed_at: fixtureTimestamp,
    last_sign_in_at: fixtureTimestamp,
    app_metadata: { provider: "github", providers: ["github"] },
    user_metadata: { fixture_only: true },
    identities: [
      {
        identity_id: user.identityId,
        id: String(user.githubUserId),
        user_id: user.authUserId,
        provider_id: String(user.githubUserId),
        identity_data: {
          user_name: user.login,
          avatar_url: `https://avatars.example.invalid/${user.login}`,
          fixture_only: true,
        },
        provider: "github",
        email: user.email,
        created_at: fixtureTimestamp,
        last_sign_in_at: fixtureTimestamp,
        updated_at: fixtureTimestamp,
      },
    ],
    created_at: fixtureTimestamp,
    updated_at: fixtureTimestamp,
    is_anonymous: false,
  };
}

function sessionPayload(user) {
  return {
    access_token: accessTokenFor(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `fixture-refresh-${user.authUserId}`,
    user: syntheticUser(user),
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

function bearerUserId(request) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return usersById.has(parsed.sub) ? parsed.sub : null;
  } catch {
    return null;
  }
}

function queryUuid(requestUrl, name) {
  const raw = requestUrl.searchParams.get(name);
  return raw?.startsWith("eq.") ? raw.slice(3) : null;
}

function installationProjection(record, select) {
  if (select === "status") return { status: record.status };
  if (select.includes("id,installation_id,status")) {
    return { id: record.id, installation_id: record.installationId, status: record.status };
  }
  return {
    installation_id: record.installationId,
    repository_selection: record.repositorySelection,
    status: record.status,
  };
}

function selectedRow(userId, installationRecord, repository) {
  return {
    id: "17444444-4444-4444-8444-444444444444",
    user_id: userId,
    github_installation_id: installationRecord.id,
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
    selected_at: fixtureTimestamp,
    created_at: fixtureTimestamp,
    updated_at: new Date().toISOString(),
  };
}

function selectedProjection(row) {
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

function projectSelectionProjection(row, userId) {
  return {
    id: row.id,
    github_repository_id: row.github_repository_id,
    full_name: row.full_name,
    visibility: row.visibility,
    default_branch: row.default_branch,
    projects: projectRows.filter(
      (project) => project.user_id === userId && project.selected_repository_id === row.id,
    ),
  };
}

function createFixtureServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${hostname}:${fixturePort}`);

    if (request.method === "GET" && requestUrl.pathname === "/auth/v1/authorize") {
      const redirectTo = requestUrl.searchParams.get("redirect_to");
      if (!redirectTo) return writeJson(response, 400, { error: "missing_redirect_to" });
      const callback = new URL(redirectTo);
      callback.searchParams.set("code", `fixture-code-${activeLoginUserId}`);
      response.writeHead(302, { location: callback.toString() });
      response.end();
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/auth/v1/token") {
      const rawBody = await readBody(request);
      const userId = [...usersById.keys()].find((candidate) => rawBody.includes(candidate)) ?? activeLoginUserId;
      writeJson(response, 200, sessionPayload(usersById.get(userId)));
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/auth/v1/user") {
      const userId = bearerUserId(request);
      const user = userId ? usersById.get(userId) : null;
      writeJson(response, user ? 200 : 401, user ? syntheticUser(user) : { message: "invalid_fixture_session" });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/ensure_user_identity") {
      const body = JSON.parse(await readBody(request));
      const user = usersById.get(body.p_auth_user_id);
      if (!user || user.githubUserId !== body.p_github_user_id) {
        writeJson(response, 400, { message: "invalid_fixture_identity" });
        return;
      }
      identities.set(user.authUserId, { user_id: user.authUserId, github_user_id: user.githubUserId });
      counters.identityEnsure += 1;
      writeJson(response, 200, user.authUserId);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/create_github_installation_state") {
      const body = JSON.parse(await readBody(request));
      if (!usersById.has(body.p_user_id) || !/^[0-9a-f]{64}$/.test(body.p_state_hash)) {
        writeJson(response, 400, { message: "invalid_fixture_installation_state" });
        return;
      }
      counters.stateCreate += 1;
      states.set(body.p_state_hash, {
        userId: body.p_user_id,
        returnTo: body.p_return_to,
        expiresAt: new Date(body.p_expires_at).getTime(),
        consumed: false,
      });
      writeJson(response, 200, `17555555-5555-4555-8555-${String(counters.stateCreate).padStart(12, "0")}`);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/consume_github_installation_state") {
      const body = JSON.parse(await readBody(request));
      const state = states.get(body.p_state_hash);
      if (!state) return writeJson(response, 404, { code: "P0002", message: "installation_state_invalid" });
      if (state.userId !== body.p_user_id) return writeJson(response, 400, { code: "P0001", message: "installation_state_wrong_user" });
      if (state.consumed) return writeJson(response, 400, { code: "P0001", message: "installation_state_replayed" });
      if (state.expiresAt <= Date.now()) return writeJson(response, 400, { code: "P0001", message: "installation_state_expired" });
      state.consumed = true;
      counters.stateConsume += 1;
      writeJson(response, 200, state.returnTo);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/read_current_github_identity") {
      const body = JSON.parse(await readBody(request));
      const identity = identities.get(body.p_user_id);
      writeJson(response, 200, identity?.github_user_id ?? null);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/register_verified_github_installation") {
      const body = JSON.parse(await readBody(request));
      const user = usersById.get(body.p_user_id);
      if (!user || body.p_installation_id !== user.installationId || body.p_github_account_id !== user.githubUserId) {
        writeJson(response, 400, { code: "P0001", message: "installation_account_mismatch" });
        return;
      }
      const record = {
        id: user === users.primary ? "17666666-6666-4666-8666-666666666661" : "18666666-6666-4666-8666-666666666662",
        userId: user.authUserId,
        installationId: body.p_installation_id,
        repositorySelection: body.p_repository_selection,
        status: body.p_status,
      };
      installations.set(user.authUserId, record);
      counters.installationRegister += 1;
      writeJson(response, 200, record.id);
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/read_current_github_installation"
    ) {
      const body = JSON.parse(await readBody(request));
      const record = installations.get(body.p_user_id);
      writeJson(
        response,
        200,
        record
          ? [
              {
                installation_id: record.installationId,
                repository_selection: record.repositorySelection,
                status: record.status,
              },
            ]
          : [],
      );
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/rest/v1/rpc/read_current_github_selection_installation"
    ) {
      const body = JSON.parse(await readBody(request));
      const record = installations.get(body.p_user_id);
      writeJson(
        response,
        200,
        record
          ? [
              {
                id: record.id,
                installation_id: record.installationId,
                status: record.status,
              },
            ]
          : [],
      );
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/rest/v1/github_installations") {
      const userId = queryUuid(requestUrl, "user_id") ?? bearerUserId(request);
      const record = userId ? installations.get(userId) : null;
      const select = requestUrl.searchParams.get("select") ?? "";
      writeJson(response, 200, record ? [installationProjection(record, select)] : []);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/rest/v1/selected_repositories") {
      const userId = bearerUserId(request);
      const ownRows = userId ? selectedRows.filter((row) => row.user_id === userId) : [];
      const select = requestUrl.searchParams.get("select") ?? "";
      if (select.includes("projects(")) counters.projectRead += 1;
      else counters.selectionRead += 1;
      writeJson(
        response,
        200,
        select.includes("projects(")
          ? ownRows.map((row) => projectSelectionProjection(row, userId))
          : ownRows.map(selectedProjection),
      );
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/ensure_selected_github_repository") {
      const body = JSON.parse(await readBody(request));
      const installation = installations.get(body.p_user_id);
      const repository = githubRepositories.find((candidate) => candidate.id === body.p_github_repository_id);
      if (!installation || installation.id !== body.p_github_installation_id || !repository || revokedRepositoryIds.has(repository.id)) {
        writeJson(response, 400, { message: "github_repository_selection_storage_failed" });
        return;
      }
      const existing = selectedRows.find((row) => row.user_id === body.p_user_id && row.github_repository_id === repository.id);
      const row = { ...selectedRow(body.p_user_id, installation, repository), id: existing?.id ?? selectedRow(body.p_user_id, installation, repository).id };
      selectedRows = selectedRows.filter((candidate) => !(candidate.user_id === body.p_user_id && candidate.github_repository_id === repository.id));
      selectedRows.push(row);
      counters.selectionWrite += 1;
      writeJson(response, 200, row);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/remove_selected_github_repository") {
      const body = JSON.parse(await readBody(request));
      const selected = selectedRows.find((row) => row.user_id === body.p_user_id && row.github_repository_id === body.p_github_repository_id);
      const activeProject = selected && projectRows.some((project) => project.selected_repository_id === selected.id && project.status !== "archived");
      if (activeProject) return writeJson(response, 400, { message: "github_repository_selection_active_project_conflict" });
      selectedRows = selectedRows.filter((row) => !(row.user_id === body.p_user_id && row.github_repository_id === body.p_github_repository_id));
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/rest/v1/rpc/save_project_calibration") {
      const body = JSON.parse(await readBody(request));
      const selected = selectedRows.find((row) => row.id === body.p_selected_repository_id && row.user_id === body.p_user_id);
      if (!selected) return writeJson(response, 400, { message: "project_calibration_selected_repository_not_found" });
      const existing = projectRows.find((project) => project.selected_repository_id === selected.id && project.status !== "archived");
      const project = {
        id:
          existing?.id ??
          (projectRows.length === 0
            ? "17777777-7777-4777-8777-777777777777"
            : "18888888-8888-4888-8888-888888888888"),
        user_id: body.p_user_id,
        selected_repository_id: selected.id,
        core_goal: body.p_core_goal,
        current_stage_goal: body.p_current_stage_goal,
        status: body.p_status,
        current_blocker: body.p_current_blocker,
        created_at: existing?.created_at ?? fixtureTimestamp,
        updated_at: new Date().toISOString(),
      };
      projectRows = projectRows.filter((candidate) => candidate.id !== project.id);
      projectRows.push(project);
      counters.projectWrite += 1;
      writeJson(response, 200, {
        ...project,
        repository_data_state: "connected",
        repository_data_version: 1,
        repository_removed_at: null,
        selected_repositories: { ...projectSelectionProjection(selected, body.p_user_id), projects: [] },
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/__fixture/active-user") {
      const body = JSON.parse(await readBody(request));
      const user = users[body.user];
      if (!user) return writeJson(response, 400, { error: "unknown_fixture_user" });
      activeLoginUserId = user.authUserId;
      writeJson(response, 200, { active_user: body.user });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/__fixture/revoke-repository") {
      const body = JSON.parse(await readBody(request));
      revokedRepositoryIds.add(body.repository_id);
      writeJson(response, 200, { revoked_repository_id: body.repository_id });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/__fixture/archive-project") {
      const body = JSON.parse(await readBody(request));
      const existing = projectRows.find((project) => project.id === body.project_id);
      if (!existing) {
        writeJson(response, 404, { error: "fixture_project_not_found" });
        return;
      }
      projectRows = projectRows.map((project) =>
        project.id === existing.id
          ? { ...project, status: "archived", updated_at: new Date().toISOString() }
          : project,
      );
      writeJson(response, 200, { archived_project_id: existing.id });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/__fixture/state") {
      writeJson(response, 200, {
        fixture_id: "connected_onboarding_complete_journey",
        fixture_version: "1.0.0",
        source_type: "synthetic",
        contains_real_secret: false,
        real_github_called: false,
        external_network_default: "deny",
        blocked_framework_requests: blockedFrameworkRequests,
        forbidden_external_requests: forbiddenExternalRequests,
        identities: [...identities.values()],
        installations: [...installations.values()].map(({ id, userId, installationId, repositorySelection, status }) => ({ id, user_id: userId, installation_id: installationId, repository_selection: repositorySelection, status })),
        authorized_repository_ids: githubRepositories.filter((repository) => !revokedRepositoryIds.has(repository.id)).map((repository) => repository.id),
        unauthorized_repository_id: unauthorizedRepository.id,
        selected_repositories: selectedRows,
        projects: projectRows,
        counts: { ...counters },
        sync_started: false,
        issue_created: false,
      });
      return;
    }

    writeJson(response, 404, { error: "fixture_route_not_found" });
  });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");

  if (
    method === "GET" &&
    url.origin === "https://registry.npmjs.org" &&
    url.pathname === "/-/package/next/dist-tags"
  ) {
    blockedFrameworkRequests.push({
      origin: url.origin,
      path: url.pathname,
      method,
      policy: "explicit_deny",
    });
    return Response.json(
      { message: "fixture_network_denied" },
      { status: 503 },
    );
  }

  if (url.origin === "https://api.github.com") {
    const installationMatch = url.pathname.match(/^\/app\/installations\/(\d+)$/);
    if (method === "GET" && installationMatch) {
      const installationId = Number(installationMatch[1]);
      const requestedUser = Object.values(users).find((user) => user.installationId === installationId);
      if (!requestedUser) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      const accountUser = requestedUser === users.secondary ? users.primary : requestedUser;
      return Response.json({
        id: installationId,
        app_id: githubAppId,
        account: { id: accountUser.githubUserId, login: accountUser.login, type: "User" },
        repository_selection: "selected",
        suspended_at: null,
      });
    }

    const tokenMatch = url.pathname.match(/^\/app\/installations\/(\d+)\/access_tokens$/);
    if (method === "POST" && tokenMatch) {
      counters.tokenCreate += 1;
      return new Response(JSON.stringify({
        token: `fixture-token-${tokenMatch[1]}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        repository_selection: "selected",
        permissions: { metadata: "read" },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }

    if (method === "GET" && url.pathname === "/installation/repositories") {
      counters.repositoryList += 1;
      const repositories = githubRepositories.filter((repository) => !revokedRepositoryIds.has(repository.id));
      return Response.json({ total_count: repositories.length, repositories });
    }

    if (method === "DELETE" && url.pathname === "/installation/token") {
      counters.tokenRevoke += 1;
      return new Response(null, { status: 204 });
    }

    forbiddenExternalRequests.push({ origin: url.origin, path: url.pathname, method });
    return Response.json({ message: "unexpected_external_request" }, { status: 502 });
  }

  if (allowedNetworkOrigins.has(url.origin)) return originalFetch(input, init);

  forbiddenExternalRequests.push({ origin: url.origin, path: url.pathname, method });
  return Response.json({ message: "unexpected_external_request" }, { status: 502 });
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
    [playwrightCli, "test", "--config=playwright.connected-onboarding-fixture.config.ts"],
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
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`Playwright exited from ${signal}`));
      resolve(code ?? 1);
    });
  });
}

for (const variableName of [
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
]) delete process.env[variableName];

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
process.env.GITHUB_APP_SLUG = "executor-connected-fixture";
process.env.GITHUB_APP_PRIVATE_KEY = syntheticKeyPair.privateKey;
process.env.GITHUB_REST_API_VERSION = "2026-03-10";

const fixtureServer = createFixtureServer();
const app = next({ dev: true, dir: projectRoot, hostname, port: appPort, turbopack: true });
let appServer;
let playwrightExitCode = 1;

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
  playwrightExitCode = await runPlaywright();
} catch {
  console.error("connected_onboarding_fixture_run_failed");
} finally {
  const lifecycle = await finalizeFixtureLifecycle({
    playwrightExitCode,
    cleanupTasks: [
      () => closeServer(appServer),
      () => app.close(),
      () => closeServer(fixtureServer),
      () => {
        globalThis.fetch = originalFetch;
      },
      () => {
        states.clear();
        identities.clear();
        installations.clear();
        selectedRows = [];
        projectRows = [];
      },
    ],
  });
  if (lifecycle.cleanupFailed) {
    console.error("connected_onboarding_fixture_cleanup_failed");
  }
  playwrightExitCode = lifecycle.exitCode;
}

process.exit(playwrightExitCode);
