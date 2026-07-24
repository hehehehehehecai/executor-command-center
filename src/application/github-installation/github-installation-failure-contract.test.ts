// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createGitHubInstallationFailureRecord,
  handleGitHubInstallationSetup,
  handleGitHubInstallationStart,
} from "@/infrastructure/github/github-installation-http";

const basePhase3Commit =
  "87c83c9c5466f9bb8353b49fa157f857d58d243c";
const basePhase3Tree =
  "2dbf975e4d6e185e5704ba64a38caef210d35038";
const contractPath =
  "tests/fixtures/github-installation/phase-3-1-failure-contract.json";
const freezePath =
  "tests/fixtures/github-installation/phase-3-1-conformance-freeze.json";
const fixturePath =
  "tests/fixtures/github-installation/phase-3-fixtures.json";
const historicalFreezePath =
  "tests/fixtures/github-installation/phase-3-pre-run-freeze.json";
const targetTestPath =
  "src/application/github-installation/github-installation-failure-contract.test.ts";
const allowedPhase31Paths = new Set([
  contractPath,
  freezePath,
  targetTestPath,
]);

const categories = [
  "authentication",
  "state",
  "configuration",
  "github_app_authentication",
  "github_api",
  "identity",
  "ownership",
  "persistence",
] as const;
const stages = [
  "start",
  "setup",
  "state_create",
  "state_consume",
  "jwt_sign",
  "installation_read",
  "ownership_verify",
  "installation_store",
] as const;
const responseModes = [
  "redirect",
  "http_error",
  "application_error",
] as const;
const triState = ["yes", "no", "unknown"] as const;
const requiredMinimumCodes = [
  "unauthenticated",
  "installation_state_missing",
  "installation_state_invalid",
  "installation_state_expired",
  "installation_state_replayed",
  "installation_state_wrong_user",
  "installation_state_persistence_failed",
  "installation_id_invalid",
  "github_app_configuration_missing",
  "github_app_authentication_failed",
  "github_installation_not_found",
  "github_api_forbidden",
  "github_api_rate_limited",
  "github_api_timeout",
  "github_api_invalid_response",
  "github_api_unavailable",
  "installation_app_mismatch",
  "installation_id_mismatch",
  "unsupported_installation_account_type",
  "current_github_identity_missing",
  "installation_account_mismatch",
  "github_installation_already_bound",
  "installation_persistence_failed",
] as const;
const requiredSensitiveFields = [
  "raw_state",
  "state_hash",
  "private_key",
  "app_jwt",
  "authorization_header",
  "session_cookie",
  "service_role_key",
  "github_raw_response",
  "github_error_body",
] as const;
const expectedLogFields = [
  "account_type",
  "contract_version",
  "failure_code",
  "failure_id",
  "github_api_called",
  "installation_id_present",
  "installation_persisted",
  "ownership_match",
  "phase",
  "request_id",
  "safe_message",
  "sensitive_fields_redacted",
  "session_valid",
  "stage",
  "state_valid",
] as const;
const productionFailureSourcePaths = [
  "src/application/github-installation/installation-state.ts",
  "src/application/github-installation/start-github-installation.ts",
  "src/application/github-installation/register-github-installation.ts",
  "src/infrastructure/github/github-app-jwt.ts",
  "src/infrastructure/github/github-app-installation-reader.ts",
  "src/infrastructure/github/supabase-github-installation-repository.ts",
  "src/infrastructure/github/github-installation-http.ts",
  "src/app/api/github/installations/start/route.ts",
  "src/app/api/github/installations/setup/route.ts",
] as const;

const httpSemanticSchema = z.object({
  route: z.enum([
    "start",
    "setup",
    "start_outer",
    "setup_outer",
    "infrastructure_only",
  ]),
  execution_path: z.enum([
    "handler",
    "direct_route",
    "outer_catch",
    "infrastructure_only",
  ]),
  response_mode: z.enum(responseModes),
  http_status: z.number().int().nullable(),
  redirect_target: z.string().nullable(),
  query_safe_code: z.string().nullable(),
  response_body: z.enum(["empty", "safe_static", "not_applicable"]),
});

const sourceBindingSchema = z.object({
  path: z.string().min(1),
  test_path: z.string().min(1),
  disposition: z.enum([
    "reachable",
    "infrastructure_only",
    "fallback",
  ]),
  reason: z.string().min(1),
});

const failureEntrySchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]+$/),
  category: z.enum(categories),
  stages: z.array(z.enum(stages)).min(1),
  source_error_class: z.string().min(1),
  response_mode: z.enum(responseModes),
  http_semantics: z.array(httpSemanticSchema).min(1),
  safe_public_code: z.string().regex(/^[a-z][a-z0-9_]+$/),
  safe_message_policy: z.literal("generic_only"),
  installation_persisted: z.enum(triState),
  state_consumed: z.enum(triState),
  github_api_called: z.enum(triState),
  retryable: z.boolean(),
  sensitive_fields_forbidden: z
    .array(z.enum(requiredSensitiveFields))
    .length(requiredSensitiveFields.length),
  fixture_ids: z.array(z.string()),
  source_bindings: z.array(sourceBindingSchema).min(1),
});

const fixtureResultSchema = z.object({
  fixture_id: z.string().min(1),
  fixture_declared_result: z.string().min(1),
  contract_result: z.string().min(1),
  success_state: z.string().nullable(),
  historical_mismatch: z.boolean(),
  mismatch_reason: z.string().nullable(),
});

const contractSchema = z.object({
  contract_id: z.literal("github-installation-failure-contract.v1"),
  contract_version: z.literal("1.0.0"),
  phase: z.literal("phase_3_1"),
  dataset_kind: z.literal("engineering_regression_fixture"),
  exposure_status: z.literal("known_regression"),
  canonicalization: z.object({
    algorithm_version: z.literal("canonical-text-sha256.v1"),
    encoding: z.literal("UTF-8"),
    line_endings: z.literal("CRLF/CR to LF"),
    trim: z.literal(false),
    json_key_sorting: z.literal(false),
  }),
  required_minimum_codes: z.array(z.string()),
  failure_codes: z.array(failureEntrySchema).min(1),
  fixture_results: z.array(fixtureResultSchema).min(1),
  logging: z.object({
    allowed_fields: z.array(z.string()),
    sensitive_fields_forbidden: z.array(
      z.enum(requiredSensitiveFields),
    ),
    raw_error_body_allowed: z.literal(false),
  }),
  internal_non_contract_sentinels: z.array(
    z.object({
      value: z.string().min(1),
      path: z.string().min(1),
      transformed_to: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

const freezeSchema = z.object({
  freeze_id: z.literal("phase-3-1-installation-failure-conformance.v1"),
  freeze_version: z.literal("1.0.0"),
  phase: z.literal("phase_3_1"),
  base_phase_3_commit: z.literal(basePhase3Commit),
  base_phase_3_tree: z.literal(basePhase3Tree),
  historical_freeze_artifact: z.literal(historicalFreezePath),
  historical_freeze_blob: z.string().regex(/^[0-9a-f]{40}$/),
  historical_freeze_status: z.literal("incomplete"),
  historical_formal_run_status: z.literal("ineligible"),
  historical_exposure_status: z.literal("results_viewed"),
  historical_run_kind: z.literal("development_regression"),
  remediation_reason: z.literal("P3-FREEZE-01"),
  failure_contract_id: z.literal(
    "github-installation-failure-contract.v1",
  ),
  failure_contract_path: z.literal(contractPath),
  failure_contract_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  failure_code_exact_set_fingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/),
  expected_failure_codes: z.array(z.string()).min(1),
  failure_code_entries: z.array(
    z.object({
      code: z.string(),
      category: z.enum(categories),
      stages: z.array(z.enum(stages)).min(1),
      safe_public_code: z.string(),
    }),
  ),
  fixture_path: z.literal(fixturePath),
  fixture_blob: z.string().regex(/^[0-9a-f]{40}$/),
  fixture_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_ids: z.array(z.string()).min(1),
  fixture_expected_results: z.array(fixtureResultSchema).min(1),
  fixture_result_mapping_fingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/),
  target_test_paths: z.array(z.string()).length(1),
  target_test_fingerprints: z.record(
    z.string(),
    z.string().regex(/^sha256:[0-9a-f]{64}$/),
  ),
  formal_run_command: z.string().min(1),
  formal_run_id: z.literal(
    "phase-3-1-formal-conformance-20260724-001",
  ),
  test_frozen: z.literal(true),
  recorded_at: z.iso.datetime({ offset: true }),
  exposure_status: z.literal("known_regression"),
  holdout_eligibility: z.literal("not_applicable"),
  eval_dataset_status: z.literal("not_applicable"),
  production_code_mutation_allowed: z.literal(false),
  contains_real_secret: z.literal(false),
  real_github_called: z.literal(false),
  real_installation_used: z.literal(false),
});

type Contract = z.infer<typeof contractSchema>;

function canonicalText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Text(text: string) {
  return `sha256:${createHash("sha256")
    .update(canonicalText(text), "utf8")
    .digest("hex")}`;
}

function readUtf8(relativePath: string) {
  return readFileSync(path.resolve(relativePath), "utf8");
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readUtf8(relativePath));
}

function git(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function contractAndFreeze() {
  const contract = contractSchema.parse(readJson(contractPath));
  const freeze = freezeSchema.parse(readJson(freezePath));
  return { contract, freeze };
}

function failureCodeSet(contract: Contract) {
  return new Set(contract.failure_codes.map((entry) => entry.code));
}

function exactSetFingerprint(codes: string[]) {
  return sha256Text(codes.join("\n"));
}

function fixtureMappingFingerprint(
  mappings: Contract["fixture_results"],
) {
  return sha256Text(JSON.stringify(mappings));
}

function extractImplementationFailureCodes(contract: Contract) {
  const sentinelValues = new Set(
    contract.internal_non_contract_sentinels.map((entry) => entry.value),
  );
  const candidates = new Set<string>();
  const failureLiteral =
    /"((?:unauthenticated|[a-z]+(?:_[a-z0-9]+)+))"/g;
  const failureShape =
    /(?:failed|missing|invalid|expired|replayed|wrong_user|mismatch|not_found|forbidden|rate_limited|timeout|invalid_response|unavailable|already_bound|unsupported_installation_account_type)$/;

  for (const sourcePath of productionFailureSourcePaths) {
    const source = readUtf8(sourcePath);
    for (const match of source.matchAll(failureLiteral)) {
      const value = match[1]!;
      if (failureShape.test(value) || value === "unauthenticated") {
        candidates.add(value);
      }
    }
  }

  for (const sentinel of sentinelValues) {
    candidates.delete(sentinel);
  }

  return [...candidates].sort();
}

function locationPath(response: Response) {
  const location = response.headers.get("location");
  if (!location) return null;
  const parsed = new URL(location, "https://executor.example.test");
  return `${parsed.pathname}${parsed.search}`;
}

describe("github-installation-failure-contract.v1", () => {
  it("validates the complete Failure Contract and Conformance Freeze schemas", () => {
    expect(() => contractAndFreeze()).not.toThrow();
  });

  it("freezes an exact duplicate-free Failure Code set", () => {
    const { contract, freeze } = contractAndFreeze();
    const codes = contract.failure_codes.map((entry) => entry.code);

    expect(new Set(codes).size).toBe(codes.length);
    expect(freeze.expected_failure_codes).toEqual(codes);
    expect(
      freeze.failure_code_entries.map((entry) => entry.code),
    ).toEqual(codes);
  });

  it("contains the complete required minimum Failure Code set", () => {
    const { contract } = contractAndFreeze();
    const codes = failureCodeSet(contract);

    expect(requiredMinimumCodes.filter((code) => !codes.has(code))).toEqual(
      [],
    );
    expect(contract.required_minimum_codes).toEqual(requiredMinimumCodes);
  });

  it("binds every implementation Failure Code to the Contract", () => {
    const { contract } = contractAndFreeze();
    const contractCodes = [...failureCodeSet(contract)].sort();

    expect(extractImplementationFailureCodes(contract)).toEqual(
      contractCodes,
    );
  });

  it("binds every Contract code to a reachable, fallback, or explained infrastructure source", () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      expect(entry.source_bindings.length).toBeGreaterThan(0);
      for (const binding of entry.source_bindings) {
        expect(readUtf8(binding.path)).toContain(`"${entry.code}"`);
        expect(readUtf8(binding.test_path).length).toBeGreaterThan(0);
        expect(binding.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("binds each failed Fixture to exactly one Contract Failure Code", () => {
    const { contract } = contractAndFreeze();
    const failedMappings = contract.fixture_results.filter(
      (mapping) => mapping.contract_result !== "success",
    );

    for (const mapping of failedMappings) {
      expect(
        contract.failure_codes.filter((entry) =>
          entry.fixture_ids.includes(mapping.fixture_id),
        ),
      ).toHaveLength(1);
      expect(failureCodeSet(contract).has(mapping.contract_result)).toBe(
        true,
      );
    }
  });

  it("binds every successful Fixture to an explicit success state", () => {
    const { contract } = contractAndFreeze();
    const successMappings = contract.fixture_results.filter(
      (mapping) => mapping.contract_result === "success",
    );

    expect(successMappings).toHaveLength(4);
    for (const mapping of successMappings) {
      expect(mapping.success_state).not.toBeNull();
      expect(
        contract.failure_codes.some((entry) =>
          entry.fixture_ids.includes(mapping.fixture_id),
        ),
      ).toBe(false);
    }
  });

  it("assigns one valid category to every Failure Code", () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      expect(categories).toContain(entry.category);
    }
  });

  it("assigns at least one valid trigger stage to every Failure Code", () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      expect(entry.stages.length).toBeGreaterThan(0);
      for (const stage of entry.stages) {
        expect(stages).toContain(stage);
      }
    }
  });

  it("freezes safe HTTP, redirect, and application response semantics", () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      expect(responseModes).toContain(entry.response_mode);
      expect(entry.http_semantics.length).toBeGreaterThan(0);
      for (const semantic of entry.http_semantics) {
        if (semantic.response_mode === "redirect") {
          expect(semantic.http_status).toBe(303);
          expect(semantic.redirect_target).not.toBeNull();
          expect(semantic.response_body).toBe("empty");
        }
        if (semantic.response_mode === "http_error") {
          expect(semantic.http_status).toBe(503);
          expect(semantic.redirect_target).toBeNull();
          expect(semantic.response_body).toBe("safe_static");
        }
      }
    }
  });

  it("forbids the complete sensitive-field set for every Failure Code", () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      expect(entry.sensitive_fields_forbidden).toEqual(
        requiredSensitiveFields,
      );
    }
    expect(contract.logging.sensitive_fields_forbidden).toEqual(
      requiredSensitiveFields,
    );
  });

  it("keeps all State failure semantics distinct", () => {
    const { contract } = contractAndFreeze();
    const stateCodes = contract.failure_codes
      .filter((entry) => entry.category === "state")
      .map((entry) => entry.code);

    expect(stateCodes).toEqual([
      "installation_state_generation_failed",
      "installation_state_persistence_failed",
      "installation_state_missing",
      "installation_state_invalid",
      "installation_state_expired",
      "installation_state_replayed",
      "installation_state_wrong_user",
    ]);
  });

  it("keeps all GitHub API failure semantics distinct", () => {
    const { contract } = contractAndFreeze();
    const apiCodes = contract.failure_codes
      .filter((entry) => entry.category === "github_api")
      .map((entry) => entry.code);

    expect(apiCodes).toEqual([
      "github_installation_not_found",
      "github_api_forbidden",
      "github_api_rate_limited",
      "github_api_timeout",
      "github_api_invalid_response",
      "github_api_unavailable",
    ]);
  });

  it("keeps ownership and identity failure semantics distinct", () => {
    const { contract } = contractAndFreeze();
    const ownershipCodes = contract.failure_codes
      .filter((entry) =>
        ["identity", "ownership"].includes(entry.category),
      )
      .map((entry) => entry.code);

    expect(ownershipCodes).toEqual([
      "installation_app_mismatch",
      "installation_id_mismatch",
      "unsupported_installation_account_type",
      "current_github_identity_missing",
      "current_github_identity_read_failed",
      "installation_account_mismatch",
      "github_installation_already_bound",
    ]);
  });

  it("keeps State and Installation persistence failures distinct", () => {
    const { contract } = contractAndFreeze();
    const persistenceCodes = contract.failure_codes
      .filter((entry) => entry.category === "persistence")
      .map((entry) => entry.code);

    expect(persistenceCodes).toEqual([
      "installation_persistence_failed",
      "github_installation_registration_failed",
    ]);
    expect(failureCodeSet(contract).has(
      "installation_state_persistence_failed",
    )).toBe(true);
  });

  it("matches real handler redirects for every handler-bound Failure Code", async () => {
    const { contract } = contractAndFreeze();

    for (const entry of contract.failure_codes) {
      for (const semantic of entry.http_semantics.filter(
        (item) => item.execution_path === "handler",
      )) {
        const execute = async () => {
          throw new Error(entry.code);
        };
        const response =
          semantic.route === "start"
            ? await handleGitHubInstallationStart({
                request: new Request(
                  "https://executor.example.test/api/github/installations/start",
                ),
                trustedOrigin: "https://executor.example.test",
                execute,
              })
            : await handleGitHubInstallationSetup({
                request: new Request(
                  "https://executor.example.test/api/github/installations/setup",
                ),
                trustedOrigin: "https://executor.example.test",
                execute,
              });

        expect(response.status).toBe(semantic.http_status);
        expect(locationPath(response)).toBe(semantic.redirect_target);
        expect(await response.text()).toBe("");
      }
    }
  });

  it("records only the frozen safe log fields and no sensitive values", () => {
    const { contract } = contractAndFreeze();
    const record = createGitHubInstallationFailureRecord({
      failureId: "failure-contract-test-id",
      stage: "installation_setup",
      requestId: "request-contract-test-id",
      failureCode: "installation_account_mismatch",
      installationIdPresent: true,
      stateValid: true,
      sessionValid: true,
      githubApiCalled: true,
      accountType: "User",
      ownershipMatch: false,
      installationPersisted: false,
    });
    const keys = Object.keys(record).sort();
    const serialized = JSON.stringify(record).toLowerCase();

    expect(keys).toEqual(expectedLogFields);
    expect(contract.logging.allowed_fields.slice().sort()).toEqual(
      expectedLogFields,
    );
    for (const field of requiredSensitiveFields) {
      expect(serialized).not.toContain(field);
    }
  });

  it("matches all frozen Contract, Fixture, mapping, exact-set, and target-test fingerprints", () => {
    const { contract, freeze } = contractAndFreeze();
    const contractText = readUtf8(contractPath);
    const fixtureText = readUtf8(fixturePath);
    const testText = readUtf8(targetTestPath);
    const codes = contract.failure_codes.map((entry) => entry.code);

    expect(sha256Text(contractText)).toBe(
      freeze.failure_contract_fingerprint,
    );
    expect(exactSetFingerprint(codes)).toBe(
      freeze.failure_code_exact_set_fingerprint,
    );
    expect(sha256Text(fixtureText)).toBe(freeze.fixture_fingerprint);
    expect(fixtureMappingFingerprint(contract.fixture_results)).toBe(
      freeze.fixture_result_mapping_fingerprint,
    );
    expect(freeze.target_test_fingerprints[targetTestPath]).toBe(
      sha256Text(testText),
    );
    expect(freeze.fixture_expected_results).toEqual(
      contract.fixture_results,
    );
  });

  it("preserves the historical Freeze blob and records its incomplete exposed status", () => {
    const { freeze } = contractAndFreeze();
    const historicalFreeze = readJson(historicalFreezePath) as {
      recorded_at: string;
      expected_failure_codes: string[];
    };

    expect(git(["hash-object", historicalFreezePath])).toBe(
      freeze.historical_freeze_blob,
    );
    expect(freeze.historical_freeze_status).toBe("incomplete");
    expect(freeze.historical_formal_run_status).toBe("ineligible");
    expect(freeze.historical_exposure_status).toBe("results_viewed");
    expect(freeze.historical_run_kind).toBe("development_regression");
    expect(historicalFreeze.recorded_at).toBe(
      "2026-07-23T15:47:39.4723577+08:00",
    );
    expect(historicalFreeze.expected_failure_codes).toContain(
      "invalid_installation_state",
    );
  });

  it("keeps the Phase 3 production tree unchanged and limits changes to three Phase 3.1 files", () => {
    expect(git(["show", "-s", "--format=%T", basePhase3Commit])).toBe(
      basePhase3Tree,
    );

    const trackedDiff = git([
      "diff",
      "--name-only",
      basePhase3Commit,
      "--",
    ]);
    const trackedPaths = trackedDiff
      ? trackedDiff.split(/\r?\n/).map((changedPath) =>
          changedPath.replace(/\\/g, "/"),
        )
      : [];
    const status = git([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    const untrackedPaths = status
      ? status
          .split(/\r?\n/)
          .filter((line) => line.startsWith("?? "))
          .map((line) => line.slice(3).replace(/\\/g, "/"))
      : [];

    expect(
      [...new Set([...trackedPaths, ...untrackedPaths])].filter(
        (changedPath) => !allowedPhase31Paths.has(changedPath),
      ),
    ).toEqual([]);
  });
});
