import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const moduleUrl = new URL("./isolated-test-target.mjs", import.meta.url);
const guard = existsSync(moduleUrl) ? await import(moduleUrl.href) : null;
const batchId = "explorer-seven-fixes-v2-T00-REDO-bcaa843c4f2ac88c";
const target = {
  schema: "isolated-test-target.v1",
  batchId,
  projectId: "executor-t00-redo-bcaa843c4f2a",
  ports: { db: 56322, api: 56321, shadow: 56320, studio: 56323, mail: 56324, analytics: 56327, pooler: 56329, inspector: 28083 },
};
function validate(value, batch = batchId) {
  assert.equal(typeof guard?.validateTarget, "function", "missing fail-closed database target guard");
  return guard.validateTarget(value, batch);
}

test("missing explicit batch refuses database target resolution", () => {
  assert.throws(() => validate(target, null), /isolation_batch_required/);
});
test("old project and old port never become a usable target", () => {
  assert.throws(() => validate({ ...target, projectId: "executor-command-center" }), /isolation_project_mismatch/);
  assert.throws(() => validate({ ...target, ports: { ...target.ports, db: 54322 } }), /isolation_port_invalid/);
});
test("another batch cannot reuse the target identity", () => {
  assert.throws(() => validate(target, "explorer-seven-fixes-v2-T00-REDO-1111111111111111"), /isolation_batch_mismatch/);
});
test("the explicit fresh target derives only its own container and loopback API", () => {
  const result = validate(target);
  assert.equal(result.containerName, "supabase_db_executor-t00-redo-bcaa843c4f2a");
  assert.equal(result.apiUrl, "http://127.0.0.1:56321");
});
test("duplicate ports are rejected before resource access", () => {
  assert.throws(() => validate({ ...target, ports: { ...target.ports, api: 56322 } }), /isolation_port_collision/);
});
test("foreign or old API endpoints are rejected without requests", () => {
  validate(target);
  assert.throws(() => guard.validateApiUrl("https://example.supabase.co", target), /isolation_api_mismatch/);
  assert.throws(() => guard.validateApiUrl("http://127.0.0.1:54321", target), /isolation_api_mismatch/);
  assert.equal(guard.validateApiUrl("http://127.0.0.1:56321", target), "http://127.0.0.1:56321");
});
test("container labels and host port must both belong to the target", () => {
  validate(target);
  const inspected = {
    Id: "a".repeat(64), Name: "/supabase_db_executor-t00-redo-bcaa843c4f2a",
    Config: { Labels: { "com.supabase.cli.project": target.projectId } },
    HostConfig: { PortBindings: { "5432/tcp": [{ HostPort: "56322" }] } },
    Mounts: [{ Type: "volume", Name: "supabase_db_executor-t00-redo-bcaa843c4f2a", Destination: "/var/lib/postgresql/data" }],
  };
  assert.equal(guard.validateContainer(inspected, target).containerId, "a".repeat(64));
  assert.throws(() => guard.validateContainer({ ...inspected, Name: "/supabase_db_executor-command-center" }, target), /isolation_container_mismatch/);
  assert.throws(() => guard.validateContainer({ ...inspected, Config: { Labels: {} } }, target), /isolation_container_mismatch/);
  assert.throws(() => guard.validateContainer({ ...inspected, HostConfig: { PortBindings: { "5432/tcp": [{ HostPort: "54322" }] } } }, target), /isolation_container_port_mismatch/);
});
