import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Synthetic external HTTP transport only. Next server pages, Supabase SDK,
// workspace/production panel readers, owner validation and client UI are real.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.env.WORKSPACE_ENTRY_BROWSER_MODE;
if (!["formal", "controlled"].includes(mode)) throw new Error("entry_browser_mode_required");
if (process.env.NODE_ENV !== (mode === "formal" ? "production" : "development")) throw new Error("entry_browser_environment_mismatch");
const output = process.env.WORKSPACE_ENTRY_BROWSER_OUTPUT;
if (!output || !path.isAbsolute(output)) throw new Error("entry_browser_output_required");
const host = "127.0.0.1", port = 3037, providerPort = 4037;
const origin = `http://${host}:${port}`, provider = `http://${host}:${providerPort}`;
const fixedAt = "2026-10-09T00:00:00.000Z";
const alpha = "11111111-1111-4111-8111-111111111111", beta = "22222222-2222-4222-8222-222222222222";
const ids = { alpha: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", beta: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", second: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", third: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
const users = new Map([[alpha, { id: alpha, login: "entry-alpha", githubId: 730001 }], [beta, { id: beta, login: "entry-beta", githubId: 730002 }]]);
let state;
const requests = [], blockedExternal = [], sockets = new Set();
const reset = () => { state = { scenario: "single", ownerMismatch: null, syncState: "not_started", delayNextAuthMs: 0, pendingAuth: 0, businessWrites: 0, authMutations: 0, readonlyRpc: 0 }; requests.length = 0; blockedExternal.length = 0; };
reset();
function userPayload(user) {
  return { id: user.id, aud: "authenticated", role: "authenticated", email: `${user.login}@example.invalid`, email_confirmed_at: fixedAt, phone: "", confirmed_at: fixedAt, last_sign_in_at: fixedAt,
    app_metadata: { provider: "github", providers: ["github"] }, user_metadata: { synthetic_transport_only: true },
    identities: [{ identity_id: user.id, id: String(user.githubId), user_id: user.id, provider_id: String(user.githubId), provider: "github", identity_data: { user_name: user.login, fixture_only: true }, created_at: fixedAt, updated_at: fixedAt, last_sign_in_at: fixedAt }],
    created_at: fixedAt, updated_at: fixedAt, is_anonymous: false };
}
function session(user) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ aud: "authenticated", role: "authenticated", sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: `${provider}/auth/v1` })}.synthetic-only`, refresh_token: `synthetic-${user.id}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userPayload(user) };
}
function json(response, code, data) { response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(data)); }
async function body(request) { const parts = []; for await (const part of request) parts.push(part); return parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {}; }
function actor(request) { try { return JSON.parse(Buffer.from((request.headers.authorization ?? "").split(".")[1], "base64url").toString()).sub; } catch { return null; } }
function projectRows(userId) {
  if (state.scenario === "empty") return [];
  const owner = users.get(userId);
  if (!owner) return [];
  const projectIds = userId === beta ? [ids.beta] : state.scenario === "multiple" ? [ids.alpha, ids.second, ids.third] : [ids.alpha];
  return projectIds.map((id, index) => {
    const name = userId === beta ? "beta-private-project" : index === 0 ? "alpha-private-project" : "same-name-project";
    const installation = { id: userId, user_id: state.ownerMismatch === "installation" ? beta : userId, installation_id: owner.githubId, status: state.scenario === "revoked" ? "revoked" : "active" };
    return { id, user_id: state.ownerMismatch === "project" ? beta : userId, core_goal: null, current_stage_goal: null, current_blocker: null, status: null, updated_at: fixedAt,
      selected_repositories: { id, user_id: state.ownerMismatch === "selection" ? beta : userId, full_name: `${owner.login}/${name}`, owner_login: owner.login, name, visibility: "private", default_branch: "main", github_installations: installation } };
  });
}
function splitColumns(value) {
  let depth = 0, start = 0; const result = [];
  for (let i = 0; i < value.length; i++) { if (value[i] === "(") depth++; else if (value[i] === ")") depth--; else if (value[i] === "," && depth === 0) { result.push(value.slice(start, i)); start = i + 1; } }
  result.push(value.slice(start)); return result;
}
function project(value, columns) {
  const result = {};
  for (const column of splitColumns(columns)) {
    const opening = column.indexOf("(");
    const key = (opening < 0 ? column : column.slice(0, opening)).split("!")[0];
    if (!(key in value)) throw new Error(`synthetic_unknown_column:${key}`);
    result[key] = opening < 0 ? value[key] : project(value[key], column.slice(opening + 1, -1));
  }
  return result;
}
function syncRun(projectId) {
  if (state.syncState === "not_started") return null;
  const status = state.syncState;
  return { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", project_id: projectId, idempotency_key: "first-sync:onboarding", trigger_source: "first_sync", status, version: 1, queued_at: fixedAt, started_at: fixedAt, finished_at: status === "failed" ? fixedAt : null, last_progress_at: fixedAt, progress_cursor: "synthetic-readonly", error_code: status === "failed" ? "github_activity_timeout" : null, error_summary: status === "failed" ? "Synthetic readonly failure" : null, created_at: fixedAt, updated_at: fixedAt };
}
function syncContext(row) { return { project_id: row.id, github_repository_id: 730003, owner_login: row.selected_repositories.owner_login, repository_name: row.selected_repositories.name, repository_full_name: row.selected_repositories.full_name, visibility: "private", is_private: true, is_fork: false, is_archived: false, is_disabled: false, default_branch: "main", repository_updated_at: fixedAt, installation_id: row.selected_repositories.github_installations.installation_id, installation_status: row.selected_repositories.github_installations.status }; }

const fixture = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", provider), method = request.method ?? "GET";
  try {
    if (url.pathname === "/__fixture/reset" && method === "POST") { reset(); return json(response, 200, { reset: true }); }
    if (url.pathname === "/__fixture/control" && method === "POST") { const update = await body(request); for (const key of ["scenario", "ownerMismatch", "syncState", "delayNextAuthMs"]) if (key in update) state[key] = update[key]; return json(response, 200, state); }
    if (url.pathname === "/__fixture/state") return json(response, 200, { ...state, requests, blockedExternal });
    if (url.pathname === "/__fixture/session") { const user = users.get(url.searchParams.get("user")); return json(response, user ? 200 : 400, user ? session(user) : {}); }
    const userId = actor(request);
    const record = { at: new Date().toISOString(), method, path: url.pathname, query: url.search, actorId: users.has(userId) ? userId : null, body: null, classification: "read" }; requests.push(record);
    if (url.pathname === "/auth/v1/user" && method === "GET") {
      const user = users.get(userId), payload = user ? userPayload(user) : { message: "invalid_synthetic_session" };
      const delay = userId === alpha ? state.delayNextAuthMs : 0;
      if (delay) { state.delayNextAuthMs = 0; state.pendingAuth++; await new Promise(resolve => setTimeout(resolve, delay)); state.pendingAuth--; }
      record.completedAt = new Date().toISOString(); record.delayMs = delay;
      return json(response, user ? 200 : 401, payload);
    }
    if (url.pathname === "/auth/v1/logout" && method === "POST") { state.authMutations++; record.classification = "explicit_auth_logout"; return json(response, 200, {}); }
    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (table && method === "GET") {
      const columns = url.searchParams.get("select") ?? "*";
      const requestedUser = url.searchParams.get("user_id")?.replace(/^eq\./, "");
      if (requestedUser && requestedUser !== userId) return json(response, 200, []);
      // This existing transport has no persistent decision storage; keep that state explicit.
      if (table === "decision_records") return json(response, 404, { code: "PGRST205", message: "synthetic_decision_storage_not_enabled" });
      if (table === "github_installations") return json(response, 200, users.has(userId) ? [project({ id: userId, user_id: userId, status: state.scenario === "revoked" ? "revoked" : "active" }, columns)] : []);
      if (table === "github_identities") return json(response, 200, users.has(userId) ? [project({ user_id: userId, github_login: users.get(userId).login, avatar_url: null }, columns)] : []);
      if (table === "projects") {
        if (state.scenario === "summary_failure" && columns.includes("full_name") && !columns.includes("core_goal")) return json(response, 503, { message: "synthetic_summary_read_failed" });
        if (state.scenario === "facts_failure" && columns.includes("core_goal")) return json(response, 503, { message: "synthetic_panel_read_failed" });
        const requestedId = url.searchParams.get("id")?.replace(/^eq\./, "");
        let rows = projectRows(userId).filter(row => !requestedId || row.id === requestedId);
        if (url.searchParams.get("limit")) rows = rows.slice(0, Number(url.searchParams.get("limit")));
        const projected = rows.map(row => project(row, columns));
        return json(response, 200, request.headers.accept?.includes("application/vnd.pgrst.object+json") ? projected[0] ?? null : projected);
      }
      if (table === "sync_runs") {
        const run = syncRun(url.searchParams.get("project_id")?.replace(/^eq\./, ""));
        const filtered = run && !(url.searchParams.get("status")?.startsWith("in.") && !["completed", "partial"].includes(run.status));
        return json(response, 200, filtered ? [project(run, columns)] : []);
      }
      if (["github_commits", "github_issues", "github_pull_requests", "github_releases", "github_workflow_runs", "project_briefs"].includes(table)) {
        if (table === "project_briefs" && state.scenario === "facts_failure") return json(response, 503, { message: "synthetic_brief_read_failed" });
        return json(response, 200, []);
      }
    }
    if (method === "POST" && url.pathname === "/rest/v1/rpc/get_available_energy") {
      const input = await body(request); record.body = input; record.classification = "readonly_rpc"; state.readonlyRpc++;
      if (!users.has(userId)) return json(response, 401, { message: "energy_unauthenticated" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.p_business_date ?? "")) return json(response, 400, { message: "energy_invalid_request" });
      return json(response, 200, 0);
    }
    if (method === "POST" && ["/rest/v1/rpc/read_first_sync_context", "/rest/v1/rpc/get_latest_sync_run"].includes(url.pathname)) {
      const input = await body(request); record.body = input; record.classification = "readonly_rpc"; state.readonlyRpc++;
      const row = [...projectRows(alpha), ...projectRows(beta)].find(candidate => candidate.id === input.p_project_id);
      return json(response, 200, row ? url.pathname.endsWith("read_first_sync_context") ? syncContext(row) : syncRun(row.id) : null);
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) { state.businessWrites++; record.classification = "blocked_business_write"; }
    record.unexpected = true; return json(response, 405, { message: "synthetic_transport_unexpected_request" });
  } catch (error) { requests.push({ at: new Date().toISOString(), method, path: url.pathname, error: String(error) }); return json(response, 500, { message: "synthetic_transport_error" }); }
});

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === provider || url.origin === origin) return realFetch(input, init);
  blockedExternal.push({ at: new Date().toISOString(), method: init?.method ?? "GET", origin: url.origin, path: url.pathname });
  throw new Error("entry_external_network_disabled");
};
process.env.APP_ORIGIN = origin;
process.env.NEXT_PUBLIC_SUPABASE_URL = provider;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-entry-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-entry-service-role";
// Deliberately enabled in formal mode to prove production cannot open preview.
process.env.WORKSPACE_PREVIEW_E2E = "1";
process.env.CONNECTED_PANEL_E2E = "1";
for (const name of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "DEEPSEEK_API_KEY"]) delete process.env[name];
process.env.NEXT_TELEMETRY_DISABLED = "1";
const { default: next } = await import("next");
const app = next({ dev: mode === "controlled", dir: root, hostname: host, port, turbopack: true });
let web, exitCode = 1;
async function listen(server, targetPort) { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(targetPort, host, resolve); }); server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); }); }
try {
  await mkdir(output, { recursive: true });
  await listen(fixture, providerPort);
  await app.prepare();
  web = createServer(app.getRequestHandler()); await listen(web, port);
  await writeFile(path.join(output, "runtime.json"), JSON.stringify({ at: new Date().toISOString(), mode, nodeEnvironment: process.env.NODE_ENV, nextDev: mode === "controlled", origin, provider, worktree: root, previewServerFlag: "1", connectedFixtureServerFlag: "1", nativeDatabaseSubjectsCreated: 0, realUsers: 0, externalTransportOnly: true }, null, 2));
  const require = createRequire(import.meta.url), cli = path.join(path.dirname(require.resolve("@playwright/test/package.json")), "cli.js");
  const child = spawn(process.execPath, [cli, "test", "--config", "playwright.workspace-entry.config.ts", "--grep", process.env.WORKSPACE_ENTRY_BROWSER_GREP ?? (mode === "formal" ? "formal entry" : "controlled local")], { cwd: root, shell: false, windowsHide: true, stdio: "inherit", env: { ...process.env, WORKSPACE_ENTRY_BROWSER_MODE: mode, WORKSPACE_ENTRY_BROWSER_OUTPUT: output } });
  exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally {
  const shutdownSteps = [];
  const shutdownStep = async step => {
    shutdownSteps.push({ at: new Date().toISOString(), step });
    await writeFile(path.join(output, "shutdown.json"), JSON.stringify({ pid: process.pid, parentPid: process.ppid, exitCode, shutdownSteps }, null, 2));
  };
  await writeFile(path.join(output, "transport-final.json"), JSON.stringify({ at: new Date().toISOString(), ...state, requests, blockedExternal, nativeDatabaseSubjectsCreated: 0 }, null, 2));
  await shutdownStep("actual_playwright_complete");
  const closing = [web, fixture].filter(server => server?.listening).map(server => new Promise(resolve => {
    server.close(resolve); server.closeAllConnections();
  }));
  for (const socket of sockets) socket.destroy();
  await Promise.all(closing);
  await shutdownStep("owned_http_servers_closed");
  await app.close(); globalThis.fetch = realFetch;
  await shutdownStep("next_app_closed");
}
process.exit(exitCode);
