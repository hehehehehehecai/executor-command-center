import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dockerMetadata, inspectOwnedApi, inspectOwnedContainer, isolationDblinkConnection, loadTarget, ownSql, projectRoot, verifyIsolatedDatabase } from "./isolated-test-target.mjs";

const cli = path.join(projectRoot, "node_modules", "supabase", "dist", "supabase.js");
const commands = {
  start: [cli, "start"], reset: [cli, "db", "reset", "--local"],
  lint: [cli, "db", "lint", "--local", "--level", "error", "--fail-on", "error"],
  test: [cli, "test", "db", "--local"], stop: [cli, "stop"],
  migrate: [cli, "migration", "up", "--local", "--agent", "no"],
  types: [path.join(projectRoot, "scripts", "generate-database-types.mjs"), "--check"],
  drift: [path.join(projectRoot, "scripts", "check-database-drift.mjs")],
  "integration-app": [path.join(projectRoot, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.integration.config.ts", "--maxWorkers=1"],
};

function establishProof(target, previousProof) {
  const container = inspectOwnedContainer(target);
  const api = inspectOwnedApi(target);
  const connection = isolationDblinkConnection(container);
  const raw = ownSql(container.containerId, "BEGIN READ ONLY; SELECT json_build_object('systemIdentifier', system_identifier::text, 'database', current_database(), 'port', current_setting('port'), 'sockets', current_setting('unix_socket_directories')) FROM pg_control_system(); COMMIT;");
  const identity = JSON.parse(raw.split(/\r?\n/).find((line) => line.startsWith("{")) ?? "null");
  if (identity?.database !== "postgres" || identity.port !== "5432" || !identity.sockets.split(",").map((s) => s.trim()).includes("/var/run/postgresql")) throw new Error("isolation_primary_identity_invalid");
  ownSql(container.containerId, `ALTER DATABASE postgres SET "executor.test_batch" TO '${target.batchId}'; ALTER DATABASE postgres SET "executor.test_dblink_connection" TO '${connection}'; CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;`, "supabase_admin");
  const secondary = ownSql(container.containerId, `BEGIN READ ONLY; SELECT remote.identifier FROM extensions.dblink('${connection}', 'SELECT system_identifier::text FROM pg_control_system()') AS remote(identifier text); COMMIT;`).split(/\r?\n/).find((line) => /^\d+$/.test(line));
  if (secondary !== identity.systemIdentifier) throw new Error("isolation_secondary_identity_mismatch");
  const proof = { schema: "isolated-test-proof.v1", batchId: target.batchId, projectId: target.projectId, ...container, ...api, systemIdentifier: identity.systemIdentifier, secondarySystemIdentifier: secondary, dblinkConnection: connection, createdAt: new Date().toISOString() };
  if (previousProof) writeFileSync(path.join(path.dirname(target.proofPath), `target-proof-before-reset-${Date.now()}.json`), previousProof);
  writeFileSync(target.proofPath, JSON.stringify(proof, null, 2) + "\n");
  verifyIsolatedDatabase();
  console.log(JSON.stringify({ event: "isolation_identity_verified", ...proof }));
}

try {
  const operation = process.argv[2];
  if (process.argv.length !== 3 || (!commands[operation] && !["check-config", "verify"].includes(operation))) throw new Error("isolation_operation_invalid");
  const target = loadTarget();
  if (operation === "check-config") {
    console.log(JSON.stringify({ stage: "offline_configuration_only", batchId: target.batchId, projectId: target.projectId, containerName: target.containerName, apiUrl: target.apiUrl, databasePort: target.ports.db, liveProof: false }));
  } else if (operation === "verify") {
    const verified = verifyIsolatedDatabase();
    console.log(JSON.stringify({ event: "isolation_before_operation", operation, instanceBatchId: target.batchId, executionBatchId: target.executionBatchId, containerId: verified.containerId, systemIdentifier: verified.systemIdentifier }));
  } else {
    let previousProof;
    const receiptPath = path.join(path.dirname(target.proofPath), "target-created.json");
    const completingOwnStart = operation === "start" && existsSync(receiptPath);
    if (completingOwnStart) {
      if (existsSync(target.proofPath)) throw new Error("isolation_fresh_instance_required");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const container = inspectOwnedContainer(target);
      const api = inspectOwnedApi(target);
      if (receipt.batchId !== target.batchId || receipt.projectId !== target.projectId || receipt.containerId !== container.containerId || receipt.apiContainerId !== api.apiContainerId) throw new Error("isolation_creation_receipt_mismatch");
      const [metadata] = JSON.parse(dockerMetadata(["inspect", container.containerId]));
      if (metadata.Created !== receipt.containerCreatedAt) throw new Error("isolation_creation_time_mismatch");
      establishProof(target);
    } else if (operation === "start") {
      if (existsSync(target.proofPath)) throw new Error("isolation_fresh_instance_required");
      const containers = dockerMetadata(["ps", "-a", "--format", "{{.Names}}"]);
      const volumes = dockerMetadata(["volume", "ls", "--format", "{{.Name}}"]);
      if (containers.includes(target.projectId) || volumes.includes(target.projectId)) throw new Error("isolation_existing_resource_forbidden");
    } else {
      const verified = verifyIsolatedDatabase();
      console.log(JSON.stringify({ event: "isolation_before_operation", operation, batchId: target.batchId, containerId: verified.containerId, systemIdentifier: verified.systemIdentifier }));
      if (operation === "reset") previousProof = readFileSync(target.proofPath);
    }
    if (!completingOwnStart) {
      const result = spawnSync(process.execPath, commands[operation], { cwd: projectRoot, env: process.env, stdio: "inherit", windowsHide: true });
      process.exitCode = result.status ?? 1;
      if (result.status === 0 && operation === "start") {
        const container = inspectOwnedContainer(target);
        const api = inspectOwnedApi(target);
        const [metadata] = JSON.parse(dockerMetadata(["inspect", container.containerId]));
        writeFileSync(receiptPath, JSON.stringify({ batchId: target.batchId, projectId: target.projectId, ...container, ...api, containerCreatedAt: metadata.Created, recordedAt: new Date().toISOString() }, null, 2) + "\n");
      }
      if (result.status === 0 && (operation === "start" || operation === "reset")) establishProof(target, previousProof);
    }
  }
} catch (error) {
  console.error(JSON.stringify({ event: "isolation_refused", reason: error.message, operation: process.argv[2], note: "不回落旧实例或远程目标；未通过前置门的依赖动作不运行" }));
  process.exitCode = 1;
}
