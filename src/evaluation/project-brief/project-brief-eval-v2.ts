import { z } from "zod";

import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";

import {
  parseProjectBriefEvalManifest,
  projectBriefEvalCaseSchema,
  projectBriefEvalCaseContractVersion,
  projectBriefEvalManifestContractVersion,
  projectBriefEvalResultContractVersion,
  type ProjectBriefEvalCase,
  type ProjectBriefEvalCheckResult,
} from "./project-brief-eval-contracts";
import {
  historicalBriefArtifactContractVersion,
  historicalBriefConversionContractVersion,
  historicalBriefEvalCaseContractVersion,
  historicalBriefEvalCaseSchema,
  historicalBriefMappingVersion,
  type HistoricalBriefEvalCase,
} from "./project-brief-eval-historical-contracts";
import {
  loadRegisteredHistoricalBriefCase,
  loadRegisteredHistoricalBriefCases,
} from "./project-brief-eval-historical-converter";
import { historicalBriefSourceRegistryVersion } from "./project-brief-eval-historical-registry";
import { fingerprintEvalValue } from "./project-brief-eval-fingerprint";
import { evaluateProjectBriefDataset } from "./project-brief-eval-harness";
import { loadSyntheticProjectBriefEvalManifest } from "./project-brief-eval-synthetic-cases";
import {
  projectBriefEvalDatasetV2CaseIds,
  projectBriefEvalV2CaseProfileVersion,
  projectBriefEvalV2CaseRegistry,
} from "./project-brief-eval-v2-case-registry";

export { projectBriefEvalDatasetV2CaseIds } from "./project-brief-eval-v2-case-registry";

export const projectBriefEvalManifestV2ContractVersion = "project-brief-eval-manifest.v2" as const;
export const projectBriefEvalResultV2ContractVersion = "project-brief-eval-result.v2" as const;
export const projectBriefEvalDatasetV2ProfileVersion = "project-brief-eval-dataset.v2" as const;

const sha = z.string().regex(/^[0-9a-f]{64}$/);
const checkSchema = z.object({
  status: z.enum(["pass", "fail", "blocked", "not_applicable"]),
  reasonCode: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
}).strict();
const caseSummarySchema = z.object({
  caseId: z.string().min(1),
  contractVersion: z.enum([
    projectBriefEvalCaseContractVersion,
    historicalBriefEvalCaseContractVersion,
  ]),
  contentFingerprint: sha,
}).strict();
const fingerprintInputSchema = z.object({
  contractVersion: z.literal(projectBriefEvalManifestV2ContractVersion),
  datasetProfileVersion: z.literal(projectBriefEvalDatasetV2ProfileVersion),
  caseProfileVersion: z.literal(projectBriefEvalV2CaseProfileVersion),
  resultContractVersion: z.literal(projectBriefEvalResultV2ContractVersion),
  syntheticCaseContractVersion: z.literal(projectBriefEvalCaseContractVersion),
  historicalCaseContractVersion: z.literal(historicalBriefEvalCaseContractVersion),
  historicalArtifactContractVersion: z.literal(historicalBriefArtifactContractVersion),
  historicalConversionContractVersion: z.literal(historicalBriefConversionContractVersion),
  historicalMappingVersion: z.literal(historicalBriefMappingVersion),
  registryVersion: z.literal(historicalBriefSourceRegistryVersion),
  cases: z.array(caseSummarySchema),
}).strict();

const countsSchema = z.object({
  includedTotal: z.number().int().nonnegative(),
  syntheticContract: z.number().int().nonnegative(),
  humanConfirmedHistorical: z.number().int().nonnegative(),
  pendingHumanConfirmation: z.number().int().nonnegative(),
}).strict();

const manifestSchema = z.object({
  contractVersion: z.literal(projectBriefEvalManifestV2ContractVersion),
  resultContractVersion: z.literal(projectBriefEvalResultV2ContractVersion),
  cases: z.array(z.union([
    projectBriefEvalCaseSchema,
    historicalBriefEvalCaseSchema,
  ])),
  counts: countsSchema,
  fingerprintInput: fingerprintInputSchema,
  datasetFingerprint: sha,
}).strict().superRefine((value, context) => {
  const ids = value.cases.map(({ caseId }) => caseId);
  const sorted = [...ids].sort();
  const synthetic = value.cases.filter(({ contractVersion }) =>
    contractVersion === projectBriefEvalCaseContractVersion).length;
  const valid = ids.every((id, index) => id === sorted[index])
    && ids.length === projectBriefEvalDatasetV2CaseIds.length
    && ids.every((id, index) => id === projectBriefEvalDatasetV2CaseIds[index])
    && new Set(ids).size === ids.length
    && value.counts.includedTotal === value.cases.length
    && value.counts.syntheticContract === synthetic
    && value.counts.humanConfirmedHistorical === value.cases.length - synthetic
    && value.counts.pendingHumanConfirmation === 0
    && value.fingerprintInput.cases.length === value.cases.length
    && value.fingerprintInput.cases.every((summary, index) =>
      summary.caseId === value.cases[index]!.caseId
      && summary.contractVersion === value.cases[index]!.contractVersion
      && summary.contentFingerprint === value.cases[index]!.contentFingerprint)
    && value.fingerprintInput.cases.every((summary, index) => {
      const trusted = projectBriefEvalV2CaseRegistry[index];
      return trusted !== undefined
        && summary.caseId === trusted.caseId
        && summary.contractVersion === trusted.contractVersion
        && summary.contentFingerprint === trusted.contentFingerprint;
    })
    && fingerprintProjectBriefEvalManifestV2Input(value.fingerprintInput)
      === value.datasetFingerprint;
  if (!valid) context.addIssue({ code: "custom", message: "project_brief_eval_manifest_v2_invalid" });
});

const caseResultSchema = z.object({
  caseId: z.string().min(1),
  caseType: z.enum(["synthetic_contract", "human_confirmed_historical"]),
  contractVersion: z.enum([
    projectBriefEvalCaseContractVersion,
    historicalBriefEvalCaseContractVersion,
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

const resultSchema = z.object({
  contractVersion: z.literal(projectBriefEvalResultV2ContractVersion),
  datasetFingerprint: sha,
  resultFingerprint: sha,
  caseCounts: countsSchema.extend({ expectedOutcomesMatched: z.number().int().nonnegative() }).strict(),
  cases: z.array(caseResultSchema),
  releaseGate: z.enum(["passed", "blocked", "failed"]),
  blockedReasons: z.array(z.enum([
    "dataset_fingerprint_mismatch", "historical_trust_invalid",
    "historical_evidence_boundary_unresolved",
    "case_expectation_mismatch", "included_case_total_out_of_range",
    "synthetic_contract_total_out_of_range", "human_confirmed_historical_below_minimum",
  ])),
}).strict().superRefine((value, context) => {
  const ids = value.cases.map(({ caseId }) => caseId);
  const sorted = [...ids].sort();
  const synthetic = value.cases.filter(({ caseType }) =>
    caseType === "synthetic_contract").length;
  const matched = value.cases.filter(({ expectationMatched }) => expectationMatched).length;
  const uniqueReasons = new Set(value.blockedReasons);
  const boundaryUnresolved = value.cases.some(({ checks }) =>
    checks.evidenceValidity.reasonCode === "historical_fact_evidence_unavailable"
    || checks.timeRange.reasonCode === "historical_time_range_unresolved");
  const historicalMismatch = value.cases.some(({ caseType, expectationMatched }) =>
    caseType === "human_confirmed_historical" && !expectationMatched);
  const anyMismatch = value.cases.some(({ expectationMatched }) => !expectationMatched);
  const withoutFingerprint = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "resultFingerprint"),
  );
  const expectedGate = value.blockedReasons.length === 0
    ? "passed"
    : value.blockedReasons.some((reason) => reason === "dataset_fingerprint_mismatch"
      || reason === "historical_trust_invalid"
      || reason === "case_expectation_mismatch")
      ? "failed"
      : "blocked";
  const valid = new Set(ids).size === ids.length
    && ids.every((id, index) => id === sorted[index])
    && ids.length === projectBriefEvalDatasetV2CaseIds.length
    && ids.every((id, index) => id === projectBriefEvalDatasetV2CaseIds[index])
    && value.caseCounts.includedTotal === value.cases.length
    && value.caseCounts.syntheticContract === synthetic
    && value.caseCounts.humanConfirmedHistorical === value.cases.length - synthetic
    && value.caseCounts.expectedOutcomesMatched === matched
    && uniqueReasons.size === value.blockedReasons.length
    && value.releaseGate === expectedGate
    && value.blockedReasons.includes("historical_evidence_boundary_unresolved")
      === boundaryUnresolved
    && value.blockedReasons.includes("historical_trust_invalid") === historicalMismatch
    && value.blockedReasons.includes("case_expectation_mismatch") === anyMismatch
    && value.resultFingerprint === fingerprintEvalValue(withoutFingerprint);
  if (!valid) context.addIssue({ code: "custom", message: "project_brief_eval_result_v2_invalid" });
});

export type ProjectBriefEvalManifestV2 = z.infer<typeof manifestSchema>;
export type ProjectBriefEvalResultV2 = z.infer<typeof resultSchema>;

export function fingerprintProjectBriefEvalManifestV2Input(input: unknown): string {
  return fingerprintEvalValue(input);
}

function parseManifest(value: unknown): ProjectBriefEvalManifestV2 {
  const result = manifestSchema.safeParse(value);
  if (!result.success) throw new Error("project_brief_eval_manifest_v2_invalid");
  return result.data;
}

function pass(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "pass", reasonCode };
}

function fail(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "fail", reasonCode };
}

function blocked(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "blocked", reasonCode };
}

function notApplicable(reasonCode: string): ProjectBriefEvalCheckResult {
  return { status: "not_applicable", reasonCode };
}

function historicalTimeRangeCheck(
  item: HistoricalBriefEvalCase,
  trusted: boolean,
): ProjectBriefEvalCheckResult {
  if (!trusted) return fail("historical_time_expression_invalid");
  if (/待确认|无法确定/u.test(item.projection.timeExpression)) {
    return blocked("historical_time_range_unresolved");
  }
  const values = item.projection.timeExpression.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g,
  ) ?? [];
  const [start, end] = values.map((value) => Date.parse(value));
  return values.length === 2
    && Number.isFinite(start)
    && Number.isFinite(end)
    && start! < end!
    ? pass("historical_time_range_preserved")
    : fail("historical_time_expression_invalid");
}

export async function loadProjectBriefEvalManifestV2(): Promise<ProjectBriefEvalManifestV2> {
  const synthetic = (await loadSyntheticProjectBriefEvalManifest()).cases;
  const historical = await loadRegisteredHistoricalBriefCases();
  const cases = [...synthetic, ...historical]
    .sort((left, right) => left.caseId.localeCompare(right.caseId, "en"));
  const syntheticContract = cases.filter(({ contractVersion }) =>
    contractVersion === projectBriefEvalCaseContractVersion).length;
  const humanConfirmedHistorical = cases.length - syntheticContract;
  const fingerprintInput = {
    contractVersion: projectBriefEvalManifestV2ContractVersion,
    datasetProfileVersion: projectBriefEvalDatasetV2ProfileVersion,
    caseProfileVersion: projectBriefEvalV2CaseProfileVersion,
    resultContractVersion: projectBriefEvalResultV2ContractVersion,
    syntheticCaseContractVersion: projectBriefEvalCaseContractVersion,
    historicalCaseContractVersion: historicalBriefEvalCaseContractVersion,
    historicalArtifactContractVersion: historicalBriefArtifactContractVersion,
    historicalConversionContractVersion: historicalBriefConversionContractVersion,
    historicalMappingVersion: historicalBriefMappingVersion,
    registryVersion: historicalBriefSourceRegistryVersion,
    cases: cases.map(({ caseId, contractVersion, contentFingerprint }) => ({
      caseId, contractVersion, contentFingerprint,
    })),
  };
  return parseManifest({
    contractVersion: projectBriefEvalManifestV2ContractVersion,
    resultContractVersion: projectBriefEvalResultV2ContractVersion,
    cases,
    counts: {
      includedTotal: cases.length,
      syntheticContract,
      humanConfirmedHistorical,
      pendingHumanConfirmation: 0,
    },
    fingerprintInput,
    datasetFingerprint: fingerprintProjectBriefEvalManifestV2Input(fingerprintInput),
  });
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

async function historicalResult(item: HistoricalBriefEvalCase) {
  let replay: HistoricalBriefEvalCase | null = null;
  try {
    replay = await loadRegisteredHistoricalBriefCase(item.caseId);
  } catch {
    replay = null;
  }
  const trusted = replay !== null
    && fingerprintEvalValue(replay) === fingerprintEvalValue(item)
    && replay.contentFingerprint === item.contentFingerprint
    && replay.caseFingerprint === item.caseFingerprint
    && replay.conversionAttestation.outputCaseFingerprint === item.caseFingerprint;
  const catalog = new Set(item.projection.evidenceCatalog.map(({ evidenceId }) => evidenceId));
  const catalogUnique = catalog.size === item.projection.evidenceCatalog.length;
  const evidenceValid = trusted
    && catalogUnique
    && item.projection.facts.every(({ evidenceIds }) => evidenceIds.length > 0)
    && item.projection.visibleEvidenceIds.every((id) => catalog.has(id));
  const evidenceBoundaryUnresolved = trusted
    && item.projection.facts.some(({ evidenceIds }) => evidenceIds.length === 0);
  const factsComplete = trusted && item.projection.facts.length > 0
    && item.projection.sections.length === item.projection.sectionOrder.length;
  const unknownsValid = trusted && item.projection.unknowns.every(({ text }) =>
    !item.projection.facts.some((fact) => fact.text === text));
  const placeholder = /\b(?:todo|tbd|fixme|lorem ipsum)\b|待补充|占位符/iu;
  const normalizedFacts = item.projection.facts.map(({ text }) =>
    text.replace(/\s+/g, " ").trim().normalize("NFC"));
  const readable = trusted
    && normalizedFacts.every((text) => !placeholder.test(text))
    && new Set(normalizedFacts).size === normalizedFacts.length;
  const checks = {
    schema: trusted ? pass("historical_brief_schema_valid") : fail("historical_brief_schema_invalid"),
    evidenceValidity: evidenceValid
      ? pass("historical_visible_evidence_valid")
      : evidenceBoundaryUnresolved
        ? blocked("historical_fact_evidence_unavailable")
        : fail("historical_visible_evidence_invalid"),
    timeRange: historicalTimeRangeCheck(item, trusted),
    requiredFacts: factsComplete
      ? pass("historical_full_projection_valid") : fail("historical_projection_incomplete"),
    forbiddenAssertions: trusted
      && item.humanConfirmationReceipt.scopes.includes("expected_outcomes")
      ? pass("historical_expected_outcomes_confirmed") : fail("historical_expected_outcomes_unconfirmed"),
    unknownHandling: unknownsValid
      ? pass("historical_unknowns_preserved") : fail("historical_unknowns_invalid"),
    humanReadability: readable && item.humanConfirmationReceipt.scopes.includes("readability")
      ? pass("historical_readability_confirmed") : fail("historical_readability_invalid"),
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
  const expectedStatuses = item.expectedChecks;
  const expectationMatched = trusted
    && Object.entries(expectedStatuses).every(([name, status]) =>
      observedStatuses[name as keyof typeof observedStatuses] === status);
  const expectedStatusValues = Object.values(expectedStatuses);
  const observedStatusValues = Object.values(observedStatuses);
  const expectedValidity = expectedStatusValues.some((status) => status === "fail")
    ? "invalid" as const
    : expectedStatusValues.some((status) => status === "blocked")
      ? "blocked" as const : "valid" as const;
  const actualValidity = observedStatusValues.some((status) => status === "fail")
    ? "invalid" as const
    : observedStatusValues.some((status) => status === "blocked")
      ? "blocked" as const : "valid" as const;
  return {
    caseId: item.caseId,
    caseType: "human_confirmed_historical" as const,
    contractVersion: historicalBriefEvalCaseContractVersion,
    expectedValidity,
    actualValidity,
    expectationMatched,
    checks,
    readability: {
      automatic: readable
        ? pass("readability_proxy_valid") : fail("readability_proxy_failed"),
      human: item.humanConfirmationReceipt.scopes.includes("readability")
        ? pass("historical_readability_confirmed") : fail("historical_readability_unconfirmed"),
    },
  };
}

export async function evaluateProjectBriefDatasetV2(
  input: ProjectBriefEvalManifestV2,
): Promise<ProjectBriefEvalResultV2> {
  const manifest = parseManifest(input);
  const syntheticCases = manifest.cases.filter((item): item is ProjectBriefEvalCase =>
    item.contractVersion === projectBriefEvalCaseContractVersion);
  const historicalCases = manifest.cases.filter((item): item is HistoricalBriefEvalCase =>
    item.contractVersion === historicalBriefEvalCaseContractVersion);
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
  const expectedOutcomesMatched = cases.filter(({ expectationMatched }) => expectationMatched).length;
  const reasons: Array<
    "dataset_fingerprint_mismatch" | "historical_trust_invalid"
    | "historical_evidence_boundary_unresolved"
    | "case_expectation_mismatch" | "included_case_total_out_of_range"
    | "synthetic_contract_total_out_of_range" | "human_confirmed_historical_below_minimum"
  > = [];
  if (fingerprintProjectBriefEvalManifestV2Input(manifest.fingerprintInput)
      !== manifest.datasetFingerprint) reasons.push("dataset_fingerprint_mismatch");
  if (historicalResults.some(({ expectationMatched }) => !expectationMatched)) {
    reasons.push("historical_trust_invalid");
  }
  if (historicalResults.some(({ checks }) =>
    checks.evidenceValidity.reasonCode === "historical_fact_evidence_unavailable")) {
    reasons.push("historical_evidence_boundary_unresolved");
  }
  if (historicalResults.some(({ checks }) =>
    checks.timeRange.reasonCode === "historical_time_range_unresolved")
    && !reasons.includes("historical_evidence_boundary_unresolved")) {
    reasons.push("historical_evidence_boundary_unresolved");
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
    contractVersion: projectBriefEvalResultV2ContractVersion,
    datasetFingerprint: manifest.datasetFingerprint,
    caseCounts: { ...manifest.counts, expectedOutcomesMatched },
    cases,
    releaseGate: reasons.length === 0 ? "passed" as const
      : reasons.some((reason) => reason.includes("mismatch") || reason === "historical_trust_invalid")
        ? "failed" as const : "blocked" as const,
    blockedReasons: reasons,
  };
  const result = resultSchema.safeParse({
    ...withoutFingerprint,
    resultFingerprint: fingerprintEvalValue(withoutFingerprint),
  });
  if (!result.success) throw new Error("project_brief_eval_result_v2_invalid");
  return result.data;
}
