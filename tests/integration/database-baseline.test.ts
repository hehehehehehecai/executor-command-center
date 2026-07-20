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
const pgtapTestPath = path.join(
  projectRoot,
  "supabase",
  "tests",
  "0001_database_baseline_test.sql",
);
const packageJsonPath = path.join(projectRoot, "package.json");
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

  it("does not persist pgTAP in the baseline migration", () => {
    const migration = readFileSync(
      path.join(migrationsDirectory, migrationNames[0]),
      "utf8",
    );

    expect(migration).not.toMatch(
      /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?pgtap\b/i,
    );
  });

  it("creates pgTAP inside the test transaction and rolls it back", () => {
    const pgtapTest = readFileSync(pgtapTestPath, "utf8").toLowerCase();
    const beginIndex = pgtapTest.indexOf("begin;");
    const createExtensionIndex = pgtapTest.indexOf(
      "create extension if not exists pgtap with schema extensions;",
    );
    const finishIndex = pgtapTest.indexOf("select * from finish();");
    const rollbackIndex = pgtapTest.lastIndexOf("rollback;");

    expect([
      beginIndex,
      createExtensionIndex,
      finishIndex,
      rollbackIndex,
    ]).not.toContain(-1);
    expect(beginIndex).toBeLessThan(createExtensionIndex);
    expect(createExtensionIndex).toBeLessThan(finishIndex);
    expect(finishIndex).toBeLessThan(rollbackIndex);
    expect(pgtapTest.trimEnd().endsWith("rollback;")).toBe(true);
  });

  it("defines the exact full-database lint command", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["db:lint"]).toBe(
      "supabase db lint --local --level error --fail-on error",
    );
  });

  it("does not weaken the database lint gate", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const dbLint = packageJson.scripts?.["db:lint"];

    expect(dbLint).toBeTypeOf("string");
    expect(dbLint).not.toMatch(/--schema\b|allowlist/i);
    expect(dbLint).not.toMatch(/\||\b(?:grep|findstr|select-string)\b/i);
    expect(dbLint).not.toMatch(/(?:^|[;&])\s*exit\s+0\b|\|\|\s*true\b/i);
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
