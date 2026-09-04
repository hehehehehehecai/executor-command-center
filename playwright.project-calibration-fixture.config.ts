import { defineConfig, devices } from "@playwright/test";

const lifecycleScriptOwnsWebServer =
  process.env.E2E_LIFECYCLE_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e-project-calibration-fixture",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3004",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: lifecycleScriptOwnsWebServer
    ? undefined
    : {
        command: "pnpm.cmd dev -- --port 3004",
        url: "http://127.0.0.1:3004",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
