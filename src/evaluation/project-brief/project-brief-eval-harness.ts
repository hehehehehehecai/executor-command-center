import { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import type { ProjectBriefEvidenceFingerprint } from "@/application/project-brief-evidence/project-brief-evidence-ports";
import { ProjectBriefEvidenceValidationError } from "@/domain/project-brief-evidence/evidence-validation";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";

import {
  parseProjectBriefEvalManifest,
  parseProjectBriefEvalResult,
  projectBriefEvalResultContractVersion,
  type ProjectBriefEvalCase,
  type ProjectBriefEvalCheckResult,
  type ProjectBriefEvalManifest,
  type ProjectBriefEvalResult,
} from "./project-brief-eval-contracts";
import {
  fingerprintEvalCaseContent,
  fingerprintEvalCaseSubject,
  fingerprintEvalValue,
} from "./project-brief-eval-fingerprint";

export interface ProjectBriefEvalReviewVerifier {
  verifyHistoricalConfirmation(input: {
    readonly caseId: string;
    readonly subjectFingerprint: string;
    readonly receipt: NonNullable<ProjectBriefEvalCase["confirmationReceipt"]>;
  }): Promise<boolean>;
  verifyReadabilityReview(input: {
    readonly caseId: string;
    readonly subjectFingerprint: string;
    readonly review: NonNullable<ProjectBriefEvalCase["readabilityReview"]>;
  }): Promise<boolean>;
}

const pass = (reasonCode: string): ProjectBriefEvalCheckResult => ({
  status: "pass", reasonCode,
});
const fail = (reasonCode: string): ProjectBriefEvalCheckResult => ({
  status: "fail", reasonCode,
});
const blocked = (reasonCode: string): ProjectBriefEvalCheckResult => ({
  status: "blocked", reasonCode,
});

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function factTexts(brief: ProjectBrief): string[] {
  return [
    brief.summary.text,
    ...brief.completedChanges.map(({ text }) => text),
    ...brief.ongoingWork.map(({ text }) => text),
    ...brief.openItems.map(({ text }) => text),
    ...brief.riskSignals.map(({ text }) => text),
  ];
}

function resolveFactLocation(brief: ProjectBrief, location: string): string | null {
  if (location === "summary") return brief.summary.text;
  if (location === "officialStatus") return brief.officialStatus.value;
  const separator = location.indexOf(":");
  if (separator < 1) return null;
  const section = location.slice(0, separator) as
    | "completedChanges" | "ongoingWork" | "openItems" | "riskSignals";
  const itemId = location.slice(separator + 1);
  if (!["completedChanges", "ongoingWork", "openItems", "riskSignals"].includes(section)) {
    return null;
  }
  return brief[section].find(({ id }) => id === itemId)?.text ?? null;
}

function checkRequiredFacts(brief: ProjectBrief, item: ProjectBriefEvalCase) {
  return item.requiredFacts.every(({ location }) => resolveFactLocation(brief, location) !== null)
    ? pass("required_facts_present")
    : fail("required_fact_missing");
}

function tokenSequenceMatch(text: string, pattern: string): boolean {
  const tokens = normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  const expected = normalizeText(pattern).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (expected.length === 0 || expected.length > tokens.length) return false;
  return tokens.some((_, index) =>
    expected.every((token, offset) => tokens[index + offset] === token));
}

function checkForbiddenAssertions(brief: ProjectBrief, item: ProjectBriefEvalCase) {
  const texts = factTexts(brief);
  const found = item.forbiddenAssertions.some(({ match }) => texts.some((text) =>
    match.kind === "exact_normalized"
      ? normalizeText(text) === normalizeText(match.value)
      : tokenSequenceMatch(text, match.value)));
  return found
    ? fail("forbidden_assertion_present")
    : pass("forbidden_assertions_absent");
}

function checkUnknownHandling(brief: ProjectBrief, item: ProjectBriefEvalCase) {
  const byId = new Map(brief.unknowns.map((unknown) => [unknown.id, unknown]));
  const facts = new Set(factTexts(brief).map(normalizeText));
  const invalid = item.expectedUnknowns.some(({ unknownId, text }) => {
    const unknown = byId.get(unknownId);
    return unknown === undefined
      || normalizeText(unknown.text) !== normalizeText(text)
      || facts.has(normalizeText(text));
  });
  return invalid
    ? fail("unknown_asserted_as_fact")
    : pass("unknown_handling_valid");
}

function checkReadabilityProxy(brief: ProjectBrief) {
  const texts = factTexts(brief);
  const placeholder = /\b(?:todo|tbd|fixme|lorem ipsum)\b|待补充|占位符/iu;
  const normalized = texts.map(normalizeText);
  const hasDuplicate = new Set(normalized).size !== normalized.length;
  return texts.some((text) => placeholder.test(text)) || hasDuplicate
    ? fail("readability_proxy_failed")
    : pass("readability_proxy_valid");
}

function expectedStatusesMatch(
  item: ProjectBriefEvalCase,
  observed: {
    schema: ProjectBriefEvalCheckResult;
    evidenceValidity: ProjectBriefEvalCheckResult;
    timeRange: ProjectBriefEvalCheckResult;
    requiredFacts: ProjectBriefEvalCheckResult;
    forbiddenAssertions: ProjectBriefEvalCheckResult;
    unknownHandling: ProjectBriefEvalCheckResult;
    readabilityAutomatic: ProjectBriefEvalCheckResult;
    readabilityHuman: ProjectBriefEvalCheckResult;
  },
  actualValidity: "valid" | "invalid",
): boolean {
  return actualValidity === item.expectedValidity
    && Object.entries(item.expectedChecks).every(([key, expected]) =>
      observed[key as keyof typeof observed].status === expected);
}

function datasetFingerprint(manifest: ProjectBriefEvalManifest): string {
  return fingerprintEvalValue({
    contractVersion: manifest.contractVersion,
    caseContractVersion: manifest.caseContractVersion,
    resultContractVersion: manifest.resultContractVersion,
    promptVersion: manifest.promptVersion,
    schemaVersion: manifest.schemaVersion,
    cases: manifest.cases.map(({ caseId, contentFingerprint: fingerprint }) => ({
      caseId, contentFingerprint: fingerprint,
    })),
    pendingCandidates: manifest.pendingCandidates,
  });
}

export async function evaluateProjectBriefDataset(
  input: ProjectBriefEvalManifest,
  dependencies: {
    readonly fingerprint: ProjectBriefEvidenceFingerprint;
    readonly reviewVerifier?: ProjectBriefEvalReviewVerifier;
  },
): Promise<ProjectBriefEvalResult> {
  const manifest = parseProjectBriefEvalManifest(input);
  const validator = new ValidateProjectBriefEvidenceUseCase(dependencies);
  const contentFingerprintMismatches = new Set(
    manifest.cases
      .filter((item) => fingerprintEvalCaseContent(item) !== item.contentFingerprint)
      .map(({ caseId }) => caseId),
  );
  const subjectFingerprintMismatches = new Set(
    manifest.cases
      .filter((item) =>
        fingerprintEvalCaseSubject(item) !== item.confirmationSubjectFingerprint)
      .map(({ caseId }) => caseId),
  );
  let historicalConfirmationInvalid = false;
  const cases = [] as ProjectBriefEvalResult["cases"] extends readonly (infer T)[] ? T[] : never[];

  for (const item of manifest.cases) {
    let brief: ProjectBrief | null = null;
    let schema = pass("schema_valid");
    try {
      brief = parseProjectBrief(item.candidateBrief);
    } catch {
      schema = fail("schema_invalid");
    }

    let evidenceValidity = blocked("evidence_schema_precondition_failed");
    let timeRange = blocked("time_range_schema_precondition_failed");
    let evidenceFailureCode: string | null = null;
    if (brief !== null) {
      try {
        await validator.execute({
          actorUserId: item.artifact.snapshot.userId as string,
          projectId: item.artifact.snapshot.projectId as string,
          brief,
          artifact: item.artifact as never,
        });
        evidenceValidity = pass("evidence_valid");
        timeRange = pass("time_range_valid");
      } catch (error) {
        evidenceFailureCode = error instanceof ProjectBriefEvidenceValidationError
          ? error.code
          : "evidence_artifact_invalid";
        evidenceValidity = fail(evidenceFailureCode);
        timeRange = evidenceFailureCode === "evidence_outside_period"
          ? fail("evidence_outside_period")
          : blocked("time_range_evidence_precondition_failed");
      }
    }

    const requiredFacts = brief === null
      ? blocked("required_facts_schema_precondition_failed")
      : checkRequiredFacts(brief, item);
    const forbiddenAssertions = brief === null
      ? blocked("forbidden_assertions_schema_precondition_failed")
      : checkForbiddenAssertions(brief, item);
    const unknownHandling = brief === null
      ? blocked("unknown_handling_schema_precondition_failed")
      : checkUnknownHandling(brief, item);
    const readabilityAutomatic = brief === null
      ? blocked("readability_schema_precondition_failed")
      : checkReadabilityProxy(brief);
    let historicalConfirmationTrusted = item.caseType === "synthetic_contract";
    if (item.caseType === "human_confirmed_historical") {
      historicalConfirmationTrusted = item.confirmationReceipt !== null
        && dependencies.reviewVerifier !== undefined
        && await dependencies.reviewVerifier.verifyHistoricalConfirmation({
          caseId: item.caseId,
          subjectFingerprint: item.confirmationSubjectFingerprint,
          receipt: item.confirmationReceipt,
        });
      if (!historicalConfirmationTrusted) historicalConfirmationInvalid = true;
    }
    let readabilityTrusted = false;
    if (item.caseType === "human_confirmed_historical") {
      readabilityTrusted = historicalConfirmationTrusted
        && item.confirmationReceipt?.scopes.includes("readability") === true;
    } else if (item.readabilityReview !== null && dependencies.reviewVerifier !== undefined) {
      readabilityTrusted = await dependencies.reviewVerifier.verifyReadabilityReview({
        caseId: item.caseId,
        subjectFingerprint: item.confirmationSubjectFingerprint,
        review: item.readabilityReview,
      });
    }
    const readabilityHuman = readabilityTrusted
      ? pass("readability_human_confirmed")
      : blocked("readability_human_confirmation_missing");
    const humanReadabilityCheck = readabilityAutomatic.status === "fail"
      ? readabilityAutomatic
      : readabilityHuman;
    const hardChecks = [
      schema, evidenceValidity, timeRange, requiredFacts,
      forbiddenAssertions, unknownHandling, readabilityAutomatic,
    ];
    const actualValidity = hardChecks.every(({ status }) => status === "pass")
      ? "valid" as const
      : "invalid" as const;
    const expectationMatched = !contentFingerprintMismatches.has(item.caseId)
      && !subjectFingerprintMismatches.has(item.caseId)
      && historicalConfirmationTrusted
      && expectedStatusesMatch(item, {
        schema,
        evidenceValidity,
        timeRange,
        requiredFacts,
        forbiddenAssertions,
        unknownHandling,
        readabilityAutomatic,
        readabilityHuman,
      }, actualValidity);

    cases.push({
      caseId: item.caseId,
      caseType: item.caseType,
      expectedValidity: item.expectedValidity,
      actualValidity,
      expectationMatched,
      checks: {
        schema,
        evidenceValidity,
        timeRange,
        requiredFacts,
        forbiddenAssertions,
        unknownHandling,
        humanReadability: humanReadabilityCheck,
      },
      readability: { automatic: readabilityAutomatic, human: readabilityHuman },
    });
  }

  const expectedOutcomesMatched = cases.filter(({ expectationMatched }) => expectationMatched).length;
  const fingerprintMatches = datasetFingerprint(manifest) === manifest.datasetFingerprint;
  const failedReasons: string[] = [];
  if (!fingerprintMatches) failedReasons.push("dataset_fingerprint_mismatch");
  if (historicalConfirmationInvalid) failedReasons.push("historical_confirmation_invalid");
  if (expectedOutcomesMatched !== cases.length) failedReasons.push("case_expectation_mismatch");

  const blockedReasons: string[] = [];
  if (manifest.counts.includedTotal < 12 || manifest.counts.includedTotal > 15) {
    blockedReasons.push("included_case_total_out_of_range");
  }
  if (manifest.counts.syntheticContract < 8 || manifest.counts.syntheticContract > 10) {
    blockedReasons.push("synthetic_contract_total_out_of_range");
  }
  if (manifest.counts.humanConfirmedHistorical < 4) {
    blockedReasons.push("human_confirmed_historical_below_minimum");
  }
  if (cases.some(({ readability }) => readability.human.status !== "pass")) {
    blockedReasons.push("readability_human_confirmation_missing");
  }

  const resultWithoutFingerprint = {
    contractVersion: projectBriefEvalResultContractVersion,
    datasetFingerprint: manifest.datasetFingerprint,
    caseCounts: {
      ...manifest.counts,
      expectedOutcomesMatched,
    },
    cases,
    releaseGate: failedReasons.length > 0
      ? "failed"
      : blockedReasons.length > 0 ? "blocked" : "passed",
    blockedReasons: failedReasons.length > 0 ? [...failedReasons, ...blockedReasons] : blockedReasons,
  };
  return parseProjectBriefEvalResult({
    ...resultWithoutFingerprint,
    resultFingerprint: fingerprintEvalValue(resultWithoutFingerprint),
  });
}
