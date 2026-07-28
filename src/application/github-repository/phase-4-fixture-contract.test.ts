// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureSideEffectPreloaderSource } from "@/application/auth/testing/fixture-side-effect-preloader-source";
import { githubRepositoryFailureDefinitions } from "@/infrastructure/github/github-repository-http";

const expectedFixtureIds = [
  "active_zero_repositories",
  "active_one_public_repository",
  "active_private_repository",
  "active_internal_repository",
  "active_selected_repositories",
  "active_all_repositories",
  "multiple_pages",
  "exact_page_boundary",
  "installation_not_registered",
  "installation_suspended",
  "installation_revoked",
  "installation_lookup_failure",
  "token_unauthorized",
  "token_forbidden",
  "token_not_found",
  "token_rate_limited",
  "token_timeout",
  "token_invalid_response",
  "opaque_new_format_token",
  "repository_unauthorized",
  "repository_forbidden",
  "repository_rate_limited",
  "repository_timeout",
  "repository_invalid_json",
  "repository_invalid_schema",
  "total_count_changes",
  "duplicate_repository_id",
  "duplicate_full_name",
  "count_mismatch",
  "page_limit_exceeded",
  "middle_page_failure",
  "revoke_failure_after_success",
  "revoke_failure_after_list_failure",
  "unauthenticated_request",
] as const;
const expectedFingerprint =
  "sha256:ba1ecd36e0fceb90588cb058457f05eeabe4448930abca8b2bb2fccec3fae0d2";
const expectedRepairFixtureIds = [
  "app_configuration_missing",
  "app_authentication_failed",
  "token_unavailable",
  "repository_list_failed",
] as const;
const expectedRepairFingerprint =
  "sha256:1d77f4da7952babd48152100749c3776d4666f7fb5c46d01e57beb9655df5738";
const expectedRepairFixtureBlob =
  "a0c2af276d4c216dc8e2eb493961b47cb1781be1";
const expectedRepairFreezeBlob =
  "1adcee5faafea21631c828efd26a5d1febcafae8";
let preloaderDirectory = "";
let preloaderUrl = "";

function canonicalFingerprint(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function difference(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
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
    path.join(os.tmpdir(), "executor-repository-fixture-guard-"),
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

describe("Phase 4 repository fixture provenance", () => {
  it("binds every synthetic case to the pre-run freeze", () => {
    const fixturePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-fixtures.json",
    );
    const freezePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-pre-run-freeze.json",
    );
    const fixtureText = readFileSync(fixturePath, "utf8");
    const fixtures = JSON.parse(fixtureText);
    const freeze = JSON.parse(readFileSync(freezePath, "utf8"));

    expect(
      fixtures.map((fixture: { fixture_id: string }) => fixture.fixture_id),
    ).toEqual(expectedFixtureIds);
    expect(
      fixtures.every(
        (fixture: {
          source_type: string;
          contains_real_secret: boolean;
          real_github_called: boolean;
          partial_data_returned: boolean;
        }) =>
          fixture.source_type === "synthetic" &&
          fixture.contains_real_secret === false &&
          fixture.real_github_called === false &&
          fixture.partial_data_returned === false,
      ),
    ).toBe(true);
    expect(freeze.fixture_ids).toEqual(expectedFixtureIds);
    expect(freeze.fixture_fingerprint).toBe(expectedFingerprint);
    expect(canonicalFingerprint(fixtureText)).toBe(expectedFingerprint);
    expect(freeze).toMatchObject({
      phase: "phase_4",
      base_commit: "d5ef16bbcecb5d267d051bbcf5e04c4060d07566",
      phase_3_final_commit:
        "c6293bc58c44ebacfe56430b150f057bab88dd69",
      rest_api_version: "2026-03-10",
      allowed_endpoints: [
        "POST /app/installations/{installation_id}/access_tokens",
        "GET /installation/repositories",
        "DELETE /installation/token",
      ],
      timeouts_ms: {
        token: 5000,
        page: 5000,
        revoke: 5000,
        operation: 30000,
      },
      test_mode: "fixture",
      real_github_called: false,
      real_private_key_used: false,
      real_app_jwt_used: false,
      real_installation_token_used: false,
      repository_list_persisted: false,
      selected_repositories: "none",
      projects: "none",
    });
  });

  it("keeps the canonical fingerprint stable across LF, CRLF, and CR", () => {
    const fixtureText = readFileSync(
      path.resolve(
        "tests/fixtures/github-repository/phase-4-fixtures.json",
      ),
      "utf8",
    );
    const lf = fixtureText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    expect(canonicalFingerprint(lf)).toBe(expectedFingerprint);
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r\n"))).toBe(
      expectedFingerprint,
    );
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r"))).toBe(
      expectedFingerprint,
    );
  });

  it("changes the fingerprint for non-EOL content mutations", () => {
    const fixtureText = readFileSync(
      path.resolve(
        "tests/fixtures/github-repository/phase-4-fixtures.json",
      ),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    for (const mutation of [
      fixtureText.replace(
        "active_zero_repositories",
        "inactive_zero_repositories",
      ),
      `${fixtureText} `,
      `${fixtureText}\n`,
      fixtureText.replace('"source_type":"synthetic"', '"source_type":"real"'),
    ]) {
      expect(mutation).not.toBe(fixtureText);
      expect(canonicalFingerprint(mutation)).not.toBe(expectedFingerprint);
    }
  });

  it("binds the supplemental repair fixtures and freeze without rewriting Phase 4 artifacts", () => {
    const baseFixturePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-fixtures.json",
    );
    const baseFreezePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-pre-run-freeze.json",
    );
    const repairFixturePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-2-repair-fixtures.json",
    );
    const repairFreezePath = path.resolve(
      "tests/fixtures/github-repository/phase-4-2-repair-freeze.json",
    );
    const repairFixtureText = readFileSync(repairFixturePath, "utf8");
    const repairFixtures = JSON.parse(repairFixtureText);
    const repairFreeze = JSON.parse(
      readFileSync(repairFreezePath, "utf8"),
    );

    expect(gitBlob(baseFixturePath)).toBe(
      "85e5b11820bdbc9c52dbd5e9afbef908757480d1",
    );
    expect(gitBlob(baseFreezePath)).toBe(
      "d3770010d847c094adcff938684d649e0a7ee3c0",
    );
    expect(repairFixtures).toHaveLength(4);
    expect(
      repairFixtures.map(
        (fixture: { fixture_id: string }) => fixture.fixture_id,
      ),
    ).toEqual(expectedRepairFixtureIds);
    expect(new Set(expectedRepairFixtureIds)).toHaveProperty("size", 4);
    expect(
      repairFixtures.map(
        (fixture: {
          fixture_id: string;
          expected_failure_code: string;
          expected_http_status: number;
          token_created: boolean;
          revocation_attempted: boolean;
          token_revoked: boolean;
          repository_pages: number;
          repository_count: number;
        }) => ({
          fixture_id: fixture.fixture_id,
          expected_failure_code: fixture.expected_failure_code,
          expected_http_status: fixture.expected_http_status,
          token_created: fixture.token_created,
          revocation_attempted: fixture.revocation_attempted,
          token_revoked: fixture.token_revoked,
          repository_pages: fixture.repository_pages,
          repository_count: fixture.repository_count,
        }),
      ),
    ).toEqual([
      {
        fixture_id: "app_configuration_missing",
        expected_failure_code: "github_app_configuration_missing",
        expected_http_status: 503,
        token_created: false,
        revocation_attempted: false,
        token_revoked: false,
        repository_pages: 0,
        repository_count: 0,
      },
      {
        fixture_id: "app_authentication_failed",
        expected_failure_code: "github_app_authentication_failed",
        expected_http_status: 502,
        token_created: false,
        revocation_attempted: false,
        token_revoked: false,
        repository_pages: 0,
        repository_count: 0,
      },
      {
        fixture_id: "token_unavailable",
        expected_failure_code: "github_installation_token_unavailable",
        expected_http_status: 502,
        token_created: false,
        revocation_attempted: false,
        token_revoked: false,
        repository_pages: 0,
        repository_count: 0,
      },
      {
        fixture_id: "repository_list_failed",
        expected_failure_code: "github_repository_list_failed",
        expected_http_status: 502,
        token_created: true,
        revocation_attempted: true,
        token_revoked: true,
        repository_pages: 1,
        repository_count: 0,
      },
    ]);
    expect(
      repairFixtures.every(
        (fixture: {
          fixture_version: string;
          source_type: string;
          repair_finding: string;
          partial_data_returned: boolean;
          real_github_called: boolean;
          contains_real_secret: boolean;
        }) =>
          fixture.fixture_version === "1.0.0" &&
          fixture.source_type === "synthetic" &&
          fixture.repair_finding === "F4.1-03" &&
          fixture.partial_data_returned === false &&
          fixture.real_github_called === false &&
          fixture.contains_real_secret === false,
      ),
    ).toBe(true);
    expect(canonicalFingerprint(repairFixtureText)).toBe(
      expectedRepairFingerprint,
    );
    const repairLf = repairFixtureText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    expect(canonicalFingerprint(repairLf.replace(/\n/g, "\r\n"))).toBe(
      expectedRepairFingerprint,
    );
    expect(canonicalFingerprint(repairLf.replace(/\n/g, "\r"))).toBe(
      expectedRepairFingerprint,
    );
    expect(gitBlob(repairFixturePath)).toBe(expectedRepairFixtureBlob);
    expect(gitBlob(repairFreezePath)).toBe(expectedRepairFreezeBlob);
    expect(repairFreeze).toMatchObject({
      freeze_id: "phase-4-2-strict-response-status-repair.v1",
      freeze_version: "1.0.0",
      phase: "phase_4_2",
      base_phase_4_commit:
        "09724056fa5d9fead3a616c0d588392172bfda66",
      base_phase_4_tree:
        "39fb8db480e159badfbcfc36c1e01ea165210d0a",
      token_expected_success_status: 201,
      repository_expected_success_status: 200,
      revoke_expected_success_status: 204,
      base_fixture_count: 34,
      repair_fixture_count: 4,
      repair_fixture_ids: expectedRepairFixtureIds,
      repair_fixture_blob: expectedRepairFixtureBlob,
      repair_fixture_fingerprint: expectedRepairFingerprint,
      repair_fixture_id_set_fingerprint:
        "sha256:92af634f78996da495486dd455d99c2c8a668e31d95dfb7d73df84700f17acbd",
      combined_failure_code_fingerprint:
        "sha256:609f592ba4cf99bb9cf9af90a8ac608033408bff300310d1bbf90cb1b5ec91a9",
      historical_phase_4_freeze_ordering: "evidence_unavailable",
      historical_phase_4_freeze_modified: false,
    });
    expect(
      canonicalFingerprint(
        JSON.stringify(sortedUnique([...expectedRepairFixtureIds])),
      ),
    ).toBe(repairFreeze.repair_fixture_id_set_fingerprint);
    expect(
      canonicalFingerprint(
        JSON.stringify(
          sortedUnique(repairFreeze.combined_expected_failure_codes),
        ),
      ),
    ).toBe(repairFreeze.combined_failure_code_fingerprint);
  });

  it("requires the combined fixtures to cover every implementation, contract, and HTTP failure code", () => {
    const baseFixtures = JSON.parse(
      readFileSync(
        path.resolve(
          "tests/fixtures/github-repository/phase-4-fixtures.json",
        ),
        "utf8",
      ),
    );
    const repairFixtures = JSON.parse(
      readFileSync(
        path.resolve(
          "tests/fixtures/github-repository/phase-4-2-repair-fixtures.json",
        ),
        "utf8",
      ),
    );
    const repairFreeze = JSON.parse(
      readFileSync(
        path.resolve(
          "tests/fixtures/github-repository/phase-4-2-repair-freeze.json",
        ),
        "utf8",
      ),
    );
    const baseFixtureFailureCodes = sortedUnique(
      baseFixtures
        .map(
          (fixture: { expected_failure_code: string | null }) =>
            fixture.expected_failure_code,
        )
        .filter((code: string | null): code is string => code !== null),
    );
    const repairFixtureFailureCodes = sortedUnique(
      repairFixtures.map(
        (fixture: { expected_failure_code: string }) =>
          fixture.expected_failure_code,
      ),
    );
    const combinedFixtureFailureCodes = sortedUnique([
      ...baseFixtureFailureCodes,
      ...repairFixtureFailureCodes,
    ]);
    const implementationFailureCodes = sortedUnique(
      Object.keys(githubRepositoryFailureDefinitions),
    );
    const contractFailureCodes = sortedUnique(
      repairFreeze.combined_expected_failure_codes,
    );
    const httpFailureCodes = sortedUnique(
      Object.values(githubRepositoryFailureDefinitions).map(
        (definition) => definition.publicCode,
      ),
    );

    expect(
      difference(implementationFailureCodes, combinedFixtureFailureCodes),
    ).toEqual([]);
    expect(
      difference(combinedFixtureFailureCodes, implementationFailureCodes),
    ).toEqual([]);
    expect(
      difference(contractFailureCodes, combinedFixtureFailureCodes),
    ).toEqual([]);
    expect(
      difference(combinedFixtureFailureCodes, contractFailureCodes),
    ).toEqual([]);
    expect(
      difference(httpFailureCodes, combinedFixtureFailureCodes),
    ).toEqual([]);
    expect(
      difference(combinedFixtureFailureCodes, httpFailureCodes),
    ).toEqual([]);
  });

  it("hard-rejects the repository fixture runner in production before side effects", () => {
    const runnerPath = path.resolve(
      "scripts/run-repository-fixture-e2e.mjs",
    );
    const result = spawnSync(
      process.execPath,
      ["--import", preloaderUrl, runnerPath],
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
      "repository_fixture_forbidden_in_production",
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "auth_fixture_side_effect_detected:",
    );
  });
});
