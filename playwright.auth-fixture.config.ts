import { defineConfig, devices } from "@playwright/test";

const lifecycleScriptOwnsWebServer =
  process.env.E2E_LIFECYCLE_MANAGED_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e-auth-fixture",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: lifecycleScriptOwnsWebServer
    ? undefined
    : {
        command: "pnpm.cmd dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
