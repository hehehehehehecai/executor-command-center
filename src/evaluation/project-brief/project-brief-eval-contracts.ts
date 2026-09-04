import {
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
} from "@/domain/project-brief/project-brief-contract";
import { evidenceSourceKinds } from "@/domain/project-brief-evidence/evidence-snapshot";
import { z } from "zod";
import { fingerprintEvalValue } from "./project-brief-eval-fingerprint";

export const projectBriefEvalCaseContractVersion = "project-brief-eval-case.v1" as const;
export const projectBriefEvalManifestContractVersion = "project-brief-eval-manifest.v1" as const;
export const projectBriefEvalResultContractVersion = "project-brief-eval-result.v1" as const;

export const projectBriefEvalCheckStatuses = [
  "pass", "fail", "blocked", "not_applicable",
] as const;
export const projectBriefEvalCaseTypes = [
  "synthetic_contract", "human_confirmed_historical",
] as const;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const identifierSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
const requiredText = z.string().min(1).max(500).refine((value) => value.trim() === value);
const canonicalUtc = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
});
const evidenceSourceKindSet = new Set<string>(evidenceSourceKinds);
const lowerUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isEvidenceReferenceId(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      && parsed.length === 3
      && typeof parsed[0] === "string"
      && evidenceSourceKindSet.has(parsed[0])
      && typeof parsed[1] === "string"
      && parsed[1].length > 0
      && parsed[1].trim() === parsed[1]
      && typeof parsed[2] === "string"
      && lowerUuidPattern.test(parsed[2])
      && JSON.stringify(parsed) === value;
  } catch {
    return false;
  }
}

const expectedCheckSchema = z.enum(projectBriefEvalCheckStatuses);
const expectedChecksSchema = z.object({
  schema: expectedCheckSchema,
  evidenceValidity: expectedCheckSchema,
  timeRange: expectedCheckSchema,
  requiredFacts: expectedCheckSchema,
  forbiddenAssertions: expectedCheckSchema,
  unknownHandling: expectedCheckSchema,
  readabilityAutomatic: expectedCheckSchema,
  readabilityHuman: expectedCheckSchema,
}).strict();

const contentMatchSchema = z.object({
    kind: z.enum(["exact_normalized", "token_sequence"]),
    value: requiredText,
}).strict();

const requiredEvidenceReferenceIdsSchema = z.array(
  z.string().min(1).max(500).refine(isEvidenceReferenceId),
).min(1).max(10).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: "custom",
      message: "project_brief_eval_case_invalid",
    });
  }
});

const requiredFactSchema = z.object({
  factId: identifierSchema,
  location: z.string().min(1).max(180),
  contentMatch: contentMatchSchema,
  requiredEvidenceReferenceIds: requiredEvidenceReferenceIdsSchema,
}).strict();

const forbiddenAssertionSchema = z.object({
  assertionId: identifierSchema,
  match: contentMatchSchema,
}).strict();

const expectedUnknownSchema = z.object({
  unknownId: identifierSchema,
  text: requiredText,
}).strict();

const sourceSchema = z.object({
  provenance: z.enum(["synthetic_generated", "repository_historical"]),
  sourceFingerprint: sha256Schema,
  redactionStatement: z.enum([
    "synthetic_no_personal_data", "redacted_no_direct_identifiers",
  ]),
}).strict();

const confirmationReceiptSchema = z.object({
  confirmerId: requiredText,
  confirmerRole: requiredText,
  confirmedAt: canonicalUtc,
  caseId: identifierSchema,
  subjectFingerprint: sha256Schema,
  scopes: z.array(z.enum([
    "source_and_redaction", "readability", "expected_outcomes",
  ])).length(3),
  sourceFingerprint: sha256Schema,
}).strict();

const readabilityReviewSchema = z.object({
  reviewerId: requiredText,
  reviewerRole: requiredText,
  reviewedAt: canonicalUtc,
  caseId: identifierSchema,
  subjectFingerprint: sha256Schema,
  verdict: z.literal("readable"),
}).strict();

const artifactSchema = z.object({
  snapshot: z.record(z.string(), z.unknown()),
  canonicalPayload: z.string().min(1),
  fingerprint: sha256Schema,
}).strict();

export const projectBriefEvalCaseSchema = z.object({
  contractVersion: z.literal(projectBriefEvalCaseContractVersion),
  caseId: identifierSchema,
  caseType: z.enum(projectBriefEvalCaseTypes),
  title: requiredText,
  artifact: artifactSchema,
  candidateBrief: z.unknown(),
  expectedValidity: z.enum(["valid", "invalid"]),
  expectedChecks: expectedChecksSchema,
  requiredFacts: z.array(requiredFactSchema).max(30),
  forbiddenAssertions: z.array(forbiddenAssertionSchema).max(30),
  expectedUnknowns: z.array(expectedUnknownSchema).max(20),
  source: sourceSchema,
  confirmationSubjectFingerprint: sha256Schema,
  confirmationReceipt: confirmationReceiptSchema.nullable(),
  readabilityReview: readabilityReviewSchema.nullable(),
  contentFingerprint: sha256Schema,
}).strict().superRefine((value, context) => {
  if (value.caseType === "synthetic_contract") {
    if (
      value.source.provenance !== "synthetic_generated"
      || value.source.redactionStatement !== "synthetic_no_personal_data"
      || value.confirmationReceipt !== null
      || (
        value.readabilityReview !== null
        && (
          value.readabilityReview.caseId !== value.caseId
          || value.readabilityReview.subjectFingerprint
            !== value.confirmationSubjectFingerprint
        )
      )
    ) {
      context.addIssue({ code: "custom", message: "project_brief_eval_case_invalid" });
    }
    return;
  }
  const receipt = value.confirmationReceipt;
  const requiredScopes = new Set(["source_and_redaction", "readability", "expected_outcomes"]);
  if (
    value.source.provenance !== "repository_historical"
    || value.source.redactionStatement !== "redacted_no_direct_identifiers"
    || receipt === null
    || receipt.caseId !== value.caseId
    || receipt.subjectFingerprint !== value.confirmationSubjectFingerprint
    || receipt.sourceFingerprint !== value.source.sourceFingerprint
    || new Set(receipt.scopes).size !== 3
    || receipt.scopes.some((scope) => !requiredScopes.has(scope))
  ) {
    context.addIssue({
      code: "custom",
      message: "project_brief_eval_confirmation_invalid",
      path: ["confirmationReceipt"],
    });
  }
});

const pendingCandidateSchema = z.object({
  caseId: identifierSchema,
  title: requiredText,
  caseType: z.literal("pending_human_confirmation"),
  sourceFingerprint: sha256Schema,
  missingConfirmationFields: z.array(requiredText).min(1),
}).strict();

export const projectBriefEvalManifestSchema = z.object({
  contractVersion: z.literal(projectBriefEvalManifestContractVersion),
  caseContractVersion: z.literal(projectBriefEvalCaseContractVersion),
  resultContractVersion: z.literal(projectBriefEvalResultContractVersion),
  promptVersion: z.literal(projectBriefPromptVersion),
  schemaVersion: z.literal(projectBriefSchemaVersion),
  cases: z.array(projectBriefEvalCaseSchema),
  pendingCandidates: z.array(pendingCandidateSchema),
  counts: z.object({
    includedTotal: z.number().int().nonnegative(),
    syntheticContract: z.number().int().nonnegative(),
    humanConfirmedHistorical: z.number().int().nonnegative(),
    pendingHumanConfirmation: z.number().int().nonnegative(),
  }).strict(),
  datasetFingerprint: sha256Schema,
}).strict().superRefine((value, context) => {
  const caseIds = value.cases.map(({ caseId }) => caseId);
  const pendingIds = value.pendingCandidates.map(({ caseId }) => caseId);
  const lexical = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const sorted = [...caseIds].sort(lexical);
  const sortedPending = [...pendingIds].sort(lexical);
  const unique = new Set([...caseIds, ...pendingIds]);
  const synthetic = value.cases.filter(({ caseType }) => caseType === "synthetic_contract").length;
  const historical = value.cases.length - synthetic;
  if (
    unique.size !== caseIds.length + pendingIds.length
    || caseIds.some((id, index) => id !== sorted[index])
    || pendingIds.some((id, index) => id !== sortedPending[index])
    || value.counts.includedTotal !== value.cases.length
    || value.counts.syntheticContract !== synthetic
    || value.counts.humanConfirmedHistorical !== historical
    || value.counts.pendingHumanConfirmation !== value.pendingCandidates.length
  ) {
    context.addIssue({ code: "custom", message: "project_brief_eval_manifest_invalid" });
  }
});

const checkResultSchema = z.object({
  status: z.enum(projectBriefEvalCheckStatuses),
  reasonCode: identifierSchema,
}).strict();

const caseResultSchema = z.object({
  caseId: identifierSchema,
  caseType: z.enum(projectBriefEvalCaseTypes),
  expectedValidity: z.enum(["valid", "invalid"]),
  actualValidity: z.enum(["valid", "invalid"]),
  expectationMatched: z.boolean(),
  checks: z.object({
    schema: checkResultSchema,
    evidenceValidity: checkResultSchema,
    timeRange: checkResultSchema,
    requiredFacts: checkResultSchema,
    forbiddenAssertions: checkResultSchema,
    unknownHandling: checkResultSchema,
    humanReadability: checkResultSchema,
  }).strict(),
  readability: z.object({
    automatic: checkResultSchema,
    human: checkResultSchema,
  }).strict(),
}).strict();

const resultReasonCodes = [
  "dataset_fingerprint_mismatch",
  "historical_confirmation_invalid",
  "case_expectation_mismatch",
  "included_case_total_out_of_range",
  "synthetic_contract_total_out_of_range",
  "human_confirmed_historical_below_minimum",
  "readability_human_confirmation_missing",
] as const;
const failedResultReasonCodes = new Set<string>(resultReasonCodes.slice(0, 3));

export const projectBriefEvalResultSchema = z.object({
  contractVersion: z.literal(projectBriefEvalResultContractVersion),
  datasetFingerprint: sha256Schema,
  resultFingerprint: sha256Schema,
  caseCounts: z.object({
    includedTotal: z.number().int().nonnegative(),
    syntheticContract: z.number().int().nonnegative(),
    humanConfirmedHistorical: z.number().int().nonnegative(),
    pendingHumanConfirmation: z.number().int().nonnegative(),
    expectedOutcomesMatched: z.number().int().nonnegative(),
  }).strict(),
  cases: z.array(caseResultSchema),
  releaseGate: z.enum(["passed", "blocked", "failed"]),
  blockedReasons: z.array(z.enum(resultReasonCodes)),
}).strict().superRefine((value, context) => {
  const lexical = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const caseIds = value.cases.map(({ caseId }) => caseId);
  const sortedIds = [...caseIds].sort(lexical);
  const synthetic = value.cases.filter(({ caseType }) => caseType === "synthetic_contract").length;
  const historical = value.cases.length - synthetic;
  const matched = value.cases.filter(({ expectationMatched }) => expectationMatched).length;
  const uniqueReasons = new Set(value.blockedReasons);
  const failed = value.blockedReasons.some((reason) => failedResultReasonCodes.has(reason));
  const expectedGate = failed ? "failed" : value.blockedReasons.length > 0 ? "blocked" : "passed";
  const mismatchReason = value.blockedReasons.includes("case_expectation_mismatch");
  const includedReason = value.blockedReasons.includes("included_case_total_out_of_range");
  const syntheticReason = value.blockedReasons.includes("synthetic_contract_total_out_of_range");
  const historicalReason = value.blockedReasons.includes(
    "human_confirmed_historical_below_minimum",
  );
  const readabilityReason = value.blockedReasons.includes(
    "readability_human_confirmation_missing",
  );
  const canonicalReasons = resultReasonCodes.filter((reason) => uniqueReasons.has(reason));
  if (
    new Set(caseIds).size !== caseIds.length
    || caseIds.some((id, index) => id !== sortedIds[index])
    || value.caseCounts.includedTotal !== value.cases.length
    || value.caseCounts.syntheticContract !== synthetic
    || value.caseCounts.humanConfirmedHistorical !== historical
    || value.caseCounts.expectedOutcomesMatched !== matched
    || uniqueReasons.size !== value.blockedReasons.length
    || value.releaseGate !== expectedGate
    || (matched !== value.cases.length) !== mismatchReason
    || (value.caseCounts.includedTotal < 12 || value.caseCounts.includedTotal > 15)
      !== includedReason
    || (value.caseCounts.syntheticContract < 8 || value.caseCounts.syntheticContract > 10)
      !== syntheticReason
    || (value.caseCounts.humanConfirmedHistorical < 4) !== historicalReason
    || value.cases.some(({ readability }) => readability.human.status !== "pass")
      !== readabilityReason
    || value.blockedReasons.some((reason, index) => reason !== canonicalReasons[index])
  ) {
    context.addIssue({ code: "custom", message: "project_brief_eval_result_invalid" });
  }
});

export type ProjectBriefEvalCase = z.infer<typeof projectBriefEvalCaseSchema>;
export type ProjectBriefEvalManifest = z.infer<typeof projectBriefEvalManifestSchema>;
export type ProjectBriefEvalResult = z.infer<typeof projectBriefEvalResultSchema>;
export type ProjectBriefEvalCheckResult = z.infer<typeof checkResultSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, fallback: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const confirmation = parsed.error.issues.some(
    ({ message }) => message === "project_brief_eval_confirmation_invalid",
  );
  throw new Error(confirmation ? "project_brief_eval_confirmation_invalid" : fallback);
}

export function parseProjectBriefEvalCase(value: unknown): ProjectBriefEvalCase {
  return parseOrThrow(projectBriefEvalCaseSchema, value, "project_brief_eval_case_invalid");
}

export function parseProjectBriefEvalManifest(value: unknown): ProjectBriefEvalManifest {
  return parseOrThrow(projectBriefEvalManifestSchema, value, "project_brief_eval_manifest_invalid");
}

export function parseProjectBriefEvalResult(value: unknown): ProjectBriefEvalResult {
  const result = parseOrThrow(
    projectBriefEvalResultSchema,
    value,
    "project_brief_eval_result_invalid",
  );
  const content = Object.fromEntries(
    Object.entries(result).filter(([key]) => key !== "resultFingerprint"),
  );
  if (fingerprintEvalValue(content) !== result.resultFingerprint) {
    throw new Error("project_brief_eval_result_invalid");
  }
  return result;
}
