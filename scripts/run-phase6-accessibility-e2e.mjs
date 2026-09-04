import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") {
  console.error("phase6_accessibility_fixture_forbidden_in_production");
  process.exit(1);
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(import.meta.url);
const supabasePackage = require.resolve("supabase/package.json");
const supabaseCli = path.join(path.dirname(supabasePackage), "dist", "supabase.js");
const status = spawnSync(process.execPath, [supabaseCli, "status", "-o", "env"], {
  cwd: projectRoot,
  encoding: "utf8",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  windowsHide: true,
});
if (status.status !== 0) {
  throw new Error(`phase6_local_supabase_unavailable:${status.status}`);
}
const localSupabase = Object.fromEntries(
  status.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="([\s\S]*)"$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const controlToken = randomUUID();

process.env.CONNECTED_PANEL_E2E = "1";
process.env.E2E_PORT = "3016";
process.env.E2E_PLAYWRIGHT_CONFIG =
  "playwright.phase6-accessibility.config.ts";
process.env.APP_ORIGIN = "http://127.0.0.1:3016";
process.env.NEXT_PUBLIC_SUPABASE_URL = localSupabase.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = localSupabase.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = localSupabase.SERVICE_ROLE_KEY;
process.env.INNGEST_EVENT_KEY = "phase6-synthetic-event-key";
process.env.INNGEST_SIGNING_KEY = "signkey-test-phase6-synthetic";
process.env.PHASE5_E2E = "1";
process.env.PHASE5_E2E_RUN_ID = runId;
process.env.PHASE5_E2E_RUN_NUMBER = String(Date.now() % 100_000_000);
process.env.PHASE5_E2E_CONTROL_TOKEN = controlToken;

await import("./run-e2e.mjs");
