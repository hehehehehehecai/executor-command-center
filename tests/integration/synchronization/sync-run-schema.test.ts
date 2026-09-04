// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsPath = path.join(root, "supabase", "migrations");
const migrationName = "20260805190000_create_sync_runs.sql";
const migrationPath = path.join(migrationsPath, migrationName);
const migration = () => readFileSync(migrationPath, "utf8");
const databaseTypes = () => readFileSync(
  path.join(root, "src", "infrastructure", "database", "database.types.ts"),
  "utf8",
);
const freeze = () => JSON.parse(readFileSync(
  path.join(root, "tests", "fixtures", "synchronization", "stage3-task2-pre-run-freeze.json"),
  "utf8",
)) as Record<string, unknown>;

describe("sync-runs.v1 migration contract", () => {
  it("adds exactly one logical 0011 migration without changing Task 1", () => {
    const task2Migrations = readdirSync(migrationsPath).filter((name) =>
      name.endsWith("_create_sync_runs.sql"),
    );
    expect(task2Migrations).toEqual([migrationName]);
    expect(migration()).toContain("-- logical_migration_id: 0011");
    expect(migration()).toContain("-- contract_versions: sync-runs.v1");
    expect(freeze().baseline).toMatchObject({
      commit: "dac9b66daaf18d7fe0edefc4d56fd07ecb40fef0",
      tree: "6793406ca68394f3f3e2833519690c2c24067933",
    });
  });

  it("creates project-owned SyncRun storage with exact status and idempotency contracts", () => {
    const sql = migration();
    expect(sql).toMatch(/create table public\.sync_runs\s*\(/i);
    expect(sql).toMatch(/project_id uuid not null[\s\S]*references public\.projects\(id\) on delete cascade/i);
    expect(sql).toMatch(/unique\s*\(project_id, idempotency_key\)/i);
    for (const status of ["queued", "running", "partial", "completed", "failed", "cancelled"]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toMatch(/sync_runs_status_timestamps_check/i);
    expect(sql).toMatch(/sync_runs_project_created_idx/i);
    expect(sql).toMatch(/sync_runs_project_active_updated_idx/i);
  });

  it("enables owner-only reads and removes all direct browser/service writes", () => {
    const sql = migration();
    expect(sql).toMatch(/alter table public\.sync_runs enable row level security/i);
    expect(sql).toMatch(/create policy sync_runs_select_own[\s\S]*projects[\s\S]*auth\.uid\(\)/i);
    expect(sql).toMatch(/revoke all on table public\.sync_runs[\s\S]*service_role/i);
    expect(sql).toMatch(/grant select on table public\.sync_runs to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.create_sync_run[\s\S]*to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.transition_sync_run[\s\S]*to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.get_latest_sync_run[\s\S]*to service_role/i);
  });

  it("uses conditional versioned transitions and does not store derived Freshness", () => {
    const sql = migration();
    expect(sql).toMatch(/where[\s\S]*project_id = p_project_id[\s\S]*status = p_expected_status[\s\S]*version = p_expected_version/i);
    expect(sql).toMatch(/version = sync_run_record\.version \+ 1/i);
    expect(sql).not.toMatch(/freshness_status\s+(?:text|varchar|character varying)/i);
  });

  it("contains no secret, authorization header, or raw GitHub payload columns", () => {
    const sql = migration();
    expect(sql).not.toMatch(/\b(?:token|secret|authorization_header|raw_payload|raw_response|github_payload)\b\s+(?:text|json|jsonb|bytea)/i);
  });

  it("binds generated database types to sync_runs and all RPCs", () => {
    const types = databaseTypes();
    expect(types).toMatch(/sync_runs:\s*\{/);
    expect(types).toMatch(/create_sync_run:/);
    expect(types).toMatch(/get_latest_sync_run:/);
    expect(types).toMatch(/transition_sync_run:/);
  });
});
