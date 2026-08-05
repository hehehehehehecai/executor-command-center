// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createFixtureSideEffectPreloaderSource } from "@/application/auth/testing/fixture-side-effect-preloader-source";
import { githubRepositorySelectionPublicFailureCodes } from "@/infrastructure/github-repository-selection/github-repository-selection-http";

const expectedFixtureIds = [
  "select_public_repository",
  "select_private_repository",
  "select_internal_repository",
  "select_fork_repository",
  "select_archived_repository",
  "select_disabled_repository",
  "select_multiple_repositories",
  "repeat_selection_idempotent",
  "concurrent_same_repository",
  "repository_rename_refresh",
  "zero_authorized_repositories",
  "repository_not_authorized",
  "repository_removed_after_page_load",
  "installation_not_registered",
  "installation_suspended",
  "installation_revoked",
  "installation_lookup_failed",
  "token_creation_failed",
  "repository_list_failed",
  "token_revoke_failed",
  "selection_storage_failed",
  "selection_lookup_failed",
  "cross_user_isolation",
  "browser_metadata_ignored",
  "invalid_repository_id",
  "extra_body_field_rejected",
  "foreign_origin_rejected",
  "missing_origin_rejected",
  "deselect_existing",
  "deselect_missing",
  "deselect_after_revoked",
  "refresh_restores_selection",
] as const;

const fixtureSchema = z
  .object({
    fixture_id: z.enum(expectedFixtureIds),
    fixture_version: z.literal("1.0.0"),
    source_type: z.literal("synthetic"),
    operation: z.enum(["select", "deselect", "list"]),
    repository_id: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    installation_status: z.enum([
      "active",
      "not_registered",
      "suspended",
      "revoked",
      "lookup_failed",
      "not_applicable",
    ]),
    authorized: z.boolean(),
    selected_before: z.boolean(),
    selected_after: z.boolean(),
    expected_http_status: z.number().int(),
    expected_failure_code: z.string().nullable(),
    database_write_count: z.number().int().nonnegative(),
    token_created: z.boolean(),
    revocation_attempted: z.boolean(),
    project_created: z.literal(false),
    sync_started: z.literal(false),
    real_github_called: z.literal(false),
    contains_real_secret: z.literal(false),
  })
  .strict();

const fixtureListSchema = z.array(fixtureSchema).length(32);
const expectedFixtureFingerprint =
  "sha256:6d04f1463fc86b644c60368e1acd1da9f8cd818edcdee122e543442dfa4acde0";
const expectedFixtureBlob =
  "7fb87289b3960b3aff0fb502c518cd2c00185da8";
const expectedFreezeBlob =
  "f040efeb2ead3149e85c5d17194c665a7f8c6d55";
const expectedIdSetFingerprint =
  "sha256:38afa72038819674c28afbacb8a3a6f2190f386225fd771ef647df85a6f4d6b5";
const expectedFailureCodeFingerprint =
  "sha256:d5638ce0a47ff1f98b8ac8ba677e081b3c1e2c7c73c66662b8c5d00d0d592d84";

let preloaderDirectory = "";
let preloaderUrl = "";

function canonicalFingerprint(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function gitBlob(pathname: string) {
  const result = spawnSync("git", ["hash-object", pathname], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

beforeAll(() => {
  preloaderDirectory = mkdtempSync(
    path.join(os.tmpdir(), "executor-selection-fixture-guard-"),
  );
  const preloaderPath = path.join(preloaderDirectory, "preloader.mjs");
  writeFileSync(
    preloaderPath,
    createFixtureSideEffectPreloaderSource(),
    "utf8",
  );
  preloaderUrl = pathToFileURL(preloaderPath).href;
});

afterAll(() => {
  if (preloaderDirectory) {
    rmSync(preloaderDirectory, { force: true, recursive: true });
  }
});

describe("Phase 5 repository selection fixture provenance", () => {
  it("strictly binds exactly 32 immutable synthetic cases to the pre-run freeze", () => {
    const fixturePath = path.resolve(
      "tests/fixtures/github-repository-selection/phase-5-fixtures.json",
    );
    const freezePath = path.resolve(
      "tests/fixtures/github-repository-selection/phase-5-pre-run-freeze.json",
    );
    const fixtureText = readFileSync(fixturePath, "utf8");
    const parsed = fixtureListSchema.parse(JSON.parse(fixtureText));
    const freeze = JSON.parse(readFileSync(freezePath, "utf8"));

    expect(parsed.map(({ fixture_id }) => fixture_id)).toEqual(
      expectedFixtureIds,
    );
    expect(new Set(parsed.map(({ fixture_id }) => fixture_id))).toHaveProperty(
      "size",
      32,
    );
    expect(freeze.fixture_count).toBe(32);
    expect(freeze.fixture_ids).toEqual(expectedFixtureIds);
    expect(freeze.fixture_blob).toBe(expectedFixtureBlob);
    expect(freeze.fixture_fingerprint).toBe(expectedFixtureFingerprint);
    expect(freeze.fixture_id_set_fingerprint).toBe(
      expectedIdSetFingerprint,
    );
    expect(freeze.failure_code_exact_set_fingerprint).toBe(
      expectedFailureCodeFingerprint,
    );
    expect(gitBlob(fixturePath)).toBe(expectedFixtureBlob);
    expect(gitBlob(freezePath)).toBe(expectedFreezeBlob);
    expect(canonicalFingerprint(fixtureText)).toBe(
      expectedFixtureFingerprint,
    );
    expect(
      canonicalFingerprint(JSON.stringify(sortedUnique(expectedFixtureIds))),
    ).toBe(expectedIdSetFingerprint);
    expect(
      canonicalFingerprint(
        JSON.stringify(
          sortedUnique(githubRepositorySelectionPublicFailureCodes),
        ),
      ),
    ).toBe(expectedFailureCodeFingerprint);
  });

  it("keeps canonical fingerprints stable across LF, CRLF, and CR but content-sensitive", () => {
    const fixtureText = readFileSync(
      path.resolve(
        "tests/fixtures/github-repository-selection/phase-5-fixtures.json",
      ),
      "utf8",
    );
    const lf = fixtureText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    expect(canonicalFingerprint(lf)).toBe(expectedFixtureFingerprint);
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r\n"))).toBe(
      expectedFixtureFingerprint,
    );
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r"))).toBe(
      expectedFixtureFingerprint,
    );
    for (const mutation of [
      `${lf} `,
      `${lf}\n`,
      lf.replace("select_public_repository", "select_real_repository"),
      lf.replace('"source_type":"synthetic"', '"source_type":"real"'),
    ]) {
      expect(canonicalFingerprint(mutation)).not.toBe(
        expectedFixtureFingerprint,
      );
    }
  });

  it("contains no real identity, secret, project, sync, or GitHub calls", () => {
    const fixtureText = readFileSync(
      path.resolve(
        "tests/fixtures/github-repository-selection/phase-5-fixtures.json",
      ),
      "utf8",
    );
    const fixtures = fixtureListSchema.parse(JSON.parse(fixtureText));

    expect(
      fixtures.every(
        (fixture) =>
          fixture.source_type === "synthetic" &&
          fixture.project_created === false &&
          fixture.sync_started === false &&
          fixture.real_github_called === false &&
          fixture.contains_real_secret === false,
      ),
    ).toBe(true);
    expect(fixtureText).not.toMatch(
      /private[_-]?key|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|@github\.com|gmail\.com/i,
    );
  });

  it("hard-rejects production before runner load or every preloaded side effect", () => {
    const entryPath = path.resolve(
      "scripts/run-repository-selection-fixture-e2e.mjs",
    );
    const result = spawnSync(
      process.execPath,
      ["--import", preloaderUrl, entryPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
        timeout: 3_000,
        windowsHide: true,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      "repository_selection_fixture_forbidden_in_production",
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "auth_fixture_side_effect_detected:",
    );
  });

  it("keeps the outer entry guard before dynamic runner import and ships no fixture route", () => {
    const source = readFileSync(
      path.resolve("scripts/run-repository-selection-fixture-e2e.mjs"),
      "utf8",
    );
    const guardIndex = source.indexOf(
      'process.env.NODE_ENV === "production"',
    );
    const importIndex = source.indexOf(
      'import("./repository-selection-fixture-runner.mjs")',
    );

    expect(source).not.toMatch(/^\s*import\s/m);
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(importIndex).toBeGreaterThan(guardIndex);

    const runnerSource = readFileSync(
      path.resolve("scripts/repository-selection-fixture-runner.mjs"),
      "utf8",
    );
    expect(runnerSource).toContain(
      "/rest/v1/rpc/ensure_selected_github_repository",
    );
    expect(runnerSource).toContain(
      "/rest/v1/rpc/remove_selected_github_repository",
    );
    expect(runnerSource).toContain("/rest/v1/selected_repositories");
    expect(runnerSource).toContain("project_created: false");
    expect(runnerSource).toContain("sync_started: false");

    const routeFiles = readdirSync(path.resolve("src/app"), {
      recursive: true,
    })
      .map(String)
      .filter((name) => /route\.(ts|tsx)$/.test(name));
    expect(routeFiles.some((name) => /fixture/i.test(name))).toBe(false);
  });
});
