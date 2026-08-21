import { z } from "zod";

import { NodeProjectBriefEvidenceFingerprint } from
  "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";

import {
  parseProjectBriefEvalManifest,
  projectBriefEvalCaseContractVersion,
  projectBriefEvalCaseSchema,
  projectBriefEvalManifestContractVersion,
  projectBriefEvalResultContractVersion,
  type ProjectBriefEvalCase,
  type ProjectBriefEvalCheckResult,
} from "./project-brief-eval-contracts";
import {
  historicalBriefArtifactContractVersion,
  historicalBriefConversionV2ContractVersion,
  historicalBriefEvalCaseV3ContractVersion,
  historicalBriefEvalCaseV3Schema,
  historicalBriefMappingV2Version,
  historicalBriefProjectionV2ContractVersion,
  historicalBriefStatementClassificationVersion,
  historicalBriefTimePrecisionVersion,
  type HistoricalBriefEvalCaseV3,
} from "./project-brief-eval-historical-contracts";
import {
  loadRegisteredHistoricalBriefCaseV3,
  loadRegisteredHistoricalBriefCasesV3,
  validateHistoricalStatementEvidence,
  validateHistoricalTimeRange,
} from "./project-brief-eval-historical-converter";
import { historicalBriefSourceRegistryVersion } from
  "./project-brief-eval-historical-registry";
import { fingerprintEvalValue } from "./project-brief-eval-fingerprint";
import { evaluateProjectBriefDataset } from "./project-brief-eval-harness";
import { loadSyntheticProjectBriefEvalManifest } from
  "./project-brief-eval-synthetic-cases";
import {
  projectBriefEvalDatasetV3CaseIds,
  projectBriefEvalV3CaseProfileVersion,
  projectBriefEvalV3CaseRegistry,
} from "./project-brief-eval-v3-case-registry";

export { projectBriefEvalDatasetV3CaseIds } from "./project-brief-eval-v3-case-registry";

export const projectBriefEvalManifestV3ContractVersion = "project-brief-eval-manifest.v3" as const;
export const projectBriefEvalResultV3ContractVersion = "project-brief-eval-result.v3" as const;
export const projectBriefEvalDatasetV3ProfileVersion = "project-brief-eval-dataset.v3" as const;

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const checkSchema = z.object({
  status: z.enum(["pass", "fail", "blocked", "not_applicable"]),
  reasonCode: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
}).strict();
const countsSchema = z.object({
  includedTotal: z.number().int().nonnegative(),
  syntheticContract: z.number().int().nonnegative(),
  humanConfirmedHistorical: z.number().int().nonnegative(),
  pendingHumanConfirmation: z.number().int().nonnegative(),
}).strict();
const caseSummarySchema = z.object({
  caseId: z.string().min(1),
  contractVersion: z.enum([
    projectBriefEvalCaseContractVersion,
    historicalBriefEvalCaseV3ContractVersion,
  ]),
  contentFingerprint: sha,
}).strict();
const fingerprintInputSchema = z.object({
  contractVersion: z.literal(projectBriefEvalManifestV3ContractVersion),
  datasetProfileVersion: z.literal(projectBriefEvalDatasetV3ProfileVersion),
  caseProfileVersion: z.literal(projectBriefEvalV3CaseProfileVersion),
  resultContractVersion: z.literal(projectBriefEvalResultV3ContractVersion),
  syntheticCaseContractVersion: z.literal(projectBriefEvalCaseContractVersion),
  historicalCaseContractVersion: z.literal(historicalBriefEvalCaseV3ContractVersion),
  historicalArtifactContractVersion: z.literal(historicalBriefArtifactContractVersion),
  historicalConversionContractVersion: z.literal(historicalBriefConversionV2ContractVersion),
  historicalMappingVersion: z.literal(historicalBriefMappingV2Version),
  historicalProjectionContractVersion: z.literal(historicalBriefProjectionV2ContractVersion),
  historicalStatementClassificationVersion: z.literal(
    historicalBriefStatementClassificationVersion,
  ),
  historicalTimePrecisionVersion: z.literal(historicalBriefTimePrecisionVersion),
  registryVersion: z.literal(historicalBriefSourceRegistryVersion),
  cases: z.array(caseSummarySchema),
}).strict();

const manifestSchema = z.object({
  contractVersion: z.literal(projectBriefEvalManifestV3ContractVersion),
  resultContractVersion: z.literal(projectBriefEvalResultV3ContractVersion),
  cases: z.array(z.union([projectBriefEvalCaseSchema, historicalBriefEvalCaseV3Schema])),
  counts: countsSchema,
  fingerprintInput: fingerprintInputSchema,
  datasetFingerprint: sha,
}).strict().superRefine((value, context) => {
  const ids = value.cases.map(({ caseId }) => caseId);
  const synthetic = value.cases.filter(({ contractVersion }) =>
    contractVersion === projectBriefEvalCaseContractVersion).length;
  const valid = ids.length === projectBriefEvalDatasetV3CaseIds.length
    && ids.every((id, index) => id === projectBriefEvalDatasetV3CaseIds[index])
    && new Set(ids).size === ids.length
    && value.counts.includedTotal === value.cases.length
    && value.counts.syntheticContract === synthetic
    && value.counts.humanConfirmedHistorical === value.cases.length - synthetic
    && value.counts.pendingHumanConfirmation === 0
    && value.fingerprintInput.cases.length === value.cases.length
    && value.fingerprintInput.cases.every((summary, index) => {
      const item = value.cases[index];
      const trusted = projectBriefEvalV3CaseRegistry[index];
      return item !== undefined && trusted !== undefined
        && summary.caseId === item.caseId
        && summary.contractVersion === item.contractVersion
        && summary.contentFingerprint === item.contentFingerprint
        && summary.caseId === trusted.caseId
        && summary.contractVersion === trusted.contractVersion
        && summary.contentFingerprint === trusted.contentFingerprint;
    })
    && fingerprintEvalValue(value.fingerprintInput) === value.datasetFingerprint;
  if (!valid) {
    context.addIssue({ code: "custom", message: "project_brief_eval_manifest_v3_invalid" });
  }
});

const caseResultSchema = z.object({
  caseId: z.string().min(1),
  caseType: z.enum(["synthetic_contract", "human_confirmed_historical"]),
  contractVersion: z.enum([
    projectBriefEvalCaseContractVersion,
    historicalBriefEvalCaseV3ContractVersion,
  ]),
  expectedValidity: z.enum(["valid", "invalid", "blocked"]),
  actualValidity: z.enum(["valid", "invalid", "blocked"]),
  expectationMatched: z.boolean(),
  checks: z.object({
    schema: checkSchema,
    evidenceValidity: checkSchema,
    timeRange: checkSchema,
    requiredFacts: checkSchema,
    forbiddenAssertions: checkSchema,
    unknownHandling: checkSchema,
    humanReadability: checkSchema,
  }).strict(),
  readability: z.object({ automatic: checkSchema, human: checkSchema }).strict(),
}).strict();

const blockedReasonSchema = z.enum([
  "historical_trust_invalid",
  "case_expectation_mismatch",
  "included_case_total_out_of_range",
  "synthetic_contract_total_out_of_range",
  "human_confirmed_historical_below_minimum",
]);

const resultSchema = z.object({
  contractVersion: z.literal(projectBriefEvalResultV3ContractVersion),
  datasetFingerprint: sha,
  resultFingerprint: sha,
  caseCounts: countsSchema.extend({
    expectedOutcomesMatched: z.number().int().nonnegative(),
  }).strict(),
  cases: z.array(caseResultSchema),
  releaseGate: z.enum(["passed", "blocked", "failed"]),
  blockedReasons: z.array(blockedReasonSchema),
}).strict().superRefine((value, context) => {
  const ids = value.cases.map(({ caseId }) => caseId);
  const matched = value.cases.filter(({ expectationMatched }) => expectationMatched).length;
  const synthetic = value.cases.filter(({ caseType }) => caseType === "synthetic_contract").length;
  const expectedGate = value.blockedReasons.length === 0
    ? "passed"
    : value.blockedReasons.some((reason) =>
      reason === "historical_trust_invalid" || reason === "case_expectation_mismatch")
      ? "failed"
      : "blocked";
  const withoutFingerprint = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "resultFingerprint"),
  );
  const valid = ids.length === projectBriefEvalDatasetV3CaseIds.length
    && ids.every((id, index) => id === projectBriefEvalDatasetV3CaseIds[index])
    && new Set(ids).size === ids.length
    && value.caseCounts.includedTotal === value.cases.length
    && value.caseCounts.syntheticContract === synthetic
    && value.caseCounts.humanConfirmedHistorical === value.cases.length - synthetic
    && value.caseCounts.expectedOutcomesMatched === matched
    && new Set(value.blockedReasons).size === value.blockedReasons.length
    && value.releaseGate === expectedGate
    && value.resultFingerprint === fingerprintEvalValue(withoutFingerprint);
  if (!valid) {
    context.addIssue({ code: "custom", message: "project_brief_eval_result_v3_invalid" });
  }
});

export type ProjectBriefEvalManifestV3 = z.infer<typeof manifestSchema>;
export type ProjectBriefEvalResultV3 = z.infer<typeof resultSchema>;

function pass(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "pass", reasonCode };
}

function fail(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "fail", reasonCode };
}

function notApplicable(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "not_applicable", reasonCode };
}

function parseManifest(input: unknown): ProjectBriefEvalManifestV3 {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new Error("project_brief_eval_manifest_v3_invalid");
  return parsed.data;
}

function syntheticManifest(cases: ProjectBriefEvalCase[]) {
  const fingerprintInput = {
    contractVersion: projectBriefEvalManifestContractVersion,
    caseContractVersion: projectBriefEvalCaseContractVersion,
    resultContractVersion: projectBriefEvalResultContractVersion,
    promptVersion: "project-brief-v1" as const,
    schemaVersion: "project-brief-schema-v1" as const,
    cases: cases.map(({ caseId, contentFingerprint }) => ({ caseId, contentFingerprint })),
    pendingCandidates: [],
  };
  return parseProjectBriefEvalManifest({
    ...fingerprintInput,
    cases,
    counts: {
      includedTotal: cases.length,
      syntheticContract: cases.length,
      humanConfirmedHistorical: 0,
      pendingHumanConfirmation: 0,
    },
    datasetFingerprint: fingerprintEvalValue(fingerprintInput),
  });
}

async function historicalResult(item: HistoricalBriefEvalCaseV3) {
  let replay: HistoricalBriefEvalCaseV3 | null = null;
  try {
    replay = await loadRegisteredHistoricalBriefCaseV3(item.caseId);
  } catch {
    replay = null;
  }
  const trusted = replay !== null
    && fingerprintEvalValue(replay) === fingerprintEvalValue(item)
    && replay.contentFingerprint === item.contentFingerprint
    && replay.caseFingerprint === item.caseFingerprint
    && replay.conversionAttestation.outputCaseFingerprint === item.caseFingerprint;
  const evidenceValidity = trusted
    ? validateHistoricalStatementEvidence(item.projection)
    : fail("historical_statement_evidence_invalid");
  const timeRange = trusted
    ? validateHistoricalTimeRange(item.projection.timeRange)
    : fail("historical_time_range_precision_invalid");
  const statementIds = item.projection.statements.map(({ statementId }) => statementId);
  const factsComplete = trusted
    && statementIds.length > 0
    && new Set(statementIds).size === statementIds.length
    && item.projection.sections.length === item.projection.sectionOrder.length;
  const unknowns = item.projection.statements.filter(({ statementKind }) =>
    statementKind === "unknown");
  const factualText = new Set(item.projection.statements
    .filter(({ statementKind }) => statementKind === "project_fact")
    .map(({ normalizedText }) => normalizedText));
  const unknownsValid = trusted
    && unknowns.length > 0
    && unknowns.every(({ sourceSection, normalizedText }) =>
      sourceSection === "Unknowns" && !factualText.has(normalizedText));
  const placeholder = /\b(?:todo|tbd|fixme|lorem ipsum)\b|待补充|占位符/iu;
  const normalizedStatements = item.projection.statements.map(({ normalizedText }) =>
    normalizedText);
  const readable = trusted
    && normalizedStatements.every((text) => !placeholder.test(text))
    && new Set(normalizedStatements).size === normalizedStatements.length;
  const checks = {
    schema: trusted ? pass("historical_brief_schema_v3_valid")
      : fail("historical_brief_schema_v3_invalid"),
    evidenceValidity,
    timeRange,
    requiredFacts: factsComplete
      ? pass("historical_full_statement_projection_valid")
      : fail("historical_statement_projection_incomplete"),
    forbiddenAssertions: trusted
      && item.humanConfirmationReceipt.scopes.includes("expected_outcomes")
      ? pass("historical_expected_outcomes_confirmed")
      : fail("historical_expected_outcomes_unconfirmed"),
    unknownHandling: unknownsValid
      ? pass("historical_unknown_statements_preserved")
      : fail("historical_unknown_statements_invalid"),
    humanReadability: readable && item.humanConfirmationReceipt.scopes.includes("readability")
      ? pass("historical_readability_confirmed")
      : fail("historical_readability_invalid"),
  };
  const observedStatuses = {
    schema: checks.schema.status,
    evidenceValidity: checks.evidenceValidity.status,
    timeRange: checks.timeRange.status,
    requiredFacts: checks.requiredFacts.status,
    forbiddenAssertions: checks.forbiddenAssertions.status,
    unknownHandling: checks.unknownHandling.status,
    readability: checks.humanReadability.status,
  };
  const expectationMatched = trusted
    && Object.entries(item.expectedChecks).every(([name, status]) =>
      observedStatuses[name as keyof typeof observedStatuses] === status);
  const actualValidity = Object.values(observedStatuses).some((status) => status === "fail")
    ? "invalid" as const
    : Object.values(observedStatuses).some((status) => status === "blocked")
      ? "blocked" as const
      : "valid" as const;
  return {
    caseId: item.caseId,
    caseType: "human_confirmed_historical" as const,
    contractVersion: historicalBriefEvalCaseV3ContractVersion,
    expectedValidity: "valid" as const,
    actualValidity,
    expectationMatched,
    checks,
    readability: {
      automatic: readable ? pass("readability_proxy_valid") : fail("readability_proxy_failed"),
      human: item.humanConfirmationReceipt.scopes.includes("readability")
        ? pass("historical_readability_confirmed")
        : fail("historical_readability_unconfirmed"),
    },
  };
}

export async function loadProjectBriefEvalManifestV3(): Promise<ProjectBriefEvalManifestV3> {
  const synthetic = (await loadSyntheticProjectBriefEvalManifest()).cases;
  const historical = await loadRegisteredHistoricalBriefCasesV3();
  const cases = [...synthetic, ...historical]
    .sort((left, right) => left.caseId.localeCompare(right.caseId, "en"));
  const fingerprintInput = {
    contractVersion: projectBriefEvalManifestV3ContractVersion,
    datasetProfileVersion: projectBriefEvalDatasetV3ProfileVersion,
    caseProfileVersion: projectBriefEvalV3CaseProfileVersion,
    resultContractVersion: projectBriefEvalResultV3ContractVersion,
    syntheticCaseContractVersion: projectBriefEvalCaseContractVersion,
    historicalCaseContractVersion: historicalBriefEvalCaseV3ContractVersion,
    historicalArtifactContractVersion: historicalBriefArtifactContractVersion,
    historicalConversionContractVersion: historicalBriefConversionV2ContractVersion,
    historicalMappingVersion: historicalBriefMappingV2Version,
    historicalProjectionContractVersion: historicalBriefProjectionV2ContractVersion,
    historicalStatementClassificationVersion: historicalBriefStatementClassificationVersion,
    historicalTimePrecisionVersion: historicalBriefTimePrecisionVersion,
    registryVersion: historicalBriefSourceRegistryVersion,
    cases: cases.map(({ caseId, contractVersion, contentFingerprint }) => ({
      caseId, contractVersion, contentFingerprint,
    })),
  };
  return parseManifest({
    contractVersion: projectBriefEvalManifestV3ContractVersion,
    resultContractVersion: projectBriefEvalResultV3ContractVersion,
    cases,
    counts: {
      includedTotal: cases.length,
      syntheticContract: synthetic.length,
      humanConfirmedHistorical: historical.length,
      pendingHumanConfirmation: 0,
    },
    fingerprintInput,
    datasetFingerprint: fingerprintEvalValue(fingerprintInput),
  });
}

export async function evaluateProjectBriefDatasetV3(
  input: unknown,
): Promise<ProjectBriefEvalResultV3> {
  const manifest = parseManifest(input);
  const syntheticCases = manifest.cases.filter((item): item is ProjectBriefEvalCase =>
    item.contractVersion === projectBriefEvalCaseContractVersion);
  const historicalCases = manifest.cases.filter((item): item is HistoricalBriefEvalCaseV3 =>
    item.contractVersion === historicalBriefEvalCaseV3ContractVersion);
  const v1 = await evaluateProjectBriefDataset(syntheticManifest(syntheticCases), {
    fingerprint: new NodeProjectBriefEvidenceFingerprint(),
  });
  const syntheticResults = v1.cases.map((item) => ({
    ...item,
    contractVersion: projectBriefEvalCaseContractVersion,
    checks: { ...item.checks, humanReadability: item.readability.automatic },
    readability: {
      automatic: item.readability.automatic,
      human: notApplicable("synthetic_human_readability_not_applicable"),
    },
  }));
  const historicalResults = await Promise.all(historicalCases.map(historicalResult));
  const cases = [...syntheticResults, ...historicalResults]
    .sort((left, right) => left.caseId.localeCompare(right.caseId, "en"));
  const reasons: Array<z.infer<typeof blockedReasonSchema>> = [];
  if (historicalResults.some(({ expectationMatched }) => !expectationMatched)) {
    reasons.push("historical_trust_invalid");
  }
  if (cases.some(({ expectationMatched }) => !expectationMatched)) {
    reasons.push("case_expectation_mismatch");
  }
  if (manifest.counts.includedTotal < 12 || manifest.counts.includedTotal > 15) {
    reasons.push("included_case_total_out_of_range");
  }
  if (manifest.counts.syntheticContract < 8 || manifest.counts.syntheticContract > 10) {
    reasons.push("synthetic_contract_total_out_of_range");
  }
  if (manifest.counts.humanConfirmedHistorical < 4) {
    reasons.push("human_confirmed_historical_below_minimum");
  }
  const withoutFingerprint = {
    contractVersion: projectBriefEvalResultV3ContractVersion,
    datasetFingerprint: manifest.datasetFingerprint,
    caseCounts: {
      ...manifest.counts,
      expectedOutcomesMatched: cases.filter(({ expectationMatched }) => expectationMatched).length,
    },
    cases,
    releaseGate: reasons.length === 0
      ? "passed" as const
      : reasons.some((reason) =>
        reason === "historical_trust_invalid" || reason === "case_expectation_mismatch")
        ? "failed" as const
        : "blocked" as const,
    blockedReasons: reasons,
  };
  const parsed = resultSchema.safeParse({
    ...withoutFingerprint,
    resultFingerprint: fingerprintEvalValue(withoutFingerprint),
  });
  if (!parsed.success) throw new Error("project_brief_eval_result_v3_invalid");
  return parsed.data;
}
