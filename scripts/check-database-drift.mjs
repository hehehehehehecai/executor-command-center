import { dockerMetadata, verifyIsolatedDatabase } from "./isolated-test-target.mjs";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = verifyIsolatedDatabase();
const shadowName = `supabase_shadow_${target.projectId}`;
const shadowContainer = dockerMetadata(["ps", "-a", "--filter", `name=^/${shadowName}$`, "--format", "{{.ID}}"]);
const shadowPortOwner = dockerMetadata(["ps", "--filter", `publish=${target.ports.shadow}`, "--format", "{{.ID}}"]);
if (shadowContainer.trim() || shadowPortOwner.trim()) throw new Error("isolation_shadow_resource_already_exists");
const ownedContainers = () => dockerMetadata(["ps", "-a", "--filter", `label=com.supabase.cli.project=${target.projectId}`, "--format", "{{.ID}} {{.Names}}"]).trim().split(/\r?\n/).filter(Boolean).sort();
const containersBefore = ownedContainers();
const evidenceDirectory = path.dirname(target.manifestPath);
const evidenceLabel = `schema-drift-${Date.now()}`;
writeFileSync(path.join(evidenceDirectory, `${evidenceLabel}-preflight.json`), JSON.stringify({ projectId: target.projectId, executionBatchId: target.executionBatchId, shadowName, shadowPort: target.ports.shadow, containersBefore, primaryContainerId: target.containerId, systemIdentifier: target.systemIdentifier }, null, 2) + "\n");

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
const temporaryRoot = realpathSync(os.tmpdir());
const temporaryPrefix = `executor-schema-drift-${target.projectId}-`;
const temporaryDirectory = mkdtempSync(path.join(temporaryRoot, temporaryPrefix));
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

  if (result.stdout) process.stdout.write(result.stdout);
  if (existsSync(diffPath)) writeFileSync(path.join(evidenceDirectory, `${evidenceLabel}.sql`), readFileSync(diffPath));

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
  const resolved = realpathSync(temporaryDirectory);
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith(temporaryPrefix)) throw new Error("isolation_temporary_cleanup_path_invalid");
  rmSync(resolved, { recursive: true, force: true });
  const containersAfter = ownedContainers();
  const verifiedAfter = verifyIsolatedDatabase();
  const extraContainers = containersAfter.filter(value => !containersBefore.includes(value));
  writeFileSync(path.join(evidenceDirectory, `${evidenceLabel}-after.json`), JSON.stringify({ containersAfter, extraContainers, temporaryDirectory: resolved, temporaryRemoved: !existsSync(resolved), primaryContainerId: verifiedAfter.containerId, systemIdentifier: verifiedAfter.systemIdentifier }, null, 2) + "\n");
  if (extraContainers.length) throw new Error("isolation_shadow_cleanup_incomplete");
}
