import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rawPreviewBaseUrl = process.env.PREVIEW_BASE_URL?.trim();

if (!rawPreviewBaseUrl) {
  process.stderr.write("PREVIEW_BASE_URL is required.\n");
  process.exit(1);
}

let previewBaseUrl;

try {
  previewBaseUrl = new URL(rawPreviewBaseUrl);
} catch {
  process.stderr.write("PREVIEW_BASE_URL must be a valid HTTPS URL.\n");
  process.exit(1);
}

if (previewBaseUrl.protocol !== "https:") {
  process.stderr.write("PREVIEW_BASE_URL must use HTTPS.\n");
  process.exit(1);
}

if (previewBaseUrl.username || previewBaseUrl.password) {
  process.stderr.write("PREVIEW_BASE_URL must not contain credentials.\n");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const playwrightPackage = require.resolve("@playwright/test/package.json");
const playwrightCli = path.join(path.dirname(playwrightPackage), "cli.js");
const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", "--config=playwright.preview.config.ts"],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      PREVIEW_BASE_URL: previewBaseUrl.toString(),
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
