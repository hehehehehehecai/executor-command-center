import { existsSync, lstatSync } from "node:fs";
import path from "node:path";

import { chromium, defineConfig, devices } from "@playwright/test";

const repository = __dirname;
const workspaceOutputs = path.resolve(repository, "..", "outputs");

function within(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function outputPath(name: string) {
  const value = process.env[name];
  if (!value || !path.isAbsolute(value)) throw new Error(`${name} must name an absolute directory under the workspace outputs directory`);
  const resolved = path.resolve(value);
  if (!within(workspaceOutputs, resolved)) throw new Error(`${name} must stay within workspace outputs`);
  for (let current = resolved; ; current = path.dirname(current)) {
    if (existsSync(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory())) {
      throw new Error(`${name} cannot use a symlink or a non-directory ancestor`);
    }
    if (current === path.dirname(current)) break;
  }
  return resolved;
}

// The runner checks exclusivity once; workers also load this configuration.
const output = outputPath("EXECUTOR_VISUAL_OUTPUT_DIR");
const snapshots = process.env.EXECUTOR_VISUAL_SNAPSHOT_DIR
  ? outputPath("EXECUTOR_VISUAL_SNAPSHOT_DIR")
  : path.join(repository, "tests/e2e-visual/executor-visual.spec.ts-snapshots");
if (output === snapshots || within(output, snapshots) || within(snapshots, output)) {
  throw new Error("Snapshot and run directories must be separate and must not contain each other");
}

const baseURL = new URL(process.env.EXECUTOR_VISUAL_BASE_URL ?? "http://127.0.0.1:3017");
if (baseURL.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(baseURL.hostname) || baseURL.username || baseURL.password || baseURL.pathname !== "/" || baseURL.search || baseURL.hash) {
  throw new Error("Visual regression requires a local Preview server origin");
}

export default defineConfig({
  testDir: "./tests/e2e-visual",
  testMatch: "executor-visual.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  updateSnapshots: "none",
  snapshotPathTemplate: path.join(snapshots, "{arg}{ext}"),
  outputDir: path.join(output, "results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(output, "html"), open: "never" }],
    ["json", { outputFile: path.join(output, "playwright.json") }],
  ],
  expect: {
    toHaveScreenshot: {
      threshold: 0,
      maxDiffPixels: 0,
      maxDiffPixelRatio: 0,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: baseURL.origin,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    colorScheme: "dark",
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: "reduce" },
    launchOptions: { executablePath: chromium.executablePath(), args: ["--enable-automation"] },
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } }],
});
