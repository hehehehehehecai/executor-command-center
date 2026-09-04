if (process.env.NODE_ENV === "production") {
  console.error("connected_panel_fixture_forbidden_in_production");
  process.exit(1);
}

process.env.CONNECTED_PANEL_E2E = "1";
process.env.E2E_PORT = "3006";
process.env.E2E_PLAYWRIGHT_CONFIG = "playwright.connected-panels.config.ts";

await import("./run-e2e.mjs");
