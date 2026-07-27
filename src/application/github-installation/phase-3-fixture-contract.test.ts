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
  "valid_active_personal_installation",
  "valid_suspended_personal_installation",
  "repeat_same_installation",
  "reinstall_same_user_new_installation_id",
  "installation_id_not_found",
  "installation_app_mismatch",
  "installation_account_mismatch",
  "organization_installation",
  "invalid_installation_id",
  "rate_limited",
  "invalid_github_response",
  "expired_state",
  "replayed_state",
  "state_for_other_user",
  "missing_state",
  "unauthenticated_start",
  "unauthenticated_setup",
  "cross_user_installation_binding",
] as const;
const expectedFingerprint =
  "sha256:be3605720022e210b5842b8473d17e7cb25b318ac8e9177bd8c97fb38dbebaec";
let preloaderDirectory = "";
let preloaderUrl = "";

function canonicalFingerprint(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `sha256:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

beforeAll(() => {
  preloaderDirectory = mkdtempSync(
    path.join(os.tmpdir(), "executor-installation-fixture-guard-"),
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

describe("phase_3 synthetic installation fixture provenance", () => {
  it("binds every required synthetic case to the pre-run freeze", () => {
    const fixturePath = path.resolve(
      "tests/fixtures/github-installation/phase-3-fixtures.json",
    );
    const freezePath = path.resolve(
      "tests/fixtures/github-installation/phase-3-pre-run-freeze.json",
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
        }) =>
          fixture.source_type === "synthetic" &&
          fixture.contains_real_secret === false,
      ),
    ).toBe(true);
    expect(freeze.fixture_ids).toEqual(expectedFixtureIds);
    expect(freeze.fixture_fingerprint).toBe(expectedFingerprint);
    expect(canonicalFingerprint(fixtureText)).toBe(expectedFingerprint);
    expect(freeze).toMatchObject({
      phase: "phase_3",
      installation_contract_version:
        "github-installation-registration.v1",
      state_contract_version: "github-installation-state.v1",
      app_auth_contract_version: "github-app-authentication.v1",
      storage_contract_version: "github-installation-storage.v1",
      rest_api_version: "2026-03-10",
      supported_account_type: ["User"],
      test_mode: "fixture",
      real_github_called: false,
      real_private_key_used: false,
      real_installation_used: false,
      repository_access: "not_loaded",
      selected_repositories: "none",
      projects: "none",
    });
  });

  it("keeps the canonical fingerprint stable across LF, CRLF, CR, and worktree representations", () => {
    const worktreeText = readFileSync(
      path.resolve(
        "tests/fixtures/github-installation/phase-3-fixtures.json",
      ),
      "utf8",
    );
    const lf = worktreeText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    expect(canonicalFingerprint(lf)).toBe(expectedFingerprint);
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r\n"))).toBe(
      expectedFingerprint,
    );
    expect(canonicalFingerprint(lf.replace(/\n/g, "\r"))).toBe(
      expectedFingerprint,
    );
    expect(canonicalFingerprint(worktreeText)).toBe(expectedFingerprint);
  });

  it("changes the fingerprint for every non-EOL content mutation", () => {
    const fixtureText = readFileSync(
      path.resolve(
        "tests/fixtures/github-installation/phase-3-fixtures.json",
      ),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const mutations = [
      fixtureText.replace(
        "valid_active_personal_installation",
        "invalid_active_personal_installation",
      ),
      `${fixtureText} `,
      fixtureText.replace("  ", " "),
      `${fixtureText}\n`,
      fixtureText.replace("\n", ""),
      fixtureText.replace(
        '"fixture_id":"valid_active_personal_installation","fixture_version":"1.0.0"',
        '"fixture_version":"1.0.0","fixture_id":"valid_active_personal_installation"',
      ),
    ];

    for (const mutation of mutations) {
      expect(mutation).not.toBe(fixtureText);
      expect(canonicalFingerprint(mutation)).not.toBe(expectedFingerprint);
    }
  });

  it("hard-rejects the installation fixture runner in production before side effects", () => {
    const runnerPath = path.resolve(
      "scripts/run-installation-fixture-e2e.mjs",
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
      "installation_fixture_forbidden_in_production",
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      "installation_fixture_side_effect_detected:",
    );
  });
});
