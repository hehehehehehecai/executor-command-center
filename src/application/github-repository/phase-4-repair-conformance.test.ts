// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const phase4Commit =
  "09724056fa5d9fead3a616c0d588392172bfda66";
const repairCommit =
  "825b9447c4c3c109180c1e6dc258f9c40e3f0841";
const repairTree =
  "e460d2ebf4271f54bbef6a045d9c73003af32e40";
const phase4ConformanceCommit =
  "8e2a95b883861fd24ef84be269c9f6ee2e12f42d";
const phase4ConformanceTree =
  "6d9541fab95a166d5244cd54eecd11672d87cc08";
const phase4FinalConformanceCommit =
  "3f2a0d72c286ac09b26068bdefa9a6b8dd601e7d";
const phase4IntegrationBaseCommit =
  "d5ef16bbcecb5d267d051bbcf5e04c4060d07566";
const phase4IntegrationMergeCommit =
  "01abfef14effbfd7e61aa370b254ad34d4182134";
const integratedConformanceContract =
  "phase-5-2-integrated-conformance-descendant.v1";

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
const attemptStatusBlob =
  "e48bb4e99d4dde96a8e5ffdae09b72d67f4c1de2";
const freezePayloadBlob =
  "ce3db4f1a6ba5a92637bb1b539d44f8860ce85c5";
const manifestBlob =
  "97ba67a39efe0ff7673b5224d1972a1fa329bee3";
const historicalTargetTestBlob =
  "ab005f2dd87608c0d6aceacd15bc99ca6ca99445";

const baseFixtureFingerprint =
  "sha256:ba1ecd36e0fceb90588cb058457f05eeabe4448930abca8b2bb2fccec3fae0d2";
const repairFixtureFingerprint =
  "sha256:1d77f4da7952babd48152100749c3776d4666f7fb5c46d01e57beb9655df5738";
const failureCodeExactSetFingerprint =
  "sha256:609f592ba4cf99bb9cf9af90a8ac608033408bff300310d1bbf90cb1b5ec91a9";
const attemptStatusFingerprint =
  "sha256:a2b364951793af00780864b3b9f5a2d1fd60057dc88bc34d3736dd32534640bc";
const freezePayloadFingerprint =
  "sha256:a7c79f23f203be04a4b6c3da32b8ecf55a3c54490d541d492f91529dedb85839";
const historicalTargetTestFingerprint =
  "sha256:40112ff11ffad1b12d9d68ff1ba852046ef916b7a3a8a344bf94a0cb673d135b";

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

type GitCommand = (args: string[]) => string;

type ConformanceIntegrationBoundary = {
  finalConformanceCommit: string;
  integrationBaseCommit: string;
  integrationMergeCommit: string;
};

type ConformanceExecutionEndpoint = {
  mode:
    | "direct_conformance"
    | "linear_descendant"
    | "synthetic_pull_request_merge"
    | "integrated_conformance_descendant";
  executionHead: string;
  scopeEndpoint: string;
  syntheticMergeCommit: string | null;
  baseParent: string | null;
  pullRequestParent: string | null;
  integrationMergeCommit?: string;
  finalConformanceCommit?: string;
};

type ConformanceScope = ConformanceExecutionEndpoint & {
  scopePaths: string[];
  postConformancePaths: string[];
};

class ConformanceContractError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ConformanceContractError";
  }
}

function readHistoricalConformanceArtifact(
  gitCommand: GitCommand,
  commit: string,
  relativePath: string,
  expectedBlob: string,
  expectedFingerprint?: string,
) {
  try {
    gitCommand(["rev-parse", "--verify", `${commit}^{commit}`]);
  } catch {
    throw new ConformanceContractError(
      "historical_conformance_commit_missing",
    );
  }

  let actualBlob: string;
  let text: string;

  try {
    actualBlob = gitCommand([
      "rev-parse",
      `${commit}:${relativePath}`,
    ]).trim();
    text = gitCommand(["show", `${commit}:${relativePath}`]);
  } catch {
    throw new ConformanceContractError(
      `historical_conformance_artifact_missing:${relativePath}`,
    );
  }

  if (actualBlob !== expectedBlob) {
    throw new ConformanceContractError(
      `historical_conformance_blob_mismatch:${relativePath}`,
    );
  }

  if (
    expectedFingerprint !== undefined &&
    sha256Text(text) !== expectedFingerprint
  ) {
    throw new ConformanceContractError(
      `historical_conformance_fingerprint_mismatch:${relativePath}`,
    );
  }

  return { blob: actualBlob, text };
}

function commitParents(gitCommand: GitCommand, commit: string) {
  const line = gitCommand([
    "rev-list",
    "--parents",
    "-n",
    "1",
    commit,
  ]).trim();
  return line.split(/\s+/).slice(1);
}

function assertConformanceIntegrationBoundary(
  gitCommand: GitCommand,
  conformanceCommit: string,
  boundary: ConformanceIntegrationBoundary,
) {
  try {
    gitCommand([
      "rev-parse",
      "--verify",
      `${boundary.finalConformanceCommit}^{commit}`,
    ]);
  } catch {
    throw new ConformanceContractError(
      "conformance_final_commit_missing",
    );
  }

  const finalParents = commitParents(
    gitCommand,
    boundary.finalConformanceCommit,
  );

  if (
    finalParents.length !== 1 ||
    finalParents[0] !== conformanceCommit
  ) {
    throw new ConformanceContractError(
      "conformance_final_commit_parent_mismatch",
    );
  }

  try {
    gitCommand([
      "rev-parse",
      "--verify",
      `${boundary.integrationMergeCommit}^{commit}`,
    ]);
  } catch {
    throw new ConformanceContractError(
      "conformance_integration_commit_missing",
    );
  }

  const integrationParents = commitParents(
    gitCommand,
    boundary.integrationMergeCommit,
  );
  const expectedParents = new Set([
    boundary.integrationBaseCommit,
    boundary.finalConformanceCommit,
  ]);

  if (
    integrationParents.length !== 2 ||
    new Set(integrationParents).size !== 2 ||
    integrationParents.some((parent) => !expectedParents.has(parent))
  ) {
    throw new ConformanceContractError(
      "conformance_integration_parent_mismatch",
    );
  }
}

function isAncestor(
  gitCommand: GitCommand,
  ancestor: string,
  descendant: string,
) {
  if (ancestor === descendant) return true;

  try {
    return gitCommand(["merge-base", ancestor, descendant]) === ancestor;
  } catch {
    return false;
  }
}

function assertLinearConformanceHistory(
  gitCommand: GitCommand,
  conformanceCommit: string,
  endpoint: string,
) {
  if (conformanceCommit === endpoint) return;

  const history = gitCommand([
    "rev-list",
    "--parents",
    "--ancestry-path",
    `${conformanceCommit}..${endpoint}`,
  ])
    .split(/\r?\n/)
    .filter(Boolean);

  if (
    history.length === 0 ||
    history.some((line) => line.trim().split(/\s+/).length !== 2)
  ) {
    throw new ConformanceContractError(
      "conformance_history_non_linear",
    );
  }
}

function changedPaths(
  gitCommand: GitCommand,
  start: string,
  endpoint: string,
) {
  const output = gitCommand([
    "diff",
    "--name-only",
    start,
    endpoint,
  ]);

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((relativePath) => relativePath.replaceAll("\\", "/"))
    .sort();
}

function hasExactPaths(
  actualPaths: readonly string[],
  expectedPaths: readonly string[],
) {
  return (
    actualPaths.length === new Set(actualPaths).size &&
    JSON.stringify([...actualPaths].sort()) ===
      JSON.stringify([...expectedPaths].sort())
  );
}

function resolveConformanceExecutionEndpoint(
  gitCommand: GitCommand,
  head: string,
  conformanceCommit: string,
  expectedRepairCommit: string,
  integrationBoundary?: ConformanceIntegrationBoundary,
): ConformanceExecutionEndpoint {
  try {
    gitCommand([
      "rev-parse",
      "--verify",
      `${conformanceCommit}^{commit}`,
    ]);
  } catch {
    throw new ConformanceContractError(
      "historical_conformance_commit_missing",
    );
  }

  const conformanceParents = commitParents(
    gitCommand,
    conformanceCommit,
  );

  if (
    conformanceParents.length !== 1 ||
    conformanceParents[0] !== expectedRepairCommit
  ) {
    throw new ConformanceContractError(
      "conformance_commit_parent_mismatch",
    );
  }

  if (integrationBoundary) {
    assertConformanceIntegrationBoundary(
      gitCommand,
      conformanceCommit,
      integrationBoundary,
    );

    if (
      isAncestor(
        gitCommand,
        integrationBoundary.integrationMergeCommit,
        head,
      )
    ) {
      return {
        mode: "integrated_conformance_descendant",
        executionHead: head,
        scopeEndpoint:
          integrationBoundary.finalConformanceCommit,
        syntheticMergeCommit: null,
        baseParent: null,
        pullRequestParent: null,
        integrationMergeCommit:
          integrationBoundary.integrationMergeCommit,
        finalConformanceCommit:
          integrationBoundary.finalConformanceCommit,
      };
    }
  }

  if (head === conformanceCommit) {
    return {
      mode: "direct_conformance",
      executionHead: head,
      scopeEndpoint: conformanceCommit,
      syntheticMergeCommit: null,
      baseParent: null,
      pullRequestParent: null,
    };
  }

  const parents = commitParents(gitCommand, head);

  if (
    parents.length === 1 &&
    isAncestor(gitCommand, conformanceCommit, head)
  ) {
    assertLinearConformanceHistory(
      gitCommand,
      conformanceCommit,
      head,
    );

    return {
      mode: "linear_descendant",
      executionHead: head,
      scopeEndpoint: head,
      syntheticMergeCommit: null,
      baseParent: null,
      pullRequestParent: null,
    };
  }

  if (parents.length !== 2) {
    throw new ConformanceContractError("conformance_head_unsupported");
  }

  const pullRequestParents = parents.filter((parent) =>
    isAncestor(gitCommand, conformanceCommit, parent),
  );

  if (pullRequestParents.length === 0) {
    throw new ConformanceContractError(
      "conformance_pr_parent_missing",
    );
  }

  if (pullRequestParents.length !== 1) {
    throw new ConformanceContractError(
      "conformance_pr_parent_ambiguous",
    );
  }

  const pullRequestParent = pullRequestParents[0];
  const baseParent = parents.find(
    (parent) => parent !== pullRequestParent,
  );

  if (!baseParent) {
    throw new ConformanceContractError(
      "conformance_pr_parent_ambiguous",
    );
  }

  assertLinearConformanceHistory(
    gitCommand,
    conformanceCommit,
    pullRequestParent,
  );

  return {
    mode: "synthetic_pull_request_merge",
    executionHead: head,
    scopeEndpoint: pullRequestParent,
    syntheticMergeCommit: head,
    baseParent,
    pullRequestParent,
  };
}

function resolveConformanceScope(
  gitCommand: GitCommand,
  head: string,
  conformanceCommit: string,
  expectedRepairCommit: string,
  integrationBoundary?: ConformanceIntegrationBoundary,
): ConformanceScope {
  const endpoint = resolveConformanceExecutionEndpoint(
    gitCommand,
    head,
    conformanceCommit,
    expectedRepairCommit,
    integrationBoundary,
  );
  const scopePaths = changedPaths(
    gitCommand,
    expectedRepairCommit,
    endpoint.scopeEndpoint,
  );
  const postConformancePaths = changedPaths(
    gitCommand,
    conformanceCommit,
    endpoint.scopeEndpoint,
  );
  const expectedPostConformancePaths =
    endpoint.mode === "direct_conformance" ? [] : [targetTestPath];

  if (
    !hasExactPaths(
      postConformancePaths,
      expectedPostConformancePaths,
    )
  ) {
    throw new ConformanceContractError(
      "post_conformance_scope_mismatch",
    );
  }

  if (!hasExactPaths(scopePaths, conformanceAllowedPaths)) {
    throw new ConformanceContractError("conformance_scope_mismatch");
  }

  return { ...endpoint, scopePaths, postConformancePaths };
}

type TempGitRepository = {
  directory: string;
  git: GitCommand;
  write: (relativePath: string, contents: string) => void;
  commit: (message: string) => string;
};

function withTempGitRepository(
  run: (repository: TempGitRepository) => void,
) {
  const directory = mkdtempSync(
    path.join(tmpdir(), "phase-4-6-conformance-"),
  );
  const tempGit = (args: string[]) => {
    const result = spawnSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      windowsHide: true,
    });

    if (result.status !== 0) {
      throw new Error(
        result.stderr ||
          `git ${args.join(" ")} failed with ${result.status}`,
      );
    }

    return result.stdout.trim();
  };
  const write = (relativePath: string, contents: string) => {
    const absolutePath = path.join(directory, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  };
  const commit = (message: string) => {
    tempGit(["add", "--all"]);
    tempGit(["commit", "--quiet", "-m", message]);
    return tempGit(["rev-parse", "HEAD"]);
  };

  try {
    tempGit(["init", "--quiet", "--initial-branch=main"]);
    tempGit(["config", "user.name", "Phase 4.6 Test"]);
    tempGit(["config", "user.email", "phase-4-6@example.invalid"]);
    run({ directory, git: tempGit, write, commit });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function createConformanceLineage(repository: TempGitRepository) {
  repository.write("lineage/root.txt", "root\n");
  const commonRoot = repository.commit("common root");
  repository.git(["branch", "base", commonRoot]);

  repository.write("lineage/repair.txt", "repair\n");
  const repair = repository.commit("repair");

  for (const relativePath of conformanceAllowedPaths) {
    repository.write(relativePath, `conformance:${relativePath}\n`);
  }
  const conformance = repository.commit("conformance");
  repository.git(["branch", "pull-request", conformance]);

  return { commonRoot, repair, conformance };
}

function createPullRequestRepair(repository: TempGitRepository) {
  repository.git(["checkout", "--quiet", "pull-request"]);
  repository.write(targetTestPath, "phase-4-6 repair\n");
  return repository.commit("phase 4.6 repair");
}

function createBaseChange(repository: TempGitRepository) {
  repository.git(["checkout", "--quiet", "base"]);
  repository.write("docs/base-only-change.md", "base only\n");
  return repository.commit("base only change");
}

function createMerge(
  repository: TempGitRepository,
  currentBranch: string,
  mergedBranch: string,
) {
  repository.git(["checkout", "--quiet", currentBranch]);
  repository.git([
    "merge",
    "--quiet",
    "--no-ff",
    "-m",
    `merge ${mergedBranch}`,
    mergedBranch,
  ]);
  return repository.git(["rev-parse", "HEAD"]);
}

function createIntegratedConformanceLineage(
  repository: TempGitRepository,
  parentOrder: "base-first" | "final-first" = "base-first",
) {
  const lineage = createConformanceLineage(repository);
  const finalConformance = createPullRequestRepair(repository);
  const integrationBase = createBaseChange(repository);
  const integrationMerge =
    parentOrder === "base-first"
      ? createMerge(repository, "base", "pull-request")
      : createMerge(repository, "pull-request", "base");

  return {
    ...lineage,
    finalConformance,
    integrationBase,
    integrationMerge,
    boundary: {
      finalConformanceCommit: finalConformance,
      integrationBaseCommit: integrationBase,
      integrationMergeCommit: integrationMerge,
    },
  };
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
  return resolveConformanceScope(
    git,
    head,
    phase4ConformanceCommit,
    repairCommit,
    {
      finalConformanceCommit: phase4FinalConformanceCommit,
      integrationBaseCommit: phase4IntegrationBaseCommit,
      integrationMergeCommit: phase4IntegrationMergeCommit,
    },
  ).scopePaths;
}

describe(
  "phase-4-6-pr-merge-conformance-resolution.v1",
  { timeout: 30_000 },
  () => {
  it("uses the fixed Phase 4.4 target test blob after the current test changes", () => {
    const historicalTarget = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      targetTestPath,
      historicalTargetTestBlob,
      historicalTargetTestFingerprint,
    );

    expect(historicalTarget.blob).toBe(historicalTargetTestBlob);
    expect(sha256Text(historicalTarget.text)).toBe(
      historicalTargetTestFingerprint,
    );
    expect(sha256Text(readUtf8(targetTestPath))).not.toBe(
      historicalTargetTestFingerprint,
    );
  });

  it("fails closed when the fixed historical commit or path is missing", () => {
    expect(() =>
      readHistoricalConformanceArtifact(
        runGit,
        "0000000000000000000000000000000000000000",
        targetTestPath,
        historicalTargetTestBlob,
      ),
    ).toThrow("historical_conformance_commit_missing");
    expect(() =>
      readHistoricalConformanceArtifact(
        runGit,
        phase4ConformanceCommit,
        "missing/historical-artifact.json",
        historicalTargetTestBlob,
      ),
    ).toThrow(
      "historical_conformance_artifact_missing:missing/historical-artifact.json",
    );
    expect(() =>
      readHistoricalConformanceArtifact(
        runGit,
        phase4ConformanceCommit,
        targetTestPath,
        "0000000000000000000000000000000000000000",
      ),
    ).toThrow(
      `historical_conformance_blob_mismatch:${targetTestPath}`,
    );
    expect(() =>
      readHistoricalConformanceArtifact(
        runGit,
        phase4ConformanceCommit,
        targetTestPath,
        historicalTargetTestBlob,
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toThrow(
      `historical_conformance_fingerprint_mismatch:${targetTestPath}`,
    );
  });

  it("resolves a direct conformance commit", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      const result = resolveConformanceExecutionEndpoint(
        repository.git,
        lineage.conformance,
        lineage.conformance,
        lineage.repair,
      );

      expect(result).toEqual({
        mode: "direct_conformance",
        executionHead: lineage.conformance,
        scopeEndpoint: lineage.conformance,
        syntheticMergeCommit: null,
        baseParent: null,
        pullRequestParent: null,
      });
    });
  });

  it("resolves a linear Phase 4.6 descendant and its exact scope", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      const repairHead = createPullRequestRepair(repository);
      const result = resolveConformanceScope(
        repository.git,
        repairHead,
        lineage.conformance,
        lineage.repair,
      );

      expect(result.mode).toBe("linear_descendant");
      expect(result.scopeEndpoint).toBe(repairHead);
      expect(result.scopePaths).toEqual(
        [...conformanceAllowedPaths].sort(),
      );
      expect(result.postConformancePaths).toEqual([targetTestPath]);
    });
  });

  it("resolves a base-first synthetic pull request merge", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      const pullRequestParent = createPullRequestRepair(repository);
      const baseParent = createBaseChange(repository);
      const head = createMerge(repository, "base", "pull-request");
      const result = resolveConformanceExecutionEndpoint(
        repository.git,
        head,
        lineage.conformance,
        lineage.repair,
      );

      expect(result).toEqual({
        mode: "synthetic_pull_request_merge",
        executionHead: head,
        scopeEndpoint: pullRequestParent,
        syntheticMergeCommit: head,
        baseParent,
        pullRequestParent,
      });
    });
  });

  it("resolves a PR-first synthetic merge without parent-order assumptions", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      const pullRequestParent = createPullRequestRepair(repository);
      const baseParent = createBaseChange(repository);
      const head = createMerge(repository, "pull-request", "base");
      const result = resolveConformanceExecutionEndpoint(
        repository.git,
        head,
        lineage.conformance,
        lineage.repair,
      );

      expect(result).toEqual({
        mode: "synthetic_pull_request_merge",
        executionHead: head,
        scopeEndpoint: pullRequestParent,
        syntheticMergeCommit: head,
        baseParent,
        pullRequestParent,
      });
    });
  });

  it("rejects a synthetic merge with no conformance PR parent", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "left",
        lineage.commonRoot,
      ]);
      repository.write("lineage/left.txt", "left\n");
      repository.commit("left");
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "right",
        lineage.commonRoot,
      ]);
      repository.write("lineage/right.txt", "right\n");
      repository.commit("right");
      const head = createMerge(repository, "left", "right");

      expect(() =>
        resolveConformanceExecutionEndpoint(
          repository.git,
          head,
          lineage.conformance,
          lineage.repair,
        ),
      ).toThrow("conformance_pr_parent_missing");
    });
  });

  it("rejects a synthetic merge with two conformance PR parents", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "left",
        lineage.conformance,
      ]);
      repository.write("lineage/left.txt", "left\n");
      repository.commit("left");
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "right",
        lineage.conformance,
      ]);
      repository.write("lineage/right.txt", "right\n");
      repository.commit("right");
      const head = createMerge(repository, "left", "right");

      expect(() =>
        resolveConformanceExecutionEndpoint(
          repository.git,
          head,
          lineage.conformance,
          lineage.repair,
        ),
      ).toThrow("conformance_pr_parent_ambiguous");
    });
  });

  it("rejects a conformance commit whose parent is not the repair commit", () => {
    withTempGitRepository((repository) => {
      repository.write("lineage/repair.txt", "repair\n");
      const repair = repository.commit("repair");
      repository.write("lineage/unexpected.txt", "unexpected\n");
      repository.commit("unexpected parent");
      repository.write(targetTestPath, "conformance\n");
      const conformance = repository.commit("conformance");

      expect(() =>
        resolveConformanceExecutionEndpoint(
          repository.git,
          conformance,
          conformance,
          repair,
        ),
      ).toThrow("conformance_commit_parent_mismatch");
    });
  });

  it("rejects non-linear history between conformance and the PR parent", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "pr-left",
        lineage.conformance,
      ]);
      repository.write(targetTestPath, "left repair\n");
      repository.commit("left repair");
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "pr-right",
        lineage.conformance,
      ]);
      repository.write("lineage/right.txt", "right repair\n");
      repository.commit("right repair");
      createMerge(repository, "pr-left", "pr-right");
      createBaseChange(repository);
      const head = createMerge(repository, "base", "pr-left");

      expect(() =>
        resolveConformanceExecutionEndpoint(
          repository.git,
          head,
          lineage.conformance,
          lineage.repair,
        ),
      ).toThrow("conformance_history_non_linear");
    });
  });

  it("rejects post-conformance scope drift outside the target test", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      createPullRequestRepair(repository);
      repository.write(
        "src/infrastructure/github/production-drift.ts",
        "production drift\n",
      );
      const head = repository.commit("out-of-scope drift");

      expect(() =>
        resolveConformanceScope(
          repository.git,
          head,
          lineage.conformance,
          lineage.repair,
        ),
      ).toThrow("post_conformance_scope_mismatch");
    });
  });

  it("rejects an unsupported head and an incomplete conformance scope", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      repository.git([
        "checkout",
        "--quiet",
        "-b",
        "unrelated",
        lineage.commonRoot,
      ]);
      repository.write("lineage/unrelated.txt", "unrelated\n");
      const unrelatedHead = repository.commit("unrelated");

      expect(() =>
        resolveConformanceExecutionEndpoint(
          repository.git,
          unrelatedHead,
          lineage.conformance,
          lineage.repair,
        ),
      ).toThrow("conformance_head_unsupported");

      expect(() =>
        resolveConformanceScope(
          repository.git,
          lineage.conformance,
          lineage.conformance,
          lineage.commonRoot,
        ),
      ).toThrow("conformance_commit_parent_mismatch");
    });

    withTempGitRepository((repository) => {
      repository.write("lineage/repair.txt", "repair\n");
      const repair = repository.commit("repair");
      repository.write(targetTestPath, "conformance\n");
      const conformance = repository.commit("conformance");

      expect(() =>
        resolveConformanceScope(
          repository.git,
          conformance,
          conformance,
          repair,
        ),
      ).toThrow("conformance_scope_mismatch");
    });
  });

  it("excludes base-only changes from synthetic merge conformance scope", () => {
    withTempGitRepository((repository) => {
      const lineage = createConformanceLineage(repository);
      const pullRequestParent = createPullRequestRepair(repository);
      createBaseChange(repository);
      const head = createMerge(repository, "base", "pull-request");
      const result = resolveConformanceScope(
        repository.git,
        head,
        lineage.conformance,
        lineage.repair,
      );

      expect(result.scopeEndpoint).toBe(pullRequestParent);
      expect(result.scopePaths).toEqual(
        [...conformanceAllowedPaths].sort(),
      );
      expect(result.scopePaths).not.toContain(
        "docs/base-only-change.md",
      );
    });
  });

  describe(integratedConformanceContract, () => {
    it("resolves the current Phase 5 commit as an integrated conformance descendant", () => {
      const result = resolveConformanceScope(
        git,
        git(["rev-parse", "HEAD"]),
        phase4ConformanceCommit,
        repairCommit,
        {
          finalConformanceCommit: phase4FinalConformanceCommit,
          integrationBaseCommit: phase4IntegrationBaseCommit,
          integrationMergeCommit: phase4IntegrationMergeCommit,
        },
      );

      expect(result).toMatchObject({
        mode: "integrated_conformance_descendant",
        executionHead: git(["rev-parse", "HEAD"]),
        scopeEndpoint: phase4FinalConformanceCommit,
        integrationMergeCommit: phase4IntegrationMergeCommit,
        finalConformanceCommit: phase4FinalConformanceCommit,
      });
      expect(result.scopePaths).toEqual(
        [...conformanceAllowedPaths].sort(),
      );
      expect(result.postConformancePaths).toEqual([targetTestPath]);
    });

    it("keeps repair and later ordinary commits outside the integrated historical scope", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.write("phase-5/feature.txt", "phase 5\n");
        repository.commit("phase 5");
        repository.write(targetTestPath, "phase 5.2 repair\n");
        const repairHead = repository.commit("phase 5.2 repair");
        repository.write("phase-5/later.txt", "later\n");
        const laterHead = repository.commit("later");

        for (const head of [repairHead, laterHead]) {
          const result = resolveConformanceScope(
            repository.git,
            head,
            lineage.conformance,
            lineage.repair,
            lineage.boundary,
          );

          expect(result.mode).toBe(
            "integrated_conformance_descendant",
          );
          expect(result.scopeEndpoint).toBe(
            lineage.finalConformance,
          );
          expect(result.scopePaths).not.toContain(
            "phase-5/feature.txt",
          );
          expect(result.scopePaths).not.toContain(
            "phase-5/later.txt",
          );
          expect(result.scopePaths).not.toContain(
            "docs/base-only-change.md",
          );
        }
      });
    });

    it("accepts the fixed integration parents in either order", () => {
      for (const parentOrder of [
        "base-first",
        "final-first",
      ] as const) {
        withTempGitRepository((repository) => {
          const lineage = createIntegratedConformanceLineage(
            repository,
            parentOrder,
          );
          const result = resolveConformanceExecutionEndpoint(
            repository.git,
            lineage.integrationMerge,
            lineage.conformance,
            lineage.repair,
            lineage.boundary,
          );

          expect(result.mode).toBe(
            "integrated_conformance_descendant",
          );
          expect(new Set(commitParents(
            repository.git,
            lineage.integrationMerge,
          ))).toEqual(
            new Set([
              lineage.integrationBase,
              lineage.finalConformance,
            ]),
          );
        });
      }
    });

    it("accepts future merges whose parents both inherit the integration boundary", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "future-base",
          lineage.integrationMerge,
        ]);
        repository.write("phase-5/base.txt", "future base\n");
        repository.commit("future base");
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "future-pr",
          lineage.integrationMerge,
        ]);
        repository.write("phase-5/pr.txt", "future pr\n");
        repository.commit("future pr");
        const futureMerge = createMerge(
          repository,
          "future-base",
          "future-pr",
        );

        const result = resolveConformanceScope(
          repository.git,
          futureMerge,
          lineage.conformance,
          lineage.repair,
          lineage.boundary,
        );

        expect(result.mode).toBe(
          "integrated_conformance_descendant",
        );
        expect(result.scopeEndpoint).toBe(
          lineage.finalConformance,
        );
        expect(result.scopePaths).not.toContain("phase-5/base.txt");
        expect(result.scopePaths).not.toContain("phase-5/pr.txt");
      });
    });

    it("accepts a future synthetic merge when both candidate parents inherit integration", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "synthetic-base",
          lineage.integrationMerge,
        ]);
        repository.write("phase-5/base-next.txt", "base next\n");
        repository.commit("base next");
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "synthetic-pr",
          lineage.integrationMerge,
        ]);
        repository.write("phase-5/pr-next.txt", "pr next\n");
        repository.commit("pr next");
        const syntheticHead = createMerge(
          repository,
          "synthetic-base",
          "synthetic-pr",
        );

        const result = resolveConformanceExecutionEndpoint(
          repository.git,
          syntheticHead,
          lineage.conformance,
          lineage.repair,
          lineage.boundary,
        );

        expect(result.mode).toBe(
          "integrated_conformance_descendant",
        );
        expect(result.scopeEndpoint).toBe(
          lineage.finalConformance,
        );
      });
    });

    it("rejects a missing or wrongly parented final conformance commit", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            lineage.integrationMerge,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              finalConformanceCommit:
                "0000000000000000000000000000000000000000",
            },
          ),
        ).toThrow("conformance_final_commit_missing");

        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "wrong-final",
          lineage.repair,
        ]);
        repository.write(targetTestPath, "wrong final\n");
        const wrongFinal = repository.commit("wrong final");

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            lineage.integrationMerge,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              finalConformanceCommit: wrongFinal,
            },
          ),
        ).toThrow("conformance_final_commit_parent_mismatch");
      });
    });

    it("rejects a missing integration commit and invalid integration parent counts", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            lineage.integrationMerge,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              integrationMergeCommit:
                "0000000000000000000000000000000000000000",
            },
          ),
        ).toThrow("conformance_integration_commit_missing");

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            lineage.integrationMerge,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              integrationMergeCommit: lineage.finalConformance,
            },
          ),
        ).toThrow("conformance_integration_parent_mismatch");

        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "third-parent",
          lineage.commonRoot,
        ]);
        repository.write("lineage/third.txt", "third\n");
        repository.commit("third");
        repository.git([
          "merge",
          "--quiet",
          "--no-ff",
          "-m",
          "three parent integration",
          "base",
          "pull-request",
        ]);
        const threeParentMerge = repository.git([
          "rev-parse",
          "HEAD",
        ]);

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            threeParentMerge,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              integrationMergeCommit: threeParentMerge,
            },
          ),
        ).toThrow("conformance_integration_parent_mismatch");
      });
    });

    it("rejects integration merges missing either fixed parent", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "unrelated",
          lineage.commonRoot,
        ]);
        repository.write("lineage/unrelated.txt", "unrelated\n");
        repository.commit("unrelated");
        const missingFinal = createMerge(
          repository,
          "base",
          "unrelated",
        );

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            missingFinal,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              integrationMergeCommit: missingFinal,
            },
          ),
        ).toThrow("conformance_integration_parent_mismatch");

        const missingBase = createMerge(
          repository,
          "pull-request",
          "unrelated",
        );

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            missingBase,
            lineage.conformance,
            lineage.repair,
            {
              ...lineage.boundary,
              integrationMergeCommit: missingBase,
            },
          ),
        ).toThrow("conformance_integration_parent_mismatch");
      });
    });

    it("does not enter integrated mode when the fixed integration commit is not an ancestor", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        const result = resolveConformanceExecutionEndpoint(
          repository.git,
          lineage.conformance,
          lineage.conformance,
          lineage.repair,
          lineage.boundary,
        );

        expect(result.mode).toBe("direct_conformance");
      });
    });

    it("still rejects pre-integration non-linear history when a valid integration boundary exists elsewhere", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "pre-left",
          lineage.conformance,
        ]);
        repository.write(targetTestPath, "pre-left\n");
        repository.commit("pre-left");
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "pre-right",
          lineage.conformance,
        ]);
        repository.write("lineage/pre-right.txt", "pre-right\n");
        repository.commit("pre-right");
        createMerge(repository, "pre-left", "pre-right");
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "pre-base",
          lineage.commonRoot,
        ]);
        repository.write("lineage/pre-base.txt", "pre-base\n");
        repository.commit("pre-base");
        const preIntegrationHead = createMerge(
          repository,
          "pre-base",
          "pre-left",
        );

        expect(() =>
          resolveConformanceExecutionEndpoint(
            repository.git,
            preIntegrationHead,
            lineage.conformance,
            lineage.repair,
            lineage.boundary,
          ),
        ).toThrow("conformance_history_non_linear");
      });
    });

    it("does not accept a same-tree forged commit as the fixed integration merge", () => {
      withTempGitRepository((repository) => {
        const lineage = createIntegratedConformanceLineage(repository);
        repository.git([
          "checkout",
          "--quiet",
          "-b",
          "forged",
          lineage.integrationBase,
        ]);
        repository.git([
          "merge",
          "--quiet",
          "--no-ff",
          "-m",
          "forged integration",
          "pull-request",
        ]);
        const forged = repository.git(["rev-parse", "HEAD"]);

        expect(forged).not.toBe(lineage.integrationMerge);
        expect(repository.git(["rev-parse", `${forged}^{tree}`])).toBe(
          repository.git([
            "rev-parse",
            `${lineage.integrationMerge}^{tree}`,
          ]),
        );

        const result = resolveConformanceExecutionEndpoint(
          repository.git,
          forged,
          lineage.conformance,
          lineage.repair,
          lineage.boundary,
        );

        expect(result.mode).not.toBe(
          "integrated_conformance_descendant",
        );
      });
    });

    it("rejects extra paths in the final conformance scope", () => {
      withTempGitRepository((repository) => {
        const lineage = createConformanceLineage(repository);
        repository.git(["checkout", "--quiet", "pull-request"]);
        repository.write(targetTestPath, "phase-4-6 repair\n");
        repository.write(
          "src/infrastructure/github/out-of-scope.ts",
          "out of scope\n",
        );
        const driftedFinal = repository.commit("final scope drift");
        const integrationBase = createBaseChange(repository);
        const integrationMerge = createMerge(
          repository,
          "base",
          "pull-request",
        );

        expect(() =>
          resolveConformanceScope(
            repository.git,
            integrationMerge,
            lineage.conformance,
            lineage.repair,
            {
              finalConformanceCommit: driftedFinal,
              integrationBaseCommit: integrationBase,
              integrationMergeCommit: integrationMerge,
            },
          ),
        ).toThrow("post_conformance_scope_mismatch");
      });
    });
  });
  },
);

describe("phase-4-4-remote-ci-conformance.v1", () => {
  it("archives the exposed Phase 4.2 development run without rewriting history", () => {
    const attemptText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      attemptStatusPath,
      attemptStatusBlob,
      attemptStatusFingerprint,
    ).text;
    const attempt = attemptStatusSchema.parse(
      JSON.parse(attemptText),
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
    const freezeText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      freezePayloadPath,
      freezePayloadBlob,
      freezePayloadFingerprint,
    ).text;
    const manifestText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      manifestPath,
      manifestBlob,
    ).text;
    const attemptText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      attemptStatusPath,
      attemptStatusBlob,
      attemptStatusFingerprint,
    ).text;
    const targetTestText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      targetTestPath,
      historicalTargetTestBlob,
      historicalTargetTestFingerprint,
    ).text;
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
    const freezeText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      freezePayloadPath,
      freezePayloadBlob,
      freezePayloadFingerprint,
    ).text;
    const freeze = freezePayloadSchema.parse(
      JSON.parse(freezeText),
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
    expect(git(["rev-parse", `${phase4ConformanceCommit}^`])).toBe(
      repairCommit,
    );
    expect(
      git(["show", "-s", "--format=%T", phase4ConformanceCommit]),
    ).toBe(phase4ConformanceTree);

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
    const freezeText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      freezePayloadPath,
      freezePayloadBlob,
      freezePayloadFingerprint,
    ).text;
    const freeze = freezePayloadSchema.parse(
      JSON.parse(freezeText),
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
    const freezeText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      freezePayloadPath,
      freezePayloadBlob,
      freezePayloadFingerprint,
    ).text;
    const freeze = freezePayloadSchema.parse(
      JSON.parse(freezeText),
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
    const freezeText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      freezePayloadPath,
      freezePayloadBlob,
      freezePayloadFingerprint,
    ).text;
    const manifestText = readHistoricalConformanceArtifact(
      runGit,
      phase4ConformanceCommit,
      manifestPath,
      manifestBlob,
    ).text;
    const freeze = freezePayloadSchema.parse(
      JSON.parse(freezeText),
    );
    const manifest = manifestSchema.parse(
      JSON.parse(manifestText),
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
