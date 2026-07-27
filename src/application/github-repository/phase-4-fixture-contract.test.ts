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
let preloaderDirectory = "";
let preloaderUrl = "";

function canonicalFingerprint(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
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
