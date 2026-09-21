import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The caller owns the local Preview server and chooses an exclusive output directory.
// Snapshot updates remain opt-in through Playwright's explicit CLI flag.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve("@playwright/test/package.json")), "cli.js");
const forwarded = process.argv.slice(2);
if (forwarded[0] === "--") forwarded.shift();

const output = process.env.EXECUTOR_VISUAL_OUTPUT_DIR;
if (output && existsSync(output) && readdirSync(output).length !== 0) {
  throw new Error("EXECUTOR_VISUAL_OUTPUT_DIR must be empty for a new run");
}

const child = spawn(process.execPath, [
  cli,
  "test",
  "--config",
  path.join(root, "playwright.visual-regression.config.ts"),
  ...forwarded,
], { cwd: root, env: process.env, shell: false, windowsHide: true, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { if (child.exitCode === null) child.kill(signal); });
}
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
