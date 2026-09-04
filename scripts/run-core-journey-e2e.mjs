import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const hostname = "127.0.0.1";
const appPort = 3015;
const providerPort = 4015;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseSupabaseStatus() {
  const cli = path.join(projectRoot, "node_modules", "supabase", "dist", "supabase.js");
  const result = spawnSync(
    process.execPath,
    [cli, "status", "-o", "env"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `phase5_local_supabase_unavailable:${result.status}:${String(result.stderr).trim()}`,
    );
  }
  return Object.fromEntries(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="([\s\S]*)"$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
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

function createSyntheticProvider() {
  const calls = [];
  let aiMode = "success";
  const readBody = (request) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      request.on("error", reject);
    });
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${hostname}:${providerPort}`);
    if (url.pathname === "/__fixture/state") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ calls }));
      return;
    }
    if (url.pathname === "/__fixture/mode" && request.method === "POST") {
      const payload = JSON.parse(await readBody(request));
      aiMode = payload.ai === "failure" ? "failure" : "success";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, aiMode }));
      return;
    }
    calls.push({ method: request.method, pathname: url.pathname });
    if (url.pathname === "/chat/completions") {
      if (aiMode === "failure") {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { code: "synthetic_unavailable" } }));
        return;
      }
      const providerRequest = JSON.parse(await readBody(request));
      const userMessage = providerRequest.messages?.find(
        (message) => message.role === "user",
      );
      const promptEnvelope = JSON.parse(userMessage?.content ?? "null");
      const brief = structuredClone(promptEnvelope.outputTemplate);
      brief.summary.text = "Synthetic evidence-bound Phase 5 summary.";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          id: "phase5-synthetic-generation",
          model: "deepseek-chat",
          choices: [{ message: { content: JSON.stringify(brief) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ status: 200, ids: ["phase5-synthetic-receipt"] }),
    );
  });
}

function runPlaywright(environment) {
  const require = createRequire(import.meta.url);
  const playwrightPackage = require.resolve("@playwright/test/package.json");
  const playwrightCli = path.join(path.dirname(playwrightPackage), "cli.js");
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--config=playwright.core-journeys.config.ts"],
    {
      cwd: projectRoot,
      env: environment,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) return reject(new Error(`phase5_playwright_signal:${signal}`));
      resolve(code ?? 1);
    });
  });
}

const status = parseSupabaseStatus();
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const runNumber = Date.now() % 100_000_000;
const controlToken = randomUUID();
const environment = {
  ...process.env,
  APP_ORIGIN: `http://${hostname}:${appPort}`,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  PHASE5_E2E: "1",
  PHASE5_E2E_RUN_ID: runId,
  PHASE5_E2E_RUN_NUMBER: String(runNumber),
  PHASE5_E2E_CONTROL_TOKEN: controlToken,
  PHASE5_E2E_PROVIDER_URL: `http://${hostname}:${providerPort}`,
  GITHUB_WEBHOOK_SECRET: "phase5-synthetic-webhook-secret",
  INNGEST_EVENT_KEY: "phase5-synthetic-event-key",
  INNGEST_BASE_URL: `http://${hostname}:${providerPort}`,
  INNGEST_SIGNING_KEY: "signkey-test-phase5-synthetic",
  DEEPSEEK_API_KEY: "phase5-synthetic-provider-key",
  E2E_LIFECYCLE_MANAGED_SERVER: "1",
};
Object.assign(process.env, environment);

const providerServer = createSyntheticProvider();
const app = next({ dev: true, dir: projectRoot, hostname, port: appPort, turbopack: true });
let appServer;

try {
  await listen(providerServer, providerPort);
  await app.prepare();
  appServer = createServer((request, response) => {
    app.getRequestHandler()(request, response).catch(() => {
      response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });
  appServer.on("upgrade", app.getUpgradeHandler());
  await listen(appServer, appPort);
  process.exitCode = await runPlaywright(environment);
} finally {
  await closeServer(appServer);
  await app.close();
  await closeServer(providerServer);
}

process.exit(process.exitCode ?? 1);
