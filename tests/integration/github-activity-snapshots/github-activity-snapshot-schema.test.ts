import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationsDirectory = path.join(projectRoot, "supabase", "migrations");
const typesPath = path.join(
  projectRoot,
  "src",
  "infrastructure",
  "database",
  "database.types.ts",
);
const expectedTables = [
  "github_repository_snapshots",
  "github_commits",
  "github_issues",
  "github_pull_requests",
  "github_releases",
  "github_workflow_runs",
  "github_document_snapshots",
] as const;
const migrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_create_github_activity_snapshots.sql"),
);

describe("github-activity-snapshots.v1 migration artifacts", () => {
  it("contains exactly one timestamped logical migration 0010", () => {
    expect(migrationNames).toHaveLength(1);
    expect(migrationNames[0]).toMatch(
      /^\d{14}_create_github_activity_snapshots\.sql$/,
    );

    const migration = readFileSync(
      path.join(migrationsDirectory, migrationNames[0]),
      "utf8",
    );
    expect(migration).toContain("-- logical_migration_id: 0010");
    expect(migration).toContain(
      "-- contract_version: github-activity-snapshots.v1",
    );
  });

  it("defines all seven typed snapshot tables without a raw response model", () => {
    expect(migrationNames).toHaveLength(1);
    const migration = readFileSync(
      path.join(migrationsDirectory, migrationNames[0]),
      "utf8",
    );

    for (const table of expectedTables) {
      expect(migration).toMatch(
        new RegExp(`create\\s+table\\s+public\\.${table}\\s*\\(`, "i"),
      );
    }
    expect(migration).not.toMatch(/raw_(?:response|payload)|api_(?:response|payload)/i);
  });

  it("publishes generated database types for every snapshot table", () => {
    const types = readFileSync(typesPath, "utf8");

    for (const table of expectedTables) {
      expect(types).toContain(`${table}: {`);
    }
  });
});
