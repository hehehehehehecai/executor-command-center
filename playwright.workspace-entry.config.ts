import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const output = process.env.WORKSPACE_ENTRY_BROWSER_OUTPUT;
if (!output || !path.isAbsolute(output)) throw new Error("workspace_entry_browser_output_required");
export default defineConfig({
  testDir: "./tests/e2e-workspace-entry",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["json", { outputFile: path.join(output, "playwright-results.json") }]],
  outputDir: path.join(output, "playwright-artifacts"),
  use: { baseURL: "http://127.0.0.1:3037", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
