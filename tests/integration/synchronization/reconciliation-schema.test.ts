import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260806153000_create_repository_reconciliation.sql",
);

describe("Phase 7 reconciliation schema contract", () => {
  it("binds the unique logical migration and service-role-only database surface", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("-- logical_migration_id: 0014");
    expect(sql).toContain("create table public.project_sync_dispatches");
    expect(sql).toContain("unique (project_id, request_identity)");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("enable row level security");
    expect(sql).toMatch(/revoke all on table public\.project_sync_dispatches[\s\S]*from public, anon, authenticated, service_role;/i);

    for (const signature of [
      "public.list_reconciliation_projects(timestamptz)",
      "public.request_project_sync(uuid,text,text,uuid,timestamptz)",
      "public.claim_project_sync_dispatch(uuid,uuid,bigint,timestamptz)",
      "public.complete_project_sync_dispatch(uuid,uuid,bigint,text,timestamptz)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature}`);
      expect(sql).toContain(`grant execute on function ${signature}`);
      expect(sql).toContain("to service_role");
    }
  });

  it("keeps generated database types aligned to every Phase 7 table and RPC", async () => {
    const types = await readFile(
      path.join(root, "src", "infrastructure", "database", "database.types.ts"),
      "utf8",
    );

    for (const symbol of [
      "project_sync_dispatches",
      "list_reconciliation_projects",
      "request_project_sync",
      "claim_project_sync_dispatch",
      "complete_project_sync_dispatch",
    ]) {
      expect(types).toContain(symbol);
    }
  });

  it("does not add raw provider or credential columns to the dispatch inbox", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const createTable = sql.match(/create table public\.project_sync_dispatches \(([\s\S]*?)\n\);/i)?.[1];

    expect(createTable).toBeDefined();
    expect(createTable).not.toMatch(/raw_payload|raw_response|source_code|\bdiff\b|secret|token|authorization|signature|cookie/i);
  });
});
