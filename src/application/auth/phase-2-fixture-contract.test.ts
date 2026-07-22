// @vitest-environment node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("phase_2 synthetic fixture provenance", () => {
  it("binds every required fixture to the frozen pre-run fingerprint", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-fixtures.json",
    );
    const freezePath = path.resolve(
      process.cwd(),
      "tests/fixtures/auth/phase-2-pre-run-freeze.json",
    );
    const fixtureBytes = readFileSync(fixturePath);
    const fixtures = JSON.parse(fixtureBytes.toString("utf8"));
    const freeze = JSON.parse(readFileSync(freezePath, "utf8"));
    const fingerprint = createHash("sha256").update(fixtureBytes).digest("hex");

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
    expect(freeze.fixture_fingerprint).toBe(`sha256:${fingerprint}`);
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
