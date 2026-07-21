import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliPath = path.join(
  projectRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const temporaryDirectory = mkdtempSync(
  path.join(os.tmpdir(), "executor-schema-drift-"),
);
const diffPath = path.join(temporaryDirectory, "schema-diff.sql");

try {
  if (!existsSync(cliPath)) {
    throw new Error(`Project Supabase CLI is missing at ${cliPath}`);
  }

  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "db",
      "diff",
      "--local",
      "--schema",
      "public,app_private",
      "--output",
      diffPath,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(
      result.stderr || result.stdout || "Supabase schema diff failed.\n",
    );
    process.exitCode = result.status ?? 1;
  } else {
    const schemaDiff = existsSync(diffPath)
      ? readFileSync(diffPath, "utf8").trim()
      : "";

    if (schemaDiff !== "") {
      process.stderr.write(
        "Database schema drift detected against committed migrations.\n",
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Database schema drift is empty.\n");
    }
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
