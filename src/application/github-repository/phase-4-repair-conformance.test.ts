// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const phase4Commit =
  "09724056fa5d9fead3a616c0d588392172bfda66";
const repairCommit =
  "825b9447c4c3c109180c1e6dc258f9c40e3f0841";
const repairTree =
  "e460d2ebf4271f54bbef6a045d9c73003af32e40";

const baseFixturePath =
  "tests/fixtures/github-repository/phase-4-fixtures.json";
const baseFreezePath =
  "tests/fixtures/github-repository/phase-4-pre-run-freeze.json";
const repairFixturePath =
  "tests/fixtures/github-repository/phase-4-2-repair-fixtures.json";
const repairFreezePath =
  "tests/fixtures/github-repository/phase-4-2-repair-freeze.json";
const attemptStatusPath =
  "tests/fixtures/github-repository/phase-4-2-attempt-status.json";
const freezePayloadPath =
  "tests/fixtures/github-repository/phase-4-4-conformance-freeze.json";
const manifestPath =
  "tests/fixtures/github-repository/phase-4-4-conformance-freeze-manifest.json";
const targetTestPath =
  "src/application/github-repository/phase-4-repair-conformance.test.ts";

const tokenClientPath =
  "src/infrastructure/github/github-installation-token-client.ts";
const repositoryReaderPath =
  "src/infrastructure/github/github-authorized-repository-reader.ts";
const fixtureContractTestPath =
  "src/application/github-repository/phase-4-fixture-contract.test.ts";
const repositoryHttpPath =
  "src/infrastructure/github/github-repository-http.ts";
const ciWorkflowPath = ".github/workflows/ci.yml";

const baseFixtureBlob =
  "85e5b11820bdbc9c52dbd5e9afbef908757480d1";
const baseFreezeBlob =
  "d3770010d847c094adcff938684d649e0a7ee3c0";
const repairFixtureBlob =
  "a0c2af276d4c216dc8e2eb493961b47cb1781be1";
const repairFreezeBlob =
  "1adcee5faafea21631c828efd26a5d1febcafae8";
const tokenClientBlob =
  "3e8ec99ce47a97926e10fc940b4c85becc2a7876";
const repositoryReaderBlob =
  "9f82fe7a276a93fcdffe77edb4c76224cf66ada8";
const fixtureContractTestBlob =
  "30880889eb0ff789c1bf88b824e7dd73e6ab4f1e";
const ciWorkflowBlob =
  "120553ec29014b146079f521d3dc5e42d2819c14";

const baseFixtureFingerprint =
  "sha256:ba1ecd36e0fceb90588cb058457f05eeabe4448930abca8b2bb2fccec3fae0d2";
const repairFixtureFingerprint =
  "sha256:1d77f4da7952babd48152100749c3776d4666f7fb5c46d01e57beb9655df5738";
const failureCodeExactSetFingerprint =
  "sha256:609f592ba4cf99bb9cf9af90a8ac608033408bff300310d1bbf90cb1b5ec91a9";

const repairAllowedPaths = [
  fixtureContractTestPath,
  "src/infrastructure/github/github-authorized-repository-reader.test.ts",
  repositoryReaderPath,
  "src/infrastructure/github/github-installation-token-client.test.ts",
  tokenClientPath,
  repairFixturePath,
  repairFreezePath,
] as const;

const conformanceAllowedPaths = [
  attemptStatusPath,
  freezePayloadPath,
  manifestPath,
  targetTestPath,
] as const;

const attemptStatusSchema = z.object({
  attempt_id: z.literal("phase-4-2-local-repair-run"),
  attempt_version: z.literal("1.0.0"),
  phase: z.literal("phase_4_2"),
  phase_4_commit: z.literal(phase4Commit),
  phase_4_2_commit: z.literal(repairCommit),
  phase_4_2_tree: z.literal(repairTree),
  repair_fixture_path: z.literal(repairFixturePath),
  repair_fixture_blob: z.literal(repairFixtureBlob),
  repair_fixture_fingerprint: z.literal(repairFixtureFingerprint),
  repair_freeze_path: z.literal(repairFreezePath),
  repair_freeze_blob: z.literal(repairFreezeBlob),
  repair_freeze_recorded_at: z.iso.datetime({ offset: true }),
  technical_audit_status: z.literal("passed"),
  technical_findings_resolved: z
    .array(z.enum(["F4.1-01", "F4.1-02", "F4.1-03"]))
    .length(3),
  run_kind: z.literal("development_regression"),
  exposure_status: z.literal("results_viewed"),
  formal_conformance_eligible: z.literal(false),
  ordering_evidence: z.literal("executor_claim_only"),
  invalidation_reason: z.literal("F4.3-E01"),
  production_code_after_repair_modified: z.literal(false),
  historical_artifacts_modified: z.literal(false),
  superseded_by: z.literal("phase-4-4-remote-ci-conformance.v1"),
  contains_real_secret: z.literal(false),
  real_github_called: z.literal(false),
  recorded_at: z.iso.datetime({ offset: true }),
});

const fingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const freezePayloadSchema = z.object({
  freeze_id: z.literal("phase-4-4-remote-ci-conformance.v1"),
  freeze_version: z.literal("1.0.0"),
  phase: z.literal("phase_4_4"),
  base_phase_4_commit: z.literal(phase4Commit),
  repair_commit: z.literal(repairCommit),
  repair_tree: z.literal(repairTree),
  base_fixture_path: z.literal(baseFixturePath),
  base_fixture_blob: z.literal(baseFixtureBlob),
  base_fixture_fingerprint: z.literal(baseFixtureFingerprint),
  base_freeze_path: z.literal(baseFreezePath),
  base_freeze_blob: z.literal(baseFreezeBlob),
  repair_fixture_path: z.literal(repairFixturePath),
  repair_fixture_blob: z.literal(repairFixtureBlob),
  repair_fixture_fingerprint: z.literal(repairFixtureFingerprint),
  repair_freeze_path: z.literal(repairFreezePath),
  repair_freeze_blob: z.literal(repairFreezeBlob),
  attempt_status_path: z.literal(attemptStatusPath),
  attempt_status_fingerprint: fingerprintSchema,
  token_client_path: z.literal(tokenClientPath),
  token_client_blob: z.literal(tokenClientBlob),
  repository_reader_path: z.literal(repositoryReaderPath),
  repository_reader_blob: z.literal(repositoryReaderBlob),
  fixture_contract_test_path: z.literal(fixtureContractTestPath),
  fixture_contract_test_blob: z.literal(fixtureContractTestBlob),
  token_expected_success_status: z.literal(201),
  repository_expected_success_status: z.literal(200),
  revoke_expected_success_status: z.literal(204),
  permissions: z.object({ metadata: z.literal("read") }).strict(),
  repositories_sent: z.literal(false),
  repository_ids_sent: z.literal(false),
  api_origin: z.literal("https://api.github.com"),
  api_version: z.literal("2026-03-10"),
  allowed_endpoints: z.array(z.string()).length(3),
  failure_codes: z.array(z.string()).length(24),
  failure_code_exact_set_fingerprint: z.literal(
    failureCodeExactSetFingerprint,
  ),
  base_fixture_failure_codes: z.array(z.string()).length(20),
  repair_fixture_failure_codes: z.array(z.string()).length(4),
  combined_fixture_failure_codes: z.array(z.string()).length(24),
  combined_fixture_failure_code_fingerprint: z.literal(
    failureCodeExactSetFingerprint,
  ),
  partial_data_returned: z.literal(false),
  target_test_path: z.literal(targetTestPath),
  target_test_fingerprint: fingerprintSchema,
  formal_ci_workflow_path: z.literal(ciWorkflowPath),
  formal_ci_workflow_blob: z.literal(ciWorkflowBlob),
  formal_ci_required_check: z.literal("quality-gate"),
  formal_ci_command: z.literal("pnpm run test"),
  test_frozen: z.literal(true),
  exposure_status: z.literal("known_regression"),
  holdout_eligibility: z.literal("not_applicable"),
  eval_dataset_status: z.literal("not_applicable"),
  dataset_kind: z.literal("engineering_regression_fixture"),
  case_kind: z.literal("repair_conformance_evidence"),
  contains_real_secret: z.literal(false),
  real_github_called: z.literal(false),
  production_code_mutation_allowed: z.literal(false),
  canonicalization_algorithm: z.object({
    version: z.literal("canonical-text-sha256.v1"),
    encoding: z.literal("UTF-8"),
    line_endings: z.literal("CRLF/CR to LF"),
    trim: z.literal(false),
    json_parse_stringify: z.literal(false),
  }),
  recorded_at: z.iso.datetime({ offset: true }),
});

const manifestSchema = z.object({
  manifest_id: z.literal(
    "phase-4-4-remote-ci-conformance-manifest.v1",
  ),
  manifest_version: z.literal("1.0.0"),
  freeze_payload_path: z.literal(freezePayloadPath),
  freeze_payload_sha256: fingerprintSchema,
  attempt_status_path: z.literal(attemptStatusPath),
  attempt_status_sha256: fingerprintSchema,
  target_test_path: z.literal(targetTestPath),
  target_test_sha256: fingerprintSchema,
  phase_4_base_fixture_sha256: z.literal(baseFixtureFingerprint),
  phase_4_repair_fixture_sha256: z.literal(repairFixtureFingerprint),
  token_client_blob: z.literal(tokenClientBlob),
  repository_reader_blob: z.literal(repositoryReaderBlob),
  fixture_contract_test_blob: z.literal(fixtureContractTestBlob),
  failure_code_exact_set_sha256: z.literal(
    failureCodeExactSetFingerprint,
  ),
  combined_fixture_failure_code_sha256: z.literal(
    failureCodeExactSetFingerprint,
  ),
  ci_workflow_path: z.literal(ciWorkflowPath),
  ci_workflow_blob: z.literal(ciWorkflowBlob),
  expected_repair_commit: z.literal(repairCommit),
  formal_evidence_source: z.literal("github_actions"),
  created_before_formal_ci: z.literal(true),
  canonicalization_algorithm_version: z.literal(
    "canonical-text-sha256.v1",
  ),
  recorded_at: z.iso.datetime({ offset: true }),
});

const repositoryRoot = process.cwd();

function canonicalText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sha256Text(text: string) {
  return `sha256:${createHash("sha256")
    .update(canonicalText(text), "utf8")
    .digest("hex")}`;
}

function sha256ExactSet(values: readonly string[]) {
  const exactSet = [...new Set(values)].sort();

  return `sha256:${createHash("sha256")
    .update(JSON.stringify(exactSet), "utf8")
    .digest("hex")}`;
}

function readUtf8(relativePath: string) {
  return readFileSync(path.resolve(relativePath), "utf8");
}

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

function git(args: string[]) {
  return runGit(args).trim();
}

function gitText(commit: string, relativePath: string) {
  return runGit(["show", `${commit}:${relativePath}`]);
}

function gitBlob(commit: string, relativePath: string) {
  return git(["rev-parse", `${commit}:${relativePath}`]);
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function fixtureFailureCodes(text: string) {
  const fixtures = JSON.parse(text) as Array<{
    expected_failure_code: string | null;
  }>;

  return sortedUnique(
    fixtures
      .map((fixture) => fixture.expected_failure_code)
      .filter((code): code is string => code !== null),
  );
}

function publicFailureCodes(httpSource: string) {
  const arrayBody = httpSource.match(
    /const publicFailureCodeOrder = \[([\s\S]*?)\] as const;/,
  )?.[1];

  if (!arrayBody) throw new Error("public failure code order missing");

  return sortedUnique(
    [...arrayBody.matchAll(/["']([^"']+)["']/g)].map(
      (match) => match[1],
    ),
  );
}

function implementationFailureCodes() {
  const sourcePaths = [
    "src/application/github-repository/list-authorized-github-repositories.ts",
    "src/app/api/github/repositories/route.ts",
    tokenClientPath,
    repositoryReaderPath,
    "src/infrastructure/github/github-authorized-repository-gateway.ts",
  ];
  const codes: string[] = [];

  for (const sourcePath of sourcePaths) {
    const source = gitText(repairCommit, sourcePath);

    for (const setMatch of source.matchAll(/new Set\(\[([\s\S]*?)\]\)/g)) {
      for (const codeMatch of setMatch[1].matchAll(
        /["']((?:github_[a-z0-9_]+)|unauthenticated)["']/g,
      )) {
        codes.push(codeMatch[1]);
      }
    }

    for (const errorMatch of source.matchAll(
      /new Error\(\s*["']((?:github_[a-z0-9_]+)|unauthenticated)["']/g,
    )) {
      codes.push(errorMatch[1]);
    }
  }

  return sortedUnique(codes);
}

function difference(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function tokenRequestBody(source: string) {
  const start = source.indexOf("body: JSON.stringify(");
  const end = source.indexOf("signal:", start);

  if (start < 0 || end < 0) throw new Error("token request body missing");
  return source.slice(start, end);
}

function currentConformanceScope() {
  const head = git(["rev-parse", "HEAD"]);

  if (head === repairCommit) {
    return git(["status", "--porcelain"])
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.slice(3).replaceAll("\\", "/"))
      .sort();
  }

  expect(git(["rev-parse", `${head}^`])).toBe(repairCommit);
  return git(["diff", "--name-only", repairCommit, head])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

describe("phase-4-4-remote-ci-conformance.v1", () => {
  it("archives the exposed Phase 4.2 development run without rewriting history", () => {
    const attempt = attemptStatusSchema.parse(
      JSON.parse(readUtf8(attemptStatusPath)),
    );

    expect(attempt.technical_findings_resolved).toEqual([
      "F4.1-01",
      "F4.1-02",
      "F4.1-03",
    ]);
    expect(attempt.run_kind).toBe("development_regression");
    expect(attempt.formal_conformance_eligible).toBe(false);
    expect(attempt.ordering_evidence).toBe("executor_claim_only");
    expect(attempt.invalidation_reason).toBe("F4.3-E01");
    expect(gitBlob(repairCommit, repairFreezePath)).toBe(repairFreezeBlob);
  });

  it("validates the freeze and manifest without self-referential fingerprints", () => {
    const freezeText = readUtf8(freezePayloadPath);
    const manifestText = readUtf8(manifestPath);
    const attemptText = readUtf8(attemptStatusPath);
    const targetTestText = readUtf8(targetTestPath);
    const freeze = freezePayloadSchema.parse(JSON.parse(freezeText));
    const manifest = manifestSchema.parse(JSON.parse(manifestText));

    expect(freeze).not.toHaveProperty("freeze_payload_sha256");
    expect(manifest).not.toHaveProperty("manifest_sha256");
    expect(manifest.freeze_payload_sha256).toBe(sha256Text(freezeText));
    expect(manifest.attempt_status_sha256).toBe(sha256Text(attemptText));
    expect(manifest.target_test_sha256).toBe(sha256Text(targetTestText));
    expect(freeze.attempt_status_fingerprint).toBe(
      manifest.attempt_status_sha256,
    );
    expect(freeze.target_test_fingerprint).toBe(
      manifest.target_test_sha256,
    );
  });

  it("binds every Phase 4 and Phase 4.2 historical fact to fixed Git blobs", () => {
    const freeze = freezePayloadSchema.parse(
      JSON.parse(readUtf8(freezePayloadPath)),
    );
    const bindings = [
      [baseFixturePath, baseFixtureBlob],
      [baseFreezePath, baseFreezeBlob],
      [repairFixturePath, repairFixtureBlob],
      [repairFreezePath, repairFreezeBlob],
      [tokenClientPath, tokenClientBlob],
      [repositoryReaderPath, repositoryReaderBlob],
      [fixtureContractTestPath, fixtureContractTestBlob],
      [ciWorkflowPath, ciWorkflowBlob],
    ] as const;

    expect(git(["rev-parse", repairCommit])).toBe(repairCommit);
    expect(git(["rev-parse", `${repairCommit}^`])).toBe(phase4Commit);
    expect(git(["show", "-s", "--format=%T", repairCommit])).toBe(
      repairTree,
    );

    for (const [artifactPath, expectedBlob] of bindings) {
      expect(gitBlob(repairCommit, artifactPath)).toBe(expectedBlob);
    }

    expect(sha256Text(gitText(repairCommit, baseFixturePath))).toBe(
      baseFixtureFingerprint,
    );
    expect(sha256Text(gitText(repairCommit, repairFixturePath))).toBe(
      repairFixtureFingerprint,
    );
    expect(freeze.base_fixture_fingerprint).toBe(baseFixtureFingerprint);
    expect(freeze.repair_fixture_fingerprint).toBe(
      repairFixtureFingerprint,
    );
  });

  it("freezes exact HTTP statuses, minimal permissions, and three endpoints", () => {
    const freeze = freezePayloadSchema.parse(
      JSON.parse(readUtf8(freezePayloadPath)),
    );
    const tokenSource = gitText(repairCommit, tokenClientPath);
    const repositorySource = gitText(repairCommit, repositoryReaderPath);
    const originalFreeze = JSON.parse(
      gitText(repairCommit, baseFreezePath),
    ) as {
      allowed_endpoints: string[];
      rest_api_version: string;
      github_api_origin: string;
    };
    const requestBody = tokenRequestBody(tokenSource);

    expect(tokenSource).toContain("response.status !== 201");
    expect(repositorySource).toContain("response.status !== 200");
    expect(tokenSource).toContain("response.status !== 204");
    expect(tokenSource).not.toContain("response.ok");
    expect(repositorySource).not.toContain("response.ok");
    expect(requestBody).toContain('permissions: { metadata: "read" }');
    expect(requestBody).not.toMatch(/\brepositories\b/);
    expect(requestBody).not.toMatch(/\brepository_ids\b/);
    expect(freeze.permissions).toEqual({ metadata: "read" });
    expect(freeze.repositories_sent).toBe(false);
    expect(freeze.repository_ids_sent).toBe(false);
    expect(freeze.api_origin).toBe(originalFreeze.github_api_origin);
    expect(freeze.api_version).toBe(originalFreeze.rest_api_version);
    expect(freeze.allowed_endpoints).toEqual(
      originalFreeze.allowed_endpoints,
    );
  });

  it("derives and reconciles all 24 failure codes without fuzzy matching", () => {
    const freeze = freezePayloadSchema.parse(
      JSON.parse(readUtf8(freezePayloadPath)),
    );
    const baseCodes = fixtureFailureCodes(
      gitText(repairCommit, baseFixturePath),
    );
    const repairCodes = fixtureFailureCodes(
      gitText(repairCommit, repairFixturePath),
    );
    const combinedCodes = sortedUnique([...baseCodes, ...repairCodes]);
    const contractCodes = publicFailureCodes(
      gitText(repairCommit, repositoryHttpPath),
    );
    const implementationCodes = implementationFailureCodes();

    expect(baseCodes).toHaveLength(20);
    expect(repairCodes).toHaveLength(4);
    expect(combinedCodes).toHaveLength(24);
    expect(contractCodes).toHaveLength(24);
    expect(implementationCodes).toHaveLength(24);
    expect(difference(implementationCodes, combinedCodes)).toEqual([]);
    expect(difference(combinedCodes, implementationCodes)).toEqual([]);
    expect(difference(contractCodes, combinedCodes)).toEqual([]);
    expect(difference(combinedCodes, contractCodes)).toEqual([]);
    expect(freeze.base_fixture_failure_codes).toEqual(baseCodes);
    expect(freeze.repair_fixture_failure_codes).toEqual(repairCodes);
    expect(freeze.combined_fixture_failure_codes).toEqual(combinedCodes);
    expect(freeze.failure_codes).toEqual(contractCodes);
    expect(sha256ExactSet(contractCodes)).toBe(
      failureCodeExactSetFingerprint,
    );
  });

  it("keeps repair, conformance, CI, and security scopes immutable", () => {
    const freeze = freezePayloadSchema.parse(
      JSON.parse(readUtf8(freezePayloadPath)),
    );
    const manifest = manifestSchema.parse(
      JSON.parse(readUtf8(manifestPath)),
    );
    const repairChangedPaths = git([
      "diff",
      "--name-only",
      phase4Commit,
      repairCommit,
    ])
      .split(/\r?\n/)
      .filter(Boolean)
      .sort();
    const ciSource = gitText(repairCommit, ciWorkflowPath);

    expect(repairChangedPaths).toEqual([...repairAllowedPaths].sort());
    expect(currentConformanceScope()).toEqual(
      [...conformanceAllowedPaths].sort(),
    );
    expect(gitBlob(repairCommit, ciWorkflowPath)).toBe(ciWorkflowBlob);
    expect(manifest.ci_workflow_blob).toBe(ciWorkflowBlob);
    expect(ciSource).toMatch(/fetch-depth:\s*0/);
    expect(ciSource).toMatch(/run:\s*pnpm(?:\s+run)?\s+test(?:\s|$)/m);
    expect(freeze.partial_data_returned).toBe(false);
    expect(freeze.contains_real_secret).toBe(false);
    expect(freeze.real_github_called).toBe(false);
    expect(freeze.production_code_mutation_allowed).toBe(false);
  });
});
