// @vitest-environment node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CompleteGitHubInstallationRegistration } from "@/application/github-installation/register-github-installation";
import { StartGitHubInstallation } from "@/application/github-installation/start-github-installation";
import {
  handleGitHubInstallationSetup,
  handleGitHubInstallationStart,
} from "@/infrastructure/github/github-installation-http";
import { SupabaseGitHubInstallationRepository } from "@/infrastructure/github/supabase-github-installation-repository";

const phase3Commit =
  "87c83c9c5466f9bb8353b49fa157f857d58d243c";
const phase3Tree =
  "2dbf975e4d6e185e5704ba64a38caef210d35038";
const archiveCommit =
  "0422ed53a7b9fb7f6733e9fb31b824fc22c0fd96";
const archiveTree =
  "96cef06f8c4043313449941a532bf531fdc83482";
const attemptStatusPath =
  "tests/fixtures/github-installation/phase-3-1-attempt-status.json";
const phase31ContractPath =
  "tests/fixtures/github-installation/phase-3-1-failure-contract.json";
const phase31FreezePath =
  "tests/fixtures/github-installation/phase-3-1-conformance-freeze.json";
const historicalFreezePath =
  "tests/fixtures/github-installation/phase-3-pre-run-freeze.json";
const fixturePath =
  "tests/fixtures/github-installation/phase-3-fixtures.json";
const contractPath =
  "tests/fixtures/github-installation/phase-3-2-failure-contract.json";
const freezePayloadPath =
  "tests/fixtures/github-installation/phase-3-2-conformance-freeze.json";
const freezeManifestPath =
  "tests/fixtures/github-installation/phase-3-2-conformance-freeze-manifest.json";
const targetTestPath =
  "src/application/github-installation/github-installation-failure-contract.test.ts";

const requiredInternalCodes = [
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

const actualInternalCodes = [
  "unauthenticated",
  "installation_state_generation_failed",
  "installation_state_persistence_failed",
  "installation_state_missing",
  "installation_state_invalid",
  "installation_state_expired",
  "installation_state_replayed",
  "installation_state_wrong_user",
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
  "current_github_identity_read_failed",
  "installation_account_mismatch",
  "github_installation_already_bound",
  "installation_persistence_failed",
  "github_installation_registration_failed",
] as const;

const sensitiveFields = [
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

const sensitiveMarkers = [
  "SYNTHETIC_RAW_STATE_DO_NOT_LOG",
  "SYNTHETIC_STATE_HASH_DO_NOT_LOG",
  "SYNTHETIC_PRIVATE_KEY_DO_NOT_LOG",
  "SYNTHETIC_APP_JWT_DO_NOT_LOG",
  "SYNTHETIC_AUTHORIZATION_DO_NOT_LOG",
  "SYNTHETIC_SESSION_COOKIE_DO_NOT_LOG",
  "SYNTHETIC_SERVICE_ROLE_DO_NOT_LOG",
  "SYNTHETIC_GITHUB_RESPONSE_DO_NOT_LOG",
  "SYNTHETIC_GITHUB_ERROR_BODY_DO_NOT_LOG",
] as const;
const validSyntheticState = "A".repeat(43);

const sourceFileAllowlist = [
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

const routeHandlerPaths = [
  "src/app/api/github/installations/start/route.ts",
  "src/app/api/github/installations/setup/route.ts",
  "src/infrastructure/github/github-installation-http.ts",
] as const;

const loggerPaths = [
  "src/app/api/github/installations/start/route.ts",
  "src/app/api/github/installations/setup/route.ts",
  "src/infrastructure/github/github-installation-http.ts",
] as const;

const nonContractErrorLiterals = ["invalid_key_type"] as const;

const expectedHandlerVariantKeys = [
  "unauthenticated|start|direct_route|unauthenticated|303|/auth/error",
  "unauthenticated|setup|direct_route|unauthenticated|303|/onboarding?installation=configuration_failed",
  "installation_state_generation_failed|start|http_adapter|installation_state_generation_failed|303|/auth/error",
  "installation_state_persistence_failed|start|http_adapter|installation_state_persistence_failed|303|/auth/error",
  "installation_state_missing|setup|http_adapter|installation_state_missing|303|/onboarding?installation=configuration_failed",
  "installation_state_invalid|setup|http_adapter|installation_state_invalid|303|/onboarding?installation=configuration_failed",
  "installation_state_expired|setup|http_adapter|installation_state_expired|303|/onboarding?installation=configuration_failed",
  "installation_state_replayed|setup|http_adapter|installation_state_replayed|303|/onboarding?installation=configuration_failed",
  "installation_state_wrong_user|setup|http_adapter|installation_state_wrong_user|303|/onboarding?installation=configuration_failed",
  "installation_id_invalid|setup|http_adapter|installation_id_invalid|303|/onboarding?installation=configuration_failed",
  "github_app_configuration_missing|start|http_adapter|github_app_configuration_missing|303|/auth/error",
  "github_app_configuration_missing|start|route_outer|github_app_configuration_missing|503|null",
  "github_app_configuration_missing|setup|http_adapter|github_app_configuration_missing|303|/onboarding?installation=configuration_failed",
  "github_app_configuration_missing|setup|route_outer|github_app_configuration_missing|503|null",
  "github_app_authentication_failed|setup|http_adapter|github_app_authentication_failed|303|/onboarding?installation=configuration_failed",
  "github_installation_not_found|setup|http_adapter|github_installation_not_found|303|/onboarding?installation=configuration_failed",
  "github_api_forbidden|setup|http_adapter|github_api_forbidden|303|/onboarding?installation=configuration_failed",
  "github_api_rate_limited|setup|http_adapter|github_api_rate_limited|303|/onboarding?installation=configuration_failed",
  "github_api_timeout|setup|http_adapter|github_api_timeout|303|/onboarding?installation=configuration_failed",
  "github_api_invalid_response|setup|http_adapter|github_api_invalid_response|303|/onboarding?installation=configuration_failed",
  "github_api_unavailable|setup|http_adapter|github_api_unavailable|303|/onboarding?installation=configuration_failed",
  "installation_app_mismatch|setup|http_adapter|installation_app_mismatch|303|/onboarding?installation=configuration_failed",
  "installation_id_mismatch|setup|http_adapter|installation_id_mismatch|303|/onboarding?installation=configuration_failed",
  "unsupported_installation_account_type|setup|http_adapter|unsupported_installation_account_type|303|/onboarding?installation=configuration_failed",
  "current_github_identity_missing|setup|http_adapter|current_github_identity_missing|303|/onboarding?installation=configuration_failed",
  "current_github_identity_read_failed|setup|http_adapter|github_installation_registration_failed|303|/onboarding?installation=configuration_failed",
  "installation_account_mismatch|setup|http_adapter|installation_account_mismatch|303|/onboarding?installation=configuration_failed",
  "github_installation_already_bound|setup|http_adapter|github_installation_already_bound|303|/onboarding?installation=configuration_failed",
  "installation_persistence_failed|setup|http_adapter|installation_persistence_failed|303|/onboarding?installation=configuration_failed",
  "github_installation_registration_failed|start|http_adapter|github_installation_registration_failed|303|/auth/error",
  "github_installation_registration_failed|setup|http_adapter|github_installation_registration_failed|303|/onboarding?installation=configuration_failed",
  "github_installation_registration_failed|start|route_outer|github_installation_registration_failed|503|null",
  "github_installation_registration_failed|setup|route_outer|github_installation_registration_failed|503|null",
] as const;

const categorySchema = z.enum([
  "authentication",
  "state",
  "configuration",
  "github_app_authentication",
  "github_api",
  "identity",
  "ownership",
  "persistence",
]);
const stageSchema = z.enum([
  "start",
  "setup",
  "state_create",
  "state_consume",
  "jwt_sign",
  "installation_read",
  "ownership_verify",
  "installation_store",
  "http_adapter",
  "route",
]);
const triStateSchema = z.enum(["yes", "no", "unknown"]);
const routeSchema = z.enum(["start", "setup"]);
const handlerStageSchema = z.enum([
  "direct_route",
  "http_adapter",
  "route_outer",
]);
const responseModeSchema = z.enum(["redirect", "http_error"]);

const publicMappingSchema = z.object({
  route: routeSchema,
  handlerStage: handlerStageSchema,
  publicCode: z.string().min(1),
  safePublicCode: z.string().min(1),
  responseMode: responseModeSchema,
  httpStatus: z.number().int(),
  redirectTarget: z.string().nullable(),
  queryCode: z.string().nullable(),
  responseBodyPolicy: z.enum(["empty", "safe_static"]),
  stateConsumed: triStateSchema,
  installationPersisted: triStateSchema,
  githubApiCalled: triStateSchema,
  loggerEvent: z.literal("github-installation-registration.v1"),
});

const entrySchema = z.object({
  internalCode: z.string().min(1),
  category: categorySchema,
  sourceErrorClass: z.string().min(1),
  sourceStage: stageSchema,
  sourceFile: z.string().min(1),
  reachable: z.boolean(),
  defensiveReason: z.string().nullable(),
  publicMappings: z.array(publicMappingSchema).min(1),
  retryable: z.boolean(),
  sensitiveFieldsForbidden: z
    .array(z.enum(sensitiveFields))
    .length(sensitiveFields.length),
  fixtureIds: z.array(z.string()),
  testPaths: z.array(z.string()).min(1),
});

const fixtureExpectedResultSchema = z.object({
  fixtureId: z.string().min(1),
  fixtureVersion: z.string().min(1),
  sourceType: z.string().min(1),
  containsRealSecret: z.boolean(),
  resultKind: z.enum(["success", "failure"]),
  publicCode: z.string().nullable(),
  successState: z.string().nullable(),
  expectedStorageResult: z.string().min(1),
});

const historicalMismatchSchema = z.object({
  fixtureId: z.string().min(1),
  historicalExpectedCode: z.string().min(1),
  actualPhase3Code: z.string().min(1),
  v2PublicCode: z.string().min(1),
  mismatchReason: z.string().min(1),
  historicalSourceArtifact: z.literal(fixturePath),
});

const contractSchema = z.object({
  contract_id: z.literal("github-installation-failure-contract.v2"),
  contract_version: z.literal("2.0.0"),
  schema_version: z.literal("installation-failure-contract-schema.v2"),
  base_phase_3_commit: z.literal(phase3Commit),
  base_phase_3_tree: z.literal(phase3Tree),
  dataset_kind: z.literal("engineering_regression_fixture"),
  exposure_status: z.literal("known_regression"),
  required_internal_codes: z.array(z.string()),
  actual_internal_codes: z.array(z.string()),
  entries: z.array(entrySchema).min(1),
  fixture_path: z.literal(fixturePath),
  fixture_blob: z.string().regex(/^[0-9a-f]{40}$/),
  fixture_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_expected_results: z.array(fixtureExpectedResultSchema).min(1),
  historical_attempt: z.object({
    status_path: z.literal(attemptStatusPath),
    attempt_id: z.literal(
      "phase-3-1-formal-conformance-20260724-001",
    ),
    attempt_status: z.literal("invalidated_conformance_attempt"),
  }),
  historical_mismatches: z.array(historicalMismatchSchema).length(5),
  source_file_allowlist: z.array(z.string()).min(1),
  route_handler_paths: z.array(z.string()).min(1),
  logger_paths: z.array(z.string()).min(1),
  non_contract_literals: z.array(
    z.object({
      literal: z.string(),
      sourceFile: z.string(),
      transformedTo: z.string(),
      reason: z.string(),
    }),
  ),
  sensitive_marker_set: z.array(z.enum(sensitiveMarkers)),
  sensitive_fields_forbidden: z.array(z.enum(sensitiveFields)),
  canonicalization_algorithm: z.object({
    version: z.literal("canonical-text-sha256.v1"),
    encoding: z.literal("UTF-8"),
    lineEndings: z.literal("CRLF/CR to LF"),
    trim: z.literal(false),
    jsonKeySorting: z.literal(false),
  }),
  recorded_at: z.iso.datetime({ offset: true }),
});

const freezePayloadSchema = z.object({
  freeze_id: z.literal("phase-3-2-installation-conformance.v2"),
  freeze_version: z.literal("2.0.0"),
  phase: z.literal("phase_3_2"),
  run_kind: z.literal("formal_conformance"),
  formal_run_id: z.literal(
    "phase-3-2-formal-conformance-20260724-001",
  ),
  production_base_commit: z.literal(phase3Commit),
  production_base_tree: z.literal(phase3Tree),
  archive_commit: z.literal(archiveCommit),
  archive_tree: z.literal(archiveTree),
  archive_attempt_status_path: z.literal(attemptStatusPath),
  archive_attempt_status_fingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/),
  failure_contract_path: z.literal(contractPath),
  failure_contract_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  failure_code_exact_set_fingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/),
  public_mapping_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  handler_variant_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_path: z.literal(fixturePath),
  fixture_blob: z.string().regex(/^[0-9a-f]{40}$/),
  fixture_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_mapping_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  target_test_path: z.literal(targetTestPath),
  target_test_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  source_allowlist: z.array(z.string()).min(1),
  route_handler_paths: z.array(z.string()).min(1),
  logger_paths: z.array(z.string()).min(1),
  formal_run_command: z.string().min(1),
  test_frozen: z.literal(true),
  exposure_status: z.literal("known_regression"),
  holdout_eligibility: z.literal("not_applicable"),
  eval_dataset_status: z.literal("not_applicable"),
  production_code_mutation_allowed: z.literal(false),
  contains_real_secret: z.literal(false),
  real_github_called: z.literal(false),
  real_installation_used: z.literal(false),
  recorded_at: z.iso.datetime({ offset: true }),
});

const freezeManifestSchema = z.object({
  manifest_id: z.literal("phase-3-2-installation-conformance-manifest.v1"),
  manifest_version: z.literal("1.0.0"),
  freeze_payload_path: z.literal(freezePayloadPath),
  freeze_payload_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  archive_attempt_status_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  failure_contract_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  failure_code_exact_set_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  public_mapping_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  handler_variant_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  fixture_mapping_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  target_test_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  expected_parent_commit: z.literal(archiveCommit),
  formal_run_command: z.string().min(1),
  created_before_formal_run: z.literal(true),
  canonicalization_algorithm_version: z.literal(
    "canonical-text-sha256.v1",
  ),
  recorded_at: z.iso.datetime({ offset: true }),
});

const originalFixtureSchema = z.object({
  fixture_id: z.string(),
  fixture_version: z.string(),
  source_type: z.string(),
  expected_verification_result: z.string(),
  expected_storage_result: z.string(),
  contains_real_secret: z.boolean(),
});

type Contract = z.infer<typeof contractSchema>;
type PublicMapping = z.infer<typeof publicMappingSchema>;

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

function loadFrozenArtifacts() {
  return {
    contract: contractSchema.parse(readJson(contractPath)),
    payload: freezePayloadSchema.parse(readJson(freezePayloadPath)),
    manifest: freezeManifestSchema.parse(readJson(freezeManifestPath)),
  };
}

function exactSetFingerprint(codes: readonly string[]) {
  return sha256Text(JSON.stringify(codes));
}

function publicMappingProjection(contract: Contract) {
  return contract.entries.flatMap((entry) =>
    entry.publicMappings.map((mapping) => ({
      internalCode: entry.internalCode,
      publicCode: mapping.publicCode,
      safePublicCode: mapping.safePublicCode,
      retryable: entry.retryable,
    })),
  );
}

function handlerVariantProjection(contract: Contract) {
  return contract.entries.flatMap((entry) =>
    entry.publicMappings.map((mapping) => ({
      internalCode: entry.internalCode,
      route: mapping.route,
      handlerStage: mapping.handlerStage,
      publicCode: mapping.publicCode,
      responseMode: mapping.responseMode,
      httpStatus: mapping.httpStatus,
      redirectTarget: mapping.redirectTarget,
      queryCode: mapping.queryCode,
      responseBodyPolicy: mapping.responseBodyPolicy,
      stateConsumed: mapping.stateConsumed,
      installationPersisted: mapping.installationPersisted,
      githubApiCalled: mapping.githubApiCalled,
      loggerEvent: mapping.loggerEvent,
    })),
  );
}

function fixtureMappingFingerprint(contract: Contract) {
  return sha256Text(JSON.stringify(contract.fixture_expected_results));
}

type ExtractedCode = {
  code: string;
  sourceFile: string;
  line: number;
  nodeKind: string;
  extractionRule:
    | "stableFailureCodes"
    | "failureCodeFallback"
    | "identityRepositoryFailure";
};

function sourceLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function extractExactLiteralSourceFiles() {
  const sources = new Map<string, Set<string>>();
  const unexpectedErrorLiterals: string[] = [];

  for (const relativePath of sourceFileAllowlist) {
    const sourceFile = ts.createSourceFile(
      relativePath,
      readUtf8(relativePath),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    function visit(node: ts.Node) {
      if (
        ts.isStringLiteral(node) &&
        actualInternalCodes.includes(
          node.text as (typeof actualInternalCodes)[number],
        )
      ) {
        const paths = sources.get(node.text) ?? new Set<string>();
        paths.add(relativePath);
        sources.set(node.text, paths);
      }

      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "Error"
      ) {
        const argument = node.arguments?.[0];
        if (
          argument &&
          ts.isStringLiteral(argument) &&
          !actualInternalCodes.includes(
            argument.text as (typeof actualInternalCodes)[number],
          ) &&
          !nonContractErrorLiterals.includes(
            argument.text as (typeof nonContractErrorLiterals)[number],
          )
        ) {
          unexpectedErrorLiterals.push(
            `${relativePath}:${sourceLine(sourceFile, argument)}:${argument.text}`,
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  if (unexpectedErrorLiterals.length > 0) {
    throw new Error(
      `Unclassified exact Error literals: ${unexpectedErrorLiterals.join(", ")}`,
    );
  }

  return sources;
}

function handlerVariantKey(
  internalCode: string,
  mapping: PublicMapping,
) {
  return [
    internalCode,
    mapping.route,
    mapping.handlerStage,
    mapping.publicCode,
    mapping.httpStatus,
    mapping.redirectTarget ?? "null",
  ].join("|");
}

function extractImplementationExactCodes(): ExtractedCode[] {
  const extracted: ExtractedCode[] = [];
  const httpPath =
    "src/infrastructure/github/github-installation-http.ts";
  const repositoryPath =
    "src/infrastructure/github/supabase-github-installation-repository.ts";

  for (const relativePath of [httpPath, repositoryPath]) {
    const sourceFile = ts.createSourceFile(
      relativePath,
      readUtf8(relativePath),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    function visit(node: ts.Node) {
      if (
        relativePath === httpPath &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "stableFailureCodes" &&
        node.initializer &&
        ts.isNewExpression(node.initializer)
      ) {
        const array = node.initializer.arguments?.[0];

        if (!array || !ts.isArrayLiteralExpression(array)) {
          throw new Error("stableFailureCodes must be a literal array");
        }
        for (const element of array.elements) {
          if (!ts.isStringLiteral(element)) {
            throw new Error("stableFailureCodes must contain string literals");
          }
          extracted.push({
            code: element.text,
            sourceFile: relativePath,
            line: sourceLine(sourceFile, element),
            nodeKind: ts.SyntaxKind[element.kind],
            extractionRule: "stableFailureCodes",
          });
        }
      }

      if (
        relativePath === httpPath &&
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "failureCode" &&
        node.body
      ) {
        for (const statement of node.body.statements) {
          if (
            ts.isReturnStatement(statement) &&
            statement.expression &&
            ts.isStringLiteral(statement.expression)
          ) {
            extracted.push({
              code: statement.expression.text,
              sourceFile: relativePath,
              line: sourceLine(sourceFile, statement.expression),
              nodeKind: ts.SyntaxKind[statement.expression.kind],
              extractionRule: "failureCodeFallback",
            });
          }
        }
      }

      if (
        relativePath === repositoryPath &&
        ts.isThrowStatement(node) &&
        node.expression &&
        ts.isNewExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "Error"
      ) {
        const argument = node.expression.arguments?.[0];

        if (
          argument &&
          ts.isStringLiteral(argument) &&
          argument.text === "current_github_identity_read_failed"
        ) {
          extracted.push({
            code: argument.text,
            sourceFile: relativePath,
            line: sourceLine(sourceFile, argument),
            nodeKind: ts.SyntaxKind[argument.kind],
            extractionRule: "identityRepositoryFailure",
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  const byCode = new Map<string, ExtractedCode>();
  for (const item of extracted) {
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }

  const unknownCodes = [...byCode.keys()].filter(
    (code) => !actualInternalCodes.includes(code as (typeof actualInternalCodes)[number]),
  );
  if (unknownCodes.length > 0) {
    throw new Error(
      `Implementation exposes unexpected failure codes: ${unknownCodes.join(", ")}`,
    );
  }

  return actualInternalCodes.map((code) => {
    const item = byCode.get(code);
    if (!item) {
      throw new Error(`Implementation is missing exact failure code: ${code}`);
    }
    return item;
  });
}

function normalizedLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) return null;
  const url = new URL(location, "https://executor.example.test");
  return `${url.pathname}${url.search}`;
}

async function executeAdapterMapping(
  internalCode: string,
  mapping: PublicMapping,
) {
  const failures: string[] = [];
  const execute = async () => {
    throw new Error(internalCode);
  };
  const response =
    mapping.route === "start"
      ? await handleGitHubInstallationStart({
          request: new Request(
            "https://executor.example.test/api/github/installations/start",
          ),
          trustedOrigin: "https://executor.example.test",
          execute,
          onFailure: (code) => failures.push(code),
        })
      : await handleGitHubInstallationSetup({
          request: new Request(
            `https://executor.example.test/api/github/installations/setup?state=${sensitiveMarkers[0]}&installation_id=81001`,
          ),
          trustedOrigin: "https://executor.example.test",
          execute,
          onFailure: (code) => failures.push(code),
        });

  return {
    response,
    publicCode: failures[0] ?? null,
  };
}

const routeMockPaths = [
  "next/headers",
  "@/infrastructure/auth/supabase-server-client",
  "@/infrastructure/auth/supabase-verified-session-reader",
  "@/shared/configuration/server-environment",
  "@/application/github-installation/start-github-installation",
  "@/application/github-installation/register-github-installation",
  "@/infrastructure/github/supabase-github-installation-repository",
  "@/infrastructure/github/github-app-jwt",
  "@/infrastructure/github/github-app-installation-reader",
] as const;

type RouteScenario = {
  route: "start" | "setup";
  internalCode: string;
  handlerStage: "direct_route" | "http_adapter" | "route_outer";
};

async function executeRealRouteScenario(scenario: RouteScenario) {
  vi.resetModules();
  const logs: string[] = [];
  const warn = vi
    .spyOn(console, "warn")
    .mockImplementation((value) => logs.push(String(value)));
  const markerText = sensitiveMarkers.join("|");
  const userId =
    scenario.handlerStage === "direct_route"
      ? null
      : "11111111-1111-4111-8111-111111111111";

  vi.doMock("next/headers", () => ({
    cookies: async () => ({
      getAll: () => [
        { name: "session", value: sensitiveMarkers[5] },
      ],
      set: vi.fn(),
    }),
  }));
  vi.doMock(
    "@/infrastructure/auth/supabase-server-client",
    () => ({
      createSupabaseServerClient: () => {
        if (
          scenario.handlerStage === "route_outer" &&
          scenario.internalCode ===
            "github_installation_registration_failed"
        ) {
          throw new Error(markerText);
        }
        return {};
      },
    }),
  );
  vi.doMock(
    "@/infrastructure/auth/supabase-verified-session-reader",
    () => ({
      SupabaseVerifiedSessionReader: class {
        async getVerifiedUserId() {
          return userId;
        }
      },
    }),
  );
  vi.doMock("@/shared/configuration/server-environment", () => ({
    parseServerEnvironment: () => {
      if (
        scenario.handlerStage === "route_outer" &&
        scenario.internalCode === "github_app_configuration_missing"
      ) {
        throw new Error(markerText);
      }
      return {
        APP_ORIGIN: "https://executor.example.test",
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: sensitiveMarkers[6],
        GITHUB_APP_ID: "81001",
        GITHUB_APP_SLUG: "executor-fixture-app",
        GITHUB_APP_PRIVATE_KEY: sensitiveMarkers[2],
        GITHUB_REST_API_VERSION: "2026-03-10",
      };
    },
  }));
  vi.doMock(
    "@/application/github-installation/start-github-installation",
    () => ({
      StartGitHubInstallation: class {
        async execute() {
          throw new Error(scenario.internalCode);
        }
      },
    }),
  );
  vi.doMock(
    "@/application/github-installation/register-github-installation",
    () => ({
      CompleteGitHubInstallationRegistration: class {
        async execute(input: { rawState: string | null }) {
          if (input.rawState !== sensitiveMarkers[0]) {
            throw new Error("synthetic_marker_not_propagated");
          }
          throw new Error(scenario.internalCode);
        }
      },
    }),
  );
  vi.doMock(
    "@/infrastructure/github/supabase-github-installation-repository",
    () => ({
      SupabaseGitHubInstallationRepository: class {},
    }),
  );
  vi.doMock("@/infrastructure/github/github-app-jwt", () => ({
    GitHubAppJwtSigner: class {},
  }));
  vi.doMock(
    "@/infrastructure/github/github-app-installation-reader",
    () => ({
      GitHubAppInstallationReaderAdapter: class {},
    }),
  );

  const query = new URLSearchParams({
    state: sensitiveMarkers[0],
    installation_id: "81001",
    state_hash: sensitiveMarkers[1],
    github_response: sensitiveMarkers[7],
    github_error_body: sensitiveMarkers[8],
    returnTo: `/onboarding?marker=${sensitiveMarkers[0]}`,
  });
  const request = new Request(
    `https://executor.example.test/api/github/installations/${scenario.route}?${query.toString()}`,
    {
      headers: {
        authorization: sensitiveMarkers[4],
        cookie: `session=${sensitiveMarkers[5]}`,
        "x-synthetic-app-jwt": sensitiveMarkers[3],
      },
    },
  );

  try {
    const routeModule =
      scenario.route === "start"
        ? await import("@/app/api/github/installations/start/route")
        : await import("@/app/api/github/installations/setup/route");
    const response = await routeModule.GET(request);
    const body = await response.text();
    const parsedLogs = logs.map((line) => JSON.parse(line) as {
      contract_version: string;
      stage: string;
      failure_code: string;
    });

    return {
      response,
      body,
      location: normalizedLocation(response),
      logs,
      parsedLogs,
    };
  } finally {
    warn.mockRestore();
    for (const mockPath of routeMockPaths) vi.doUnmock(mockPath);
    vi.resetModules();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("github-installation-failure-contract.v2", () => {
  it("requires the V2 Contract, Freeze Payload, and Freeze Manifest schemas", () => {
    expect(() => loadFrozenArtifacts()).not.toThrow();
  });

  it("preserves and invalidates the complete Phase 3.1 attempt", () => {
    const attempt = readJson(attemptStatusPath) as {
      attempt_status: string;
      formal_conformance_eligible: boolean;
      failure_contract_blob: string;
      conformance_freeze_blob: string;
      contract_test_blob: string;
      invalidation_findings: { finding_id: string }[];
    };

    expect(attempt.attempt_status).toBe(
      "invalidated_conformance_attempt",
    );
    expect(attempt.formal_conformance_eligible).toBe(false);
    expect(
      attempt.invalidation_findings.map((item) => item.finding_id),
    ).toEqual([
      "P3-CONF-01",
      "P3-CONF-02",
      "P3-CONF-03",
      "P3-CONF-04",
      "P3-CONF-05",
    ]);
    expect(git(["rev-parse", `${archiveCommit}:${phase31ContractPath}`])).toBe(
      attempt.failure_contract_blob,
    );
    expect(git(["rev-parse", `${archiveCommit}:${phase31FreezePath}`])).toBe(
      attempt.conformance_freeze_blob,
    );
    expect(git(["rev-parse", `${archiveCommit}:${targetTestPath}`])).toBe(
      attempt.contract_test_blob,
    );
  });

  it("extracts the exact implementation code set through named AST constructs", () => {
    const { contract } = loadFrozenArtifacts();
    const extracted = extractImplementationExactCodes();
    const codes = extracted.map((item) => item.code);
    const literalSources = extractExactLiteralSourceFiles();

    expect(codes).toEqual(actualInternalCodes);
    expect([...literalSources.keys()].sort()).toEqual(
      [...actualInternalCodes].sort(),
    );
    expect(contract.required_internal_codes).toEqual(
      requiredInternalCodes,
    );
    expect(contract.actual_internal_codes).toEqual(codes);
    expect(contract.entries.map((entry) => entry.internalCode)).toEqual(
      codes,
    );
    expect(new Set(codes).size).toBe(codes.length);
    expect(
      extracted.every((item) =>
        [
          "stableFailureCodes",
          "failureCodeFallback",
          "identityRepositoryFailure",
        ].includes(item.extractionRule),
      ),
    ).toBe(true);
    expect(extracted.every((item) => item.nodeKind === "StringLiteral")).toBe(
      true,
    );
  });

  it("binds every exact AST code to its source and an existing behavior test", () => {
    const { contract } = loadFrozenArtifacts();
    const extracted = new Map(
      extractImplementationExactCodes().map((item) => [item.code, item]),
    );
    const literalSources = extractExactLiteralSourceFiles();

    for (const entry of contract.entries) {
      const source = extracted.get(entry.internalCode);
      expect(source).toBeDefined();
      expect(sourceFileAllowlist).toContain(entry.sourceFile);
      expect([...literalSources.get(entry.internalCode)!]).toContain(
        entry.sourceFile,
      );
      expect(readUtf8(entry.sourceFile)).toContain(
        `"${entry.internalCode}"`,
      );
      for (const testPath of entry.testPaths) {
        expect(readUtf8(testPath)).toContain(
          `"${entry.internalCode}"`,
        );
      }
      expect(entry.reachable).toBe(true);
      expect(entry.defensiveReason).toBeNull();
    }
  });

  it("derives the original Fixture set and reconciles Contract mappings bidirectionally", () => {
    const { contract } = loadFrozenArtifacts();
    const fixtures = z
      .array(originalFixtureSchema)
      .parse(readJson(fixturePath));
    const fixtureIds = fixtures.map((fixture) => fixture.fixture_id);
    const mappingIds = contract.fixture_expected_results.map(
      (mapping) => mapping.fixtureId,
    );

    expect(new Set(fixtureIds).size).toBe(fixtures.length);
    expect(new Set(mappingIds).size).toBe(mappingIds.length);
    expect(mappingIds).toEqual(fixtureIds);
    expect(fixtureIds.filter((id) => !mappingIds.includes(id))).toEqual(
      [],
    );
    expect(mappingIds.filter((id) => !fixtureIds.includes(id))).toEqual(
      [],
    );

    for (const fixture of fixtures) {
      const mapping = contract.fixture_expected_results.find(
        (item) => item.fixtureId === fixture.fixture_id,
      )!;
      expect(mapping.fixtureVersion).toBe(fixture.fixture_version);
      expect(mapping.sourceType).toBe(fixture.source_type);
      expect(mapping.containsRealSecret).toBe(
        fixture.contains_real_secret,
      );
      expect(mapping.expectedStorageResult).toBe(
        fixture.expected_storage_result,
      );
      if (fixture.expected_verification_result === "success") {
        expect(mapping.resultKind).toBe("success");
        expect(mapping.publicCode).toBeNull();
        expect(mapping.successState).not.toBeNull();
      } else {
        expect(mapping.resultKind).toBe("failure");
        expect(mapping.publicCode).not.toBeNull();
        expect(mapping.successState).toBeNull();
      }
    }
  });

  it("keeps historical mismatches as evidence and excludes their legacy values from V2 truth", () => {
    const { contract } = loadFrozenArtifacts();
    const allowedCodes = new Set(contract.actual_internal_codes);

    expect(contract.historical_mismatches).toHaveLength(5);
    for (const mismatch of contract.historical_mismatches) {
      expect(mismatch.historicalExpectedCode).not.toBe(
        mismatch.v2PublicCode,
      );
      expect(mismatch.actualPhase3Code).toBe(mismatch.v2PublicCode);
      expect(allowedCodes.has(mismatch.historicalExpectedCode)).toBe(
        false,
      );
    }
  });

  it("binds every failed Fixture once and every successful Fixture to an explicit state", () => {
    const { contract } = loadFrozenArtifacts();

    for (const mapping of contract.fixture_expected_results) {
      const boundEntries = contract.entries.filter((entry) =>
        entry.fixtureIds.includes(mapping.fixtureId),
      );
      if (mapping.resultKind === "success") {
        expect(boundEntries).toHaveLength(0);
        expect(mapping.successState).not.toBeNull();
      } else {
        expect(boundEntries).toHaveLength(1);
        expect(
          boundEntries[0]!.publicMappings.some(
            (variant) => variant.publicCode === mapping.publicCode,
          ),
        ).toBe(true);
      }
    }
  });

  it("executes every HTTP adapter variant against the real adapter", async () => {
    const { contract } = loadFrozenArtifacts();
    expect(
      contract.entries.flatMap((entry) =>
        entry.publicMappings.map((mapping) =>
          handlerVariantKey(entry.internalCode, mapping),
        ),
      ),
    ).toEqual(expectedHandlerVariantKeys);
    const adapterVariants = contract.entries.flatMap((entry) =>
      entry.publicMappings
        .filter((mapping) => mapping.handlerStage === "http_adapter")
        .map((mapping) => ({
          internalCode: entry.internalCode,
          mapping,
        })),
    );

    for (const { internalCode, mapping } of adapterVariants) {
      const result = await executeAdapterMapping(internalCode, mapping);
      expect(result.response.status).toBe(mapping.httpStatus);
      expect(normalizedLocation(result.response)).toBe(
        mapping.redirectTarget,
      );
      expect(result.publicCode).toBe(mapping.publicCode);
      expect(await result.response.text()).toBe("");
    }
  });

  it("executes every direct and outer Route variant against the real Route", async () => {
    const { contract } = loadFrozenArtifacts();
    const routeVariants = contract.entries.flatMap((entry) =>
      entry.publicMappings
        .filter((mapping) => mapping.handlerStage !== "http_adapter")
        .map((mapping) => ({
          internalCode: entry.internalCode,
          mapping,
        })),
    );

    for (const { internalCode, mapping } of routeVariants) {
      const result = await executeRealRouteScenario({
        route: mapping.route,
        internalCode,
        handlerStage: mapping.handlerStage,
      });

      expect(result.response.status).toBe(mapping.httpStatus);
      expect(result.location).toBe(mapping.redirectTarget);
      expect(result.parsedLogs).toHaveLength(1);
      expect(result.parsedLogs[0]!.failure_code).toBe(
        mapping.publicCode,
      );
      expect(result.parsedLogs[0]!.contract_version).toBe(
        mapping.loggerEvent,
      );
      expect(result.body === "").toBe(
        mapping.responseBodyPolicy === "empty",
      );
    }
  });

  it("proves the real current identity read failure conversion chain", async () => {
    const { contract } = loadFrozenArtifacts();
    const repository = new SupabaseGitHubInstallationRepository({
      supabaseUrl: "https://supabase.example.test",
      serviceRoleKey: sensitiveMarkers[6],
      fetcher: async () =>
        new Response(JSON.stringify({ message: "synthetic failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    });
    const useCase = new CompleteGitHubInstallationRegistration({
      stateRepository: {
        create: vi.fn(),
        consume: async () => ({ returnTo: "/onboarding" }),
      },
      installationReader: {
        getInstallation: async () => ({
          installationId: 81001,
          appId: 81002,
          accountId: 81003,
          accountLogin: "fixture-user",
          accountType: "User",
          repositorySelection: "selected",
          suspendedAt: null,
        }),
      },
      identityReader: repository,
      installationRepository: {
        registerVerified: vi.fn(),
      },
      configuredAppId: "81002",
      clock: { now: () => new Date("2026-07-24T00:00:00.000Z") },
    });
    const publicCodes: string[] = [];
    const response = await handleGitHubInstallationSetup({
      request: new Request(
        `https://executor.example.test/api/github/installations/setup?state=${validSyntheticState}&installation_id=81001`,
      ),
      trustedOrigin: "https://executor.example.test",
      execute: (input) =>
        useCase.execute({
          ...input,
          userId: "11111111-1111-4111-8111-111111111111",
        }),
      onFailure: (code) => publicCodes.push(code),
    });
    const entry = contract.entries.find(
      (item) =>
        item.internalCode === "current_github_identity_read_failed",
    )!;
    const mapping = entry.publicMappings.find(
      (item) => item.handlerStage === "http_adapter",
    )!;

    expect(publicCodes).toEqual(["github_installation_registration_failed"]);
    expect(response.status).toBe(303);
    expect(normalizedLocation(response)).toBe(
      "/onboarding?installation=configuration_failed",
    );
    expect(mapping.publicCode).toBe(publicCodes[0]);
    expect(mapping.httpStatus).toBe(response.status);
    expect(mapping.redirectTarget).toBe(normalizedLocation(response));
  });

  it("proves all handler variants for GitHub App configuration failures", async () => {
    const { contract } = loadFrozenArtifacts();
    const entry = contract.entries.find(
      (item) => item.internalCode === "github_app_configuration_missing",
    )!;
    const publicCodes: string[] = [];
    const startUseCase = new StartGitHubInstallation({
      sessionReader: {
        getVerifiedUserId: async () =>
          "11111111-1111-4111-8111-111111111111",
      },
      stateRepository: {
        create: vi.fn(),
        consume: vi.fn(),
      },
      configuredAppSlug: "INVALID-SLUG",
    });
    const startResponse = await handleGitHubInstallationStart({
      request: new Request(
        "https://executor.example.test/api/github/installations/start",
      ),
      trustedOrigin: "https://executor.example.test",
      execute: (input) => startUseCase.execute(input),
      onFailure: (code) => publicCodes.push(code),
    });
    const setupUseCase = new CompleteGitHubInstallationRegistration({
      stateRepository: {
        create: vi.fn(),
        consume: async () => ({ returnTo: "/onboarding" }),
      },
      installationReader: {
        getInstallation: async () => ({
          installationId: 81001,
          appId: 81002,
          accountId: 81003,
          accountLogin: "fixture-user",
          accountType: "User",
          repositorySelection: "selected",
          suspendedAt: null,
        }),
      },
      identityReader: { findByUserId: vi.fn() },
      installationRepository: { registerVerified: vi.fn() },
      configuredAppId: "0",
      clock: { now: () => new Date("2026-07-24T00:00:00.000Z") },
    });
    const setupResponse = await handleGitHubInstallationSetup({
      request: new Request(
        `https://executor.example.test/api/github/installations/setup?state=${validSyntheticState}&installation_id=81001`,
      ),
      trustedOrigin: "https://executor.example.test",
      execute: (input) =>
        setupUseCase.execute({
          ...input,
          userId: "11111111-1111-4111-8111-111111111111",
        }),
      onFailure: (code) => publicCodes.push(code),
    });

    expect(publicCodes).toEqual([
      "github_app_configuration_missing",
      "github_app_configuration_missing",
    ]);
    expect(startResponse.status).toBe(303);
    expect(normalizedLocation(startResponse)).toBe("/auth/error");
    expect(setupResponse.status).toBe(303);
    expect(normalizedLocation(setupResponse)).toBe(
      "/onboarding?installation=configuration_failed",
    );
    expect(
      entry.publicMappings.map((mapping) => [
        mapping.route,
        mapping.handlerStage,
        mapping.httpStatus,
        mapping.redirectTarget,
      ]),
    ).toEqual([
      ["start", "http_adapter", 303, "/auth/error"],
      ["start", "route_outer", 503, null],
      [
        "setup",
        "http_adapter",
        303,
        "/onboarding?installation=configuration_failed",
      ],
      ["setup", "route_outer", 503, null],
    ]);
  });

  it("drives all sensitive markers through real Route and logger boundaries with zero disclosure", async () => {
    const scenarios: RouteScenario[] = [
      {
        route: "start",
        internalCode: "github_app_configuration_missing",
        handlerStage: "route_outer",
      },
      {
        route: "setup",
        internalCode: "installation_state_invalid",
        handlerStage: "http_adapter",
      },
      {
        route: "setup",
        internalCode: "github_api_unavailable",
        handlerStage: "http_adapter",
      },
      {
        route: "setup",
        internalCode: "current_github_identity_read_failed",
        handlerStage: "http_adapter",
      },
      {
        route: "setup",
        internalCode: "installation_persistence_failed",
        handlerStage: "http_adapter",
      },
      {
        route: "setup",
        internalCode: "github_installation_registration_failed",
        handlerStage: "http_adapter",
      },
    ];
    const observableValues: string[] = [];

    for (const scenario of scenarios) {
      const result = await executeRealRouteScenario(scenario);
      observableValues.push(
        ...result.logs,
        result.location ?? "",
        result.body,
      );
    }
    const observable = observableValues.join("\n");

    for (const marker of sensitiveMarkers) {
      expect(observable).not.toContain(marker);
    }
  });

  it("freezes the complete sensitive field and marker sets for every entry", () => {
    const { contract } = loadFrozenArtifacts();

    expect(contract.source_file_allowlist).toEqual(sourceFileAllowlist);
    expect(contract.route_handler_paths).toEqual(routeHandlerPaths);
    expect(contract.logger_paths).toEqual(loggerPaths);
    expect(contract.sensitive_marker_set).toEqual(sensitiveMarkers);
    expect(contract.sensitive_fields_forbidden).toEqual(sensitiveFields);
    for (const entry of contract.entries) {
      expect(entry.sensitiveFieldsForbidden).toEqual(sensitiveFields);
      expect(entry.publicMappings.length).toBeGreaterThan(0);
      expect(
        entry.publicMappings.every(
          (mapping) =>
            mapping.loggerEvent ===
            "github-installation-registration.v1",
        ),
      ).toBe(true);
    }
  });

  it("matches every pre-formal fingerprint in the Payload and Manifest", () => {
    const { contract, payload, manifest } = loadFrozenArtifacts();
    const contractHash = sha256Text(readUtf8(contractPath));
    const payloadHash = sha256Text(readUtf8(freezePayloadPath));
    const attemptHash = sha256Text(readUtf8(attemptStatusPath));
    const fixtureHash = sha256Text(readUtf8(fixturePath));
    const testHash = sha256Text(readUtf8(targetTestPath));
    const exactHash = exactSetFingerprint(
      contract.actual_internal_codes,
    );
    const publicHash = sha256Text(
      JSON.stringify(publicMappingProjection(contract)),
    );
    const handlerHash = sha256Text(
      JSON.stringify(handlerVariantProjection(contract)),
    );
    const mappingHash = fixtureMappingFingerprint(contract);

    expect(payload.failure_contract_fingerprint).toBe(contractHash);
    expect(payload.archive_attempt_status_fingerprint).toBe(attemptHash);
    expect(payload.failure_code_exact_set_fingerprint).toBe(exactHash);
    expect(payload.public_mapping_fingerprint).toBe(publicHash);
    expect(payload.handler_variant_fingerprint).toBe(handlerHash);
    expect(payload.fixture_fingerprint).toBe(fixtureHash);
    expect(payload.fixture_mapping_fingerprint).toBe(mappingHash);
    expect(payload.target_test_fingerprint).toBe(testHash);
    expect(manifest.freeze_payload_sha256).toBe(payloadHash);
    expect(manifest.archive_attempt_status_sha256).toBe(attemptHash);
    expect(manifest.failure_contract_sha256).toBe(contractHash);
    expect(manifest.failure_code_exact_set_sha256).toBe(exactHash);
    expect(manifest.public_mapping_sha256).toBe(publicHash);
    expect(manifest.handler_variant_sha256).toBe(handlerHash);
    expect(manifest.fixture_sha256).toBe(fixtureHash);
    expect(manifest.fixture_mapping_sha256).toBe(mappingHash);
    expect(manifest.target_test_sha256).toBe(testHash);
    expect(manifest.formal_run_command).toBe(
      payload.formal_run_command,
    );
  });

  it("preserves the original Fixture, historical Freeze, and Phase 3 production tree", () => {
    const { contract, payload } = loadFrozenArtifacts();

    expect(git(["rev-parse", `${phase3Commit}:${fixturePath}`])).toBe(
      contract.fixture_blob,
    );
    expect(git(["hash-object", fixturePath])).toBe(contract.fixture_blob);
    expect(
      git(["hash-object", historicalFreezePath]),
    ).toBe("09a61bb4da2aae37f9f5cec6c466b646403f3920");
    expect(git(["show", "-s", "--format=%T", phase3Commit])).toBe(
      phase3Tree,
    );
    expect(payload.production_code_mutation_allowed).toBe(false);

    const allowed = new Set([
      phase31ContractPath,
      phase31FreezePath,
      attemptStatusPath,
      targetTestPath,
      contractPath,
      freezePayloadPath,
      freezeManifestPath,
    ]);
    const changed = git(["diff", "--name-only", phase3Commit, "--"])
      .split(/\r?\n/)
      .filter(Boolean)
      .map((item) => item.replace(/\\/g, "/"));

    expect(changed.filter((item) => !allowed.has(item))).toEqual([]);
  });

  it("enforces the immutable commit boundary during the formal run", () => {
    if (process.env.PHASE_3_2_RUN_KIND !== "formal_conformance") return;

    const { payload, manifest } = loadFrozenArtifacts();

    expect(git(["status", "--short"])).toBe("");
    expect(git(["rev-parse", "HEAD^"])).toBe(
      manifest.expected_parent_commit,
    );
    expect(git(["rev-parse", "HEAD^"])).toBe(payload.archive_commit);
    expect(git(["show", "-s", "--format=%T", payload.archive_commit])).toBe(
      payload.archive_tree,
    );
    expect(manifest.created_before_formal_run).toBe(true);
    expect(payload.run_kind).toBe("formal_conformance");
  });
});
