// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureSideEffectPreloaderSource } from "./testing/fixture-side-effect-preloader-source";

const PRELOADER_TIMEOUT_MS = 3_000;
const SIDE_EFFECT_EXIT_STATUS = 86;
const SIDE_EFFECT_ERROR_PREFIX = "auth_fixture_side_effect_detected:";
const FIXTURE_FINGERPRINT_CONTRACT = Object.freeze({
  contractId: "auth-fixture-fingerprint.v2",
  fixtureDataset: "phase-2-fixtures",
  algorithm: "sha256-utf8-eol-normalized.v1",
  encoding: "UTF-8",
  normalization: "CRLF/CR -> LF only",
  expectedFingerprint:
    "sha256:3b05deb38b711541706523fdfbab14d823973d0d544c4c682f3f96a996cf4b16",
});

function computeCanonicalFixtureFingerprint(text: string): string {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return `sha256:${createHash("sha256").update(normalizedText, "utf8").digest("hex")}`;
}

let preloaderDirectory = "";
let preloaderUrl = "";
let preloaderSourceFingerprint = "";

beforeAll(() => {
  const preloaderSource = createFixtureSideEffectPreloaderSource();
  preloaderSourceFingerprint = createHash("sha256")
    .update(preloaderSource)
    .digest("hex");
  preloaderDirectory = mkdtempSync(
    path.join(os.tmpdir(), "executor-auth-fixture-guard-"),
  );
  const preloaderPath = path.join(
    preloaderDirectory,
    "fixture-side-effect-preloader.mjs",
  );
  writeFileSync(preloaderPath, preloaderSource, "utf8");
  preloaderUrl = pathToFileURL(preloaderPath).href;
});

afterAll(() => {
  if (preloaderDirectory) {
    rmSync(preloaderDirectory, { force: true, recursive: true });
  }
});

describe("phase_2 synthetic fixture provenance", () => {
  it("proves the preloader blocks a harmless file write before it happens", () => {
    const sentinelPath = path.join(preloaderDirectory, "must-not-exist.txt");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        preloaderUrl,
        "--input-type=module",
        "--eval",
        'import { writeFileSync } from "node:fs"; writeFileSync(process.env.AUTH_FIXTURE_PROBE_PATH, "blocked");',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_FIXTURE_PROBE_PATH: sentinelPath,
        },
        timeout: PRELOADER_TIMEOUT_MS,
        windowsHide: true,
      },
    );

    expect(preloaderSourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(SIDE_EFFECT_EXIT_STATUS);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      `${SIDE_EFFECT_ERROR_PREFIX}file-write`,
    );
    expect(existsSync(sentinelPath)).toBe(false);
  });

  it.each(Array.from({ length: 10 }, (_, index) => index + 1))(
    "hard-rejects the real fixture runner before side effects in production (iteration %i)",
    (iteration) => {
      const runnerPath = path.resolve(
        process.cwd(),
        "scripts/run-auth-fixture-e2e.mjs",
      );
      const startedAt = performance.now();
      const result = spawnSync(
        process.execPath,
        ["--import", preloaderUrl, runnerPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, NODE_ENV: "production" },
          timeout: PRELOADER_TIMEOUT_MS,
          windowsHide: true,
        },
      );
      const elapsedMs = performance.now() - startedAt;
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const guardCodeCount = combinedOutput.match(
        /auth_fixture_forbidden_in_production/g,
      )?.length ?? 0;
      const sideEffectCodeCount = combinedOutput.match(
        /auth_fixture_side_effect_detected:/g,
      )?.length ?? 0;

      console.info(
        JSON.stringify({
          contract_id: "auth-fixture-production-guard-test.v1",
          iteration,
          node_env: "production",
          preloader_loaded: true,
          elapsed_ms: Math.round(elapsedMs * 1_000) / 1_000,
          status: result.status,
          signal: result.signal,
          timed_out:
            result.error !== undefined &&
            "code" in result.error &&
            result.error.code === "ETIMEDOUT",
          guard_code_count: guardCodeCount,
          side_effect_code_count: sideEffectCodeCount,
        }),
      );

      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe(
        "auth_fixture_forbidden_in_production",
      );
      expect(guardCodeCount).toBe(1);
      expect(sideEffectCodeCount).toBe(0);
    },
  );

  it("keeps the frozen fingerprint stable across LF, CRLF, CR, and worktree representations", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-fixtures.json",
    );
    const worktreeRepresentation = readFileSync(fixturePath, "utf8");
    const lfRepresentation = worktreeRepresentation
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const crlfRepresentation = lfRepresentation.replace(/\n/g, "\r\n");
    const crRepresentation = lfRepresentation.replace(/\n/g, "\r");

    expect(FIXTURE_FINGERPRINT_CONTRACT).toMatchObject({
      contractId: "auth-fixture-fingerprint.v2",
      algorithm: "sha256-utf8-eol-normalized.v1",
      encoding: "UTF-8",
      normalization: "CRLF/CR -> LF only",
    });
    expect(computeCanonicalFixtureFingerprint(lfRepresentation)).toBe(
      FIXTURE_FINGERPRINT_CONTRACT.expectedFingerprint,
    );
    expect(computeCanonicalFixtureFingerprint(crlfRepresentation)).toBe(
      FIXTURE_FINGERPRINT_CONTRACT.expectedFingerprint,
    );
    expect(computeCanonicalFixtureFingerprint(crRepresentation)).toBe(
      FIXTURE_FINGERPRINT_CONTRACT.expectedFingerprint,
    );
    expect(computeCanonicalFixtureFingerprint(worktreeRepresentation)).toBe(
      FIXTURE_FINGERPRINT_CONTRACT.expectedFingerprint,
    );
  });

  it("changes the fingerprint for every non-EOL content mutation", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-fixtures.json",
    );
    const lfRepresentation = readFileSync(fixturePath, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const canonicalFingerprint = computeCanonicalFixtureFingerprint(
      lfRepresentation,
    );
    const ordinaryCharacterChanged = lfRepresentation.replace(
      "valid_github_auth_user",
      "walid_github_auth_user",
    );
    const spaceAdded = `${lfRepresentation} `;
    const spaceDeleted = lfRepresentation.replace("  ", " ");
    const newlineAdded = `${lfRepresentation}\n`;
    const newlineDeleted = lfRepresentation.replace("\n", "");
    const keyOrderChanged = lfRepresentation.replace(
      '"fixture_id":"valid_github_auth_user","fixture_version":"1.0.0"',
      '"fixture_version":"1.0.0","fixture_id":"valid_github_auth_user"',
    );

    expect(ordinaryCharacterChanged).not.toBe(lfRepresentation);
    expect(spaceDeleted).not.toBe(lfRepresentation);
    expect(keyOrderChanged).not.toBe(lfRepresentation);
    for (const representation of [
      ordinaryCharacterChanged,
      spaceAdded,
      spaceDeleted,
      newlineAdded,
      newlineDeleted,
      keyOrderChanged,
    ]) {
      expect(computeCanonicalFixtureFingerprint(representation)).not.toBe(
        canonicalFingerprint,
      );
    }
  });

  it("binds every required fixture to the frozen pre-run fingerprint", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-fixtures.json",
    );
    const freezePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-pre-run-freeze.json",
    );
    const fixtureText = readFileSync(fixturePath, "utf8");
    const fixtures = JSON.parse(fixtureText);
    const freeze = JSON.parse(readFileSync(freezePath, "utf8"));
    const fingerprint = computeCanonicalFixtureFingerprint(fixtureText);

    expect(fixtures.map((fixture: { fixture_id: string }) => fixture.fixture_id))
      .toEqual([
        "valid_github_auth_user",
        "valid_repeat_login_same_github_user",
        "github_login_changed",
        "avatar_missing",
        "non_github_provider",
        "missing_provider_identity",
        "missing_github_user_id",
        "non_numeric_github_user_id",
        "unsafe_integer_github_user_id",
        "missing_github_login",
        "multiple_provider_identities",
        "callback_missing_code",
        "callback_exchange_failure",
        "callback_session_failure",
        "identity_conflict",
        "unsafe_return_to",
      ]);
    expect(fixtures.every((fixture: { source_type: string }) =>
      fixture.source_type === "synthetic")).toBe(true);
    expect(fixtures.every((fixture: { contains_real_secret: boolean }) =>
      fixture.contains_real_secret === false)).toBe(true);
    expect(freeze.fixture_fingerprint).toBe(fingerprint);
    expect(freeze).toMatchObject({
      base_commit: "fde4d29309dc63be7ad0f9bedacfc0e9ca017ff5",
      branch: "feat/phase-2-github-sign-in",
      oauth_contract_version: "github-sign-in.v1",
      identity_contract_version: "internal-user-identity.v1",
      session_contract_version: "supabase-session.v1",
      auth_log_redaction_version: "auth-log-redaction.v1",
      oauth_start_path: "/api/auth/github",
      callback_path: "/auth/callback",
      provider_name: "github",
      provider_identity_id_field: "identities[].provider_id",
      provider_login_field: "identities[].identity_data.user_name",
      provider_avatar_field: "identities[].identity_data.avatar_url",
      auth_user_validation_method: "supabase.auth.getUser",
      cookie_adapter: "supabase-ssr-cookie-adapter.v1",
      test_mode: "fixture",
      real_github_called: false,
      real_secret_used: false,
      expected_installation_state: "not_registered",
    });
  });
});
