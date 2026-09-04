import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const contractVersion = "nextjs-request-response-csp-nonce.v1";
async function reserveAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object", "runtime_test_port_allocation_failed");
  const availablePort = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return availablePort;
}

const port = process.env.CSP_RUNTIME_PORT
  ? Number.parseInt(process.env.CSP_RUNTIME_PORT, 10)
  : await reserveAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const cases = [
  { caseId: "CSP-STATIC-ROOT-01", route: "/", expectedStatus: 200 },
  { caseId: "CSP-AUTH-ERROR-01", route: "/auth/error", expectedStatus: 200 },
  { caseId: "CSP-NOT-FOUND-01", route: "/phase4-4-missing-route", expectedStatus: 404 },
  { caseId: "CSP-DYNAMIC-CONTROL-01", route: "/mission-control", expectedStatus: 200 },
];

function scriptDirective(csp) {
  return csp.split(";").map((value) => value.trim())
    .find((value) => value.startsWith("script-src ")) ?? "";
}

function inspectResponse(testCase, response, html) {
  const csp = response.headers.get("content-security-policy") ?? "";
  const nonceMatches = [...csp.matchAll(/'nonce-([^']+)'/g)];
  assert.equal(response.status, testCase.expectedStatus, `${testCase.caseId}: unexpected HTTP status`);
  assert.equal(nonceMatches.length, 1, `${testCase.caseId}: CSP must contain exactly one nonce`);

  const nonce = nonceMatches[0][1];
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  assert.ok(scripts.length > 0, `${testCase.caseId}: production HTML must contain executable scripts`);
  const scriptNonces = scripts.map((script) => /\bnonce="([^"]+)"/i.exec(script)?.[1] ?? "");
  assert.equal(
    scriptNonces.filter((value) => value === nonce).length,
    scripts.length,
    `${testCase.caseId}: every script nonce must match the response CSP nonce`,
  );

  const directive = scriptDirective(csp);
  assert.match(directive, /'strict-dynamic'/, `${testCase.caseId}: strict-dynamic missing`);
  assert.doesNotMatch(directive, /'unsafe-inline'/, `${testCase.caseId}: unsafe-inline script forbidden`);
  assert.doesNotMatch(directive, /'unsafe-eval'/, `${testCase.caseId}: unsafe-eval forbidden`);
  assert.doesNotMatch(directive, /(^|\s)\*(\s|$)/, `${testCase.caseId}: wildcard script source forbidden`);
  assert.match(csp, /object-src 'none'/, `${testCase.caseId}: object-src must remain none`);
  assert.match(csp, /frame-ancestors 'none'/, `${testCase.caseId}: frame-ancestors must remain none`);

  return {
    caseId: testCase.caseId,
    route: testCase.route,
    status: response.status,
    scriptCount: scripts.length,
    matchingNonceCount: scriptNonces.filter((value) => value === nonce).length,
    missingNonceCount: scriptNonces.filter((value) => value === "").length,
    mismatchingNonceCount: scriptNonces.filter((value) => value !== "" && value !== nonce).length,
    nonce,
  };
}

async function waitUntilReady(child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`production_server_exited_${child.exitCode}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) {
        await delay(50);
        if (child.exitCode !== null) throw new Error(`production_server_exited_${child.exitCode}`);
        return;
      }
    } catch {
      // The server is still starting; readiness is bounded by the deadline.
    }
    await delay(100);
  }
  throw new Error("production_server_readiness_timeout");
}

async function terminateChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1_000),
  ]);
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(1_000),
  ]);
}

const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverOutput = `${serverOutput}${chunk}`.slice(-8_192);
  });
}

try {
  await waitUntilReady(child);
  const results = [];
  for (const testCase of cases) {
    const response = await fetch(`${baseUrl}${testCase.route}`, { redirect: "manual" });
    results.push(inspectResponse(testCase, response, await response.text()));
  }
  assert.equal(new Set(results.map((result) => result.nonce)).size, results.length, "each request must use a unique nonce");
  console.log(JSON.stringify({
    contractVersion,
    cases: results.map((result) => ({
      caseId: result.caseId,
      route: result.route,
      status: result.status,
      scriptCount: result.scriptCount,
      matchingNonceCount: result.matchingNonceCount,
      missingNonceCount: result.missingNonceCount,
      mismatchingNonceCount: result.mismatchingNonceCount,
    })),
    errorCount: 0,
  }));
} catch (error) {
  const safeMessage = error instanceof Error ? error.message : "unknown_runtime_failure";
  console.error(JSON.stringify({ contractVersion, error: safeMessage, serverOutput: serverOutput.slice(-1_000) }));
  process.exitCode = 1;
} finally {
  await terminateChild(child);
}
