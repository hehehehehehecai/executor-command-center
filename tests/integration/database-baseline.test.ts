import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const migrationsDirectory = path.join(projectRoot, "supabase", "migrations");
const seedPath = path.join(projectRoot, "supabase", "seed.sql");
const typesPath = path.join(
  projectRoot,
  "src",
  "infrastructure",
  "database",
  "database.types.ts",
);
const migrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_create_baseline.sql"),
);

describe("database baseline artifacts", () => {
  it("contains exactly one CLI timestamped create_baseline migration", () => {
    expect(migrationNames).toHaveLength(1);
    expect(migrationNames[0]).toMatch(/^\d{14}_create_baseline\.sql$/);
  });

  it("binds the migration to logical ID 0001 and database-baseline.v1", () => {
    const migration = readFileSync(
      path.join(migrationsDirectory, migrationNames[0]),
      "utf8",
    );

    expect(migration).toContain("-- logical_migration_id: 0001");
    expect(migration).toContain("-- contract_version: database-baseline.v1");
  });

  it("keeps seed.sql free of DDL", () => {
    const seed = readFileSync(seedPath, "utf8");

    expect(seed).not.toMatch(/\b(?:create|alter|drop|grant|revoke)\b/i);
  });

  it("has generated local database types", () => {
    expect(existsSync(typesPath)).toBe(true);
  });

  it("includes app_private and database_baseline in generated types", () => {
    const types = readFileSync(typesPath, "utf8");

    expect(types).toContain("app_private");
    expect(types).toContain("database_baseline");
  });

  it(
    "passes the committed type drift check",
    () => {
      const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      const result = spawnSync(command, ["run", "db:types:check"], {
        cwd: projectRoot,
        encoding: "utf8",
        env: process.env,
        shell: process.platform === "win32",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    },
    30_000,
  );
});
