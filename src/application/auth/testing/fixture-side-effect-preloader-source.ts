export function createFixtureSideEffectPreloaderSource(): string {
  return String.raw`
import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");
const dgram = require("node:dgram");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");
const workerThreads = require("node:worker_threads");

const SIDE_EFFECT_EXIT_STATUS = 86;
const SIDE_EFFECT_ERROR_PREFIX = "auth_fixture_side_effect_detected:";

function fail(category) {
  fs.writeSync(2, SIDE_EFFECT_ERROR_PREFIX + category + "\n");
  process.exit(SIDE_EFFECT_EXIT_STATUS);
}

function blocked(category) {
  return function fixtureSideEffectBlocked() {
    fail(category);
  };
}

function intercept(target, property, category) {
  if (!target || typeof target[property] !== "function") return;

  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: Object.prototype.propertyIsEnumerable.call(target, property),
    value: blocked(category),
    writable: true,
  });
}

for (const property of [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
]) {
  intercept(childProcess, property, "child-process");
}
intercept(workerThreads, "Worker", "worker");

intercept(net.Server?.prototype, "listen", "server-listen");
intercept(http.Server?.prototype, "listen", "server-listen");
intercept(https.Server?.prototype, "listen", "server-listen");
intercept(dgram.Socket?.prototype, "bind", "server-listen");
intercept(http, "createServer", "server-listen");
intercept(https, "createServer", "server-listen");
intercept(dgram, "createSocket", "server-listen");

for (const [target, properties] of [
  [http, ["request", "get"]],
  [https, ["request", "get"]],
  [net, ["connect", "createConnection"]],
  [tls, ["connect"]],
]) {
  for (const property of properties) {
    intercept(target, property, "outbound-network");
  }
}

if (typeof globalThis.fetch === "function") {
  globalThis.fetch = blocked("outbound-network");
}

for (const property of [
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "createWriteStream",
  "rename",
  "renameSync",
  "rm",
  "rmSync",
  "mkdir",
  "mkdirSync",
  "unlink",
  "unlinkSync",
  "copyFile",
  "copyFileSync",
  "truncate",
  "truncateSync",
]) {
  intercept(fs, property, "file-write");
}

for (const property of [
  "writeFile",
  "appendFile",
  "rename",
  "rm",
  "mkdir",
  "unlink",
  "copyFile",
  "truncate",
]) {
  intercept(fs.promises, property, "file-write");
}

syncBuiltinESMExports();
`;
}
