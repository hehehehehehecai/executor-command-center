import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Harness entry points run from their frozen worktree. loadTarget verifies its
// complete configuration and source hashes before any external access.
export const projectRoot = path.resolve(process.cwd());
const dockerEndpoint = "npipe:////./pipe/dockerDesktopLinuxEngine";
export function isolationDblinkConnection(container) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(container.databaseAddress ?? "")) fail("isolation_database_address_required");
  return `dbname=postgres hostaddr=${container.databaseAddress} port=5432 user=postgres password=postgres application_name=executor_t00_isolated`;
}
const fail = (message) => { throw new Error(message); };
const digest = (data) => createHash("sha256").update(data).digest("hex");

export function validateTarget(value, explicitBatch) {
  if (!explicitBatch) fail("isolation_batch_required");
  const match = /^explorer-seven-fixes-v2-T00-REDO-([a-f0-9]{16})$/.exec(explicitBatch);
  if (!match || value?.schema !== "isolated-test-target.v1" || value.batchId !== explicitBatch) fail("isolation_batch_mismatch");
  const projectId = `executor-t00-redo-${match[1].slice(0, 12)}`;
  if (value.projectId !== projectId) fail("isolation_project_mismatch");
  const ports = value.ports;
  for (const key of ["db", "api", "shadow", "studio", "mail", "analytics", "pooler"]) {
    if (!Number.isInteger(ports?.[key]) || ports[key] < 56000 || ports[key] > 56999) fail("isolation_port_invalid");
  }
  if (!Number.isInteger(ports.inspector) || ports.inspector < 28000 || ports.inspector > 28999) fail("isolation_port_invalid");
  if (new Set(Object.values(ports)).size !== Object.values(ports).length) fail("isolation_port_collision");
  return { ...value, containerName: `supabase_db_${projectId}`, apiUrl: `http://127.0.0.1:${ports.api}` };
}

export function validateApiUrl(url, target) {
  const expected = `http://127.0.0.1:${target.ports.api}`;
  if (url !== expected) fail("isolation_api_mismatch");
  return expected;
}

export function loadTarget() {
  if (!process.env.EXECUTOR_TEST_TARGET_FILE) fail("isolation_target_file_required");
  const manifestPath = path.resolve(process.env.EXECUTOR_TEST_TARGET_FILE);
  const target = validateTarget(JSON.parse(readFileSync(manifestPath, "utf8")), process.env.EXECUTOR_TEST_BATCH_ID);
  // A reused instance retains its original database batch. A new execution has
  // its own manifest, proof copy and append-only access log.
  if (target.executionBatchId || process.env.EXECUTOR_TEST_EXECUTION_BATCH_ID) {
    if (!target.executionBatchId || target.executionBatchId !== process.env.EXECUTOR_TEST_EXECUTION_BATCH_ID) fail("isolation_execution_batch_mismatch");
    if (!/^[a-f0-9]{64}$/.test(target.proofSha256 ?? "")) fail("isolation_proof_freeze_required");
  }
  const configPath = path.join(projectRoot, "supabase", "config.toml");
  const config = readFileSync(configPath);
  if (digest(config) !== target.configSha256) fail("isolation_config_hash_mismatch");
  const content = config.toString("utf8");
  if (!content.includes(`project_id = "${target.projectId}"`)) fail("isolation_config_project_mismatch");
  const sections = Object.fromEntries(content.split(/^\[([^\]]+)\]\s*$/m).slice(1).reduce((pairs, item, index, all) => index % 2 === 0 ? [...pairs, [item, all[index + 1]]] : pairs, []));
  const expected = { db: ["db", "port"], api: ["api", "port"], shadow: ["db", "shadow_port"], studio: ["studio", "port"], mail: ["local_smtp", "port"], analytics: ["analytics", "port"], pooler: ["db.pooler", "port"], inspector: ["edge_runtime", "inspector_port"] };
  for (const [name, [section, key]] of Object.entries(expected)) {
    const actual = new RegExp(`^${key} = (\\d+)$`, "m").exec(sections[section] ?? "");
    if (Number(actual?.[1]) !== target.ports[name]) fail("isolation_config_port_mismatch");
  }
  if (existsSync(path.join(projectRoot, "supabase", ".temp", "project-ref"))) fail("isolation_linked_project_forbidden");
  for (const name of ["DATABASE_URL", "SUPABASE_DB_URL", "SUPABASE_ACCESS_TOKEN", "PGHOST", "PGPORT", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
    if (process.env[name]) fail("isolation_remote_environment_forbidden");
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) validateApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, target);
  if (process.env.SUPABASE_PROFILE !== "supabase") fail("isolation_profile_required");
  if (path.resolve(process.env.SUPABASE_HOME ?? "") !== path.join(path.dirname(manifestPath), "local-supabase-home")) fail("isolation_home_mismatch");
  if (process.env.DOCKER_HOST !== dockerEndpoint || process.env.DOCKER_CONTEXT) fail("isolation_local_docker_endpoint_required");
  if (!target.sourceHashes || Object.keys(target.sourceHashes).length === 0) fail("isolation_source_freeze_required");
  for (const [relative, expectedHash] of Object.entries(target.sourceHashes)) {
    const sourcePath = path.resolve(projectRoot, relative);
    if (path.relative(projectRoot, sourcePath).startsWith("..") || digest(readFileSync(sourcePath)) !== expectedHash) fail("isolation_source_changed");
  }
  return { ...target, manifestPath, proofPath: path.join(path.dirname(manifestPath), "target-proof.json") };
}

export function dockerMetadata(args) {
  const result = spawnSync("docker", ["--host", dockerEndpoint, ...args], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (result.status !== 0) fail("isolation_docker_metadata_unavailable");
  return result.stdout;
}

export function validateContainer(inspected, target) {
  const containerName = `supabase_db_${target.projectId}`;
  if (inspected?.Name !== `/${containerName}` || inspected.Config?.Labels?.["com.supabase.cli.project"] !== target.projectId || !/^[a-f0-9]{64}$/.test(inspected.Id ?? "")) fail("isolation_container_mismatch");
  const bindings = inspected.HostConfig?.PortBindings?.["5432/tcp"];
  if (!bindings?.length || bindings.some((binding) => binding.HostPort !== String(target.ports.db))) fail("isolation_container_port_mismatch");
  if (!inspected.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === containerName && mount.Destination.startsWith("/var/lib/postgresql"))) fail("isolation_volume_mismatch");
  return { containerName, containerId: inspected.Id, volumeName: containerName };
}

export function inspectOwnedContainer(target) {
  const inspected = JSON.parse(dockerMetadata(["inspect", target.containerName]));
  const container = validateContainer(inspected[0], target);
  const network = inspected[0].NetworkSettings?.Networks?.[`supabase_network_${target.projectId}`];
  if (!network?.IPAddress || !/^[a-f0-9]{64}$/.test(network.NetworkID ?? "")) fail("isolation_network_mismatch");
  return { ...container, databaseAddress: network.IPAddress, networkId: network.NetworkID };
}

export function inspectOwnedApi(target) {
  const name = `supabase_kong_${target.projectId}`;
  const [inspected] = JSON.parse(dockerMetadata(["inspect", name]));
  const bindings = inspected?.HostConfig?.PortBindings?.["8000/tcp"];
  if (inspected?.Name !== `/${name}` || inspected.Config?.Labels?.["com.supabase.cli.project"] !== target.projectId || !bindings?.length || bindings.some((binding) => binding.HostPort !== String(target.ports.api))) fail("isolation_api_container_mismatch");
  return { apiContainerId: inspected.Id, apiContainerName: name };
}

export function ownSql(containerId, sql, role = "postgres") {
  if (!/^[a-f0-9]{64}$/.test(containerId)) fail("isolation_container_id_required");
  if (!["postgres", "supabase_admin"].includes(role)) fail("isolation_role_invalid");
  const result = spawnSync("docker", ["--host", dockerEndpoint, "exec", containerId, "psql", "-X", "-U", role, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (result.status !== 0) fail("isolation_owned_database_query_failed");
  return result.stdout.trim();
}

export function verifyIsolatedDatabase() {
  const target = loadTarget();
  if (!existsSync(target.proofPath)) fail("isolation_live_proof_required");
  const proofBytes = readFileSync(target.proofPath);
  if (target.proofSha256 && digest(proofBytes) !== target.proofSha256) fail("isolation_proof_hash_mismatch");
  const proof = JSON.parse(proofBytes.toString("utf8"));
  if (proof.batchId !== target.batchId || proof.projectId !== target.projectId) fail("isolation_proof_mismatch");
  if (target.executionBatchId && proof.executionBatchId !== target.executionBatchId) fail("isolation_proof_execution_mismatch");
  const container = inspectOwnedContainer(target);
  const api = inspectOwnedApi(target);
  if (container.containerId !== proof.containerId) fail("isolation_container_changed");
  if (api.apiContainerId !== proof.apiContainerId) fail("isolation_api_container_changed");
  const identity = ownSql(container.containerId, "BEGIN READ ONLY; SELECT json_build_object('systemIdentifier', system_identifier::text, 'batchId', current_setting('executor.test_batch', true), 'connection', current_setting('executor.test_dblink_connection', true)) FROM pg_control_system(); COMMIT;").split(/\r?\n/).find((line) => line.startsWith("{"));
  const current = JSON.parse(identity ?? "null");
  if (current?.systemIdentifier !== proof.systemIdentifier || current.batchId !== target.batchId || current.connection !== proof.dblinkConnection) fail("isolation_database_identity_mismatch");
  if (current.connection !== isolationDblinkConnection(container) || container.networkId !== proof.networkId || container.databaseAddress !== proof.databaseAddress) fail("isolation_secondary_target_mismatch");
  appendFileSync(path.join(path.dirname(target.manifestPath), "isolation-access.jsonl"), JSON.stringify({ at: new Date().toISOString(), batchId: target.batchId, executionBatchId: target.executionBatchId, containerId: container.containerId, networkId: container.networkId, databaseAddress: container.databaseAddress, systemIdentifier: proof.systemIdentifier, apiUrl: target.apiUrl, caller: new Error().stack?.split("\n").slice(2, 6) }) + "\n");
  return { ...target, ...container, systemIdentifier: proof.systemIdentifier };
}

export function verifiedContainerName() {
  return verifyIsolatedDatabase().containerId;
}

export function assertIsolatedApiUrl(url) {
  const target = verifyIsolatedDatabase();
  return validateApiUrl(url, target);
}

export function readIsolatedStatus() {
  const target = verifyIsolatedDatabase();
  const cli = path.join(projectRoot, "node_modules", "supabase", "dist", "supabase.js");
  const result = spawnSync(process.execPath, [cli, "status", "--output", "json", "--agent", "no"], { cwd: projectRoot, env: process.env, encoding: "utf8", windowsHide: true, timeout: 30000 });
  if (result.status !== 0) fail("isolation_status_unavailable");
  const values = JSON.parse(result.stdout);
  validateApiUrl(values.API_URL, target);
  const databaseUrl = new URL(values.DB_URL);
  if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.port !== String(target.ports.db) || databaseUrl.pathname !== "/postgres") fail("isolation_status_database_mismatch");
  // Never log these values. Existing fixture parsers consume the same env format.
  const stdout = ["API_URL", "ANON_KEY", "JWT_SECRET", "SERVICE_ROLE_KEY"].map((key) => {
    if (typeof values[key] !== "string" || /[\r\n"]/.test(values[key])) fail("isolation_status_field_invalid");
    return `${key}="${values[key]}"`;
  }).join("\n");
  return { status: 0, stdout, stderr: "" };
}
