import { defineConfig, devices } from "@playwright/test";

const lifecycleScriptOwnsWebServer =
  process.env.E2E_LIFECYCLE_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e-connected-onboarding-fixture",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/connected-onboarding-fixture",
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: lifecycleScriptOwnsWebServer
    ? undefined
    : {
        command: "pnpm.cmd dev -- --port 3005",
        url: "http://127.0.0.1:3005",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
