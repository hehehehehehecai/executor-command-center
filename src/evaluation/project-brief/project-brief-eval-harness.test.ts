import { describe, expect, it } from "vitest";

import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";

import {
  parseProjectBriefEvalCase,
  parseProjectBriefEvalManifest,
  parseProjectBriefEvalResult,
} from "./project-brief-eval-contracts";
import {
  evaluateProjectBriefDataset,
  type ProjectBriefEvalReviewVerifier,
} from "./project-brief-eval-harness";
import {
  fingerprintEvalCaseContent,
  fingerprintEvalCaseSubject,
  fingerprintEvalValue,
} from "./project-brief-eval-fingerprint";
import {
  loadSyntheticProjectBriefEvalManifest,
} from "./project-brief-eval-synthetic-cases";

const trustedReviewVerifier: ProjectBriefEvalReviewVerifier = {
  async verifyHistoricalConfirmation() { return true; },
  async verifyReadabilityReview() { return true; },
};

async function trustedReleaseManifest() {
  const base = await loadSyntheticProjectBriefEvalManifest();
  const reviewedSynthetic = base.cases.map((original) => {
    const item = structuredClone(original);
    item.expectedChecks.readabilityHuman = "pass";
    item.confirmationSubjectFingerprint = fingerprintEvalCaseSubject(item);
    item.readabilityReview = {
      reviewerId: "trusted-reviewer-01",
      reviewerRole: "eval_reviewer",
      reviewedAt: "2026-08-18T08:00:00.000Z",
      caseId: item.caseId,
      subjectFingerprint: item.confirmationSubjectFingerprint,
      verdict: "readable",
    };
    item.contentFingerprint = fingerprintEvalCaseContent(item);
    return parseProjectBriefEvalCase(item);
  });
  const historical = base.cases.slice(0, 4).map((original, index) => {
    const item = structuredClone(original);
    item.caseId = `eval-hist-0${index + 1}-confirmed`;
    item.caseType = "human_confirmed_historical";
    item.source = {
      provenance: "repository_historical",
      sourceFingerprint: fingerprintEvalValue({ caseId: item.caseId, source: "redacted" }),
      redactionStatement: "redacted_no_direct_identifiers",
    };
    item.expectedChecks.readabilityHuman = "pass";
    item.readabilityReview = null;
    item.confirmationSubjectFingerprint = fingerprintEvalCaseSubject(item);
    item.confirmationReceipt = {
      confirmerId: "trusted-confirmer-01",
      confirmerRole: "project_owner",
      confirmedAt: "2026-08-18T08:00:00.000Z",
      caseId: item.caseId,
      subjectFingerprint: item.confirmationSubjectFingerprint,
      scopes: ["source_and_redaction", "readability", "expected_outcomes"],
      sourceFingerprint: item.source.sourceFingerprint,
    };
    item.contentFingerprint = fingerprintEvalCaseContent(item);
    return parseProjectBriefEvalCase(item);
  });
  const cases = [...historical, ...reviewedSynthetic]
    .sort((left, right) => left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : 0);
  const fingerprintInput = {
    contractVersion: base.contractVersion,
    caseContractVersion: base.caseContractVersion,
    resultContractVersion: base.resultContractVersion,
    promptVersion: base.promptVersion,
    schemaVersion: base.schemaVersion,
    cases: cases.map(({ caseId, contentFingerprint }) => ({ caseId, contentFingerprint })),
    pendingCandidates: [],
  };
  return parseProjectBriefEvalManifest({
    ...fingerprintInput,
    cases,
    counts: {
      includedTotal: 14,
      syntheticContract: 10,
      humanConfirmedHistorical: 4,
      pendingHumanConfirmation: 0,
    },
    datasetFingerprint: fingerprintEvalValue(fingerprintInput),
  });
}

describe("Project Brief Eval harness", () => {
  it("runs all seven checks and reuses the production Evidence Validator", async () => {
    const manifest = await loadSyntheticProjectBriefEvalManifest();
    const result = await evaluateProjectBriefDataset(manifest, {
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });
    const complete = result.cases.find(({ caseId }) => caseId === "eval-syn-01-valid-complete");
    expect(complete?.checks).toEqual({
      schema: { status: "pass", reasonCode: "schema_valid" },
      evidenceValidity: { status: "pass", reasonCode: "evidence_valid" },
      timeRange: { status: "pass", reasonCode: "time_range_valid" },
      requiredFacts: { status: "pass", reasonCode: "required_facts_present" },
      forbiddenAssertions: { status: "pass", reasonCode: "forbidden_assertions_absent" },
      unknownHandling: { status: "pass", reasonCode: "unknown_handling_valid" },
      humanReadability: { status: "blocked", reasonCode: "readability_human_confirmation_missing" },
    });
    expect(complete?.readability).toEqual({
      automatic: { status: "pass", reasonCode: "readability_proxy_valid" },
      human: { status: "blocked", reasonCode: "readability_human_confirmation_missing" },
    });
  });

  it("reports every negative Contract Case per check instead of collapsing to one boolean", async () => {
    const result = await evaluateProjectBriefDataset(
      await loadSyntheticProjectBriefEvalManifest(),
      { fingerprint: new NodeProjectBriefEvidenceFingerprint() },
    );
    const expected: Record<string, [string, string]> = {
      "eval-syn-03-schema-extra-field": ["schema", "schema_invalid"],
      "eval-syn-04-evidence-not-found": ["evidenceValidity", "evidence_source_not_found"],
      "eval-syn-05-evidence-cross-project": ["evidenceValidity", "evidence_wrong_project"],
      "eval-syn-06-time-outside-range": ["timeRange", "evidence_outside_period"],
      "eval-syn-07-required-fact-missing": ["requiredFacts", "required_fact_missing"],
      "eval-syn-08-forbidden-assertion": ["forbiddenAssertions", "forbidden_assertion_present"],
      "eval-syn-09-unknown-leaked-as-fact": ["unknownHandling", "unknown_asserted_as_fact"],
      "eval-syn-10-readability-placeholder": ["humanReadability", "readability_proxy_failed"],
    };
    for (const [caseId, [check, reasonCode]] of Object.entries(expected)) {
      const item = result.cases.find((candidate) => candidate.caseId === caseId);
      expect(item?.checks[check as keyof typeof item.checks]).toMatchObject({ reasonCode });
      expect(item?.expectationMatched).toBe(true);
    }
  });

  it("blocks the dataset when historical and human readability gates are unmet", async () => {
    const result = await evaluateProjectBriefDataset(
      await loadSyntheticProjectBriefEvalManifest(),
      { fingerprint: new NodeProjectBriefEvidenceFingerprint() },
    );
    expect(result.releaseGate).toBe("blocked");
    expect(result.blockedReasons).toEqual([
      "included_case_total_out_of_range",
      "human_confirmed_historical_below_minimum",
      "readability_human_confirmation_missing",
    ]);
    expect(result.caseCounts).toEqual({
      includedTotal: 10,
      syntheticContract: 10,
      humanConfirmedHistorical: 0,
      pendingHumanConfirmation: 0,
      expectedOutcomesMatched: 10,
    });
  });

  it("reaches passed only with trusted historical confirmation and readability review", async () => {
    const result = await evaluateProjectBriefDataset(await trustedReleaseManifest(), {
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
      reviewVerifier: trustedReviewVerifier,
    });
    expect(result.releaseGate).toBe("passed");
    expect(result.blockedReasons).toEqual([]);
    expect(result.caseCounts).toMatchObject({
      includedTotal: 14,
      syntheticContract: 10,
      humanConfirmedHistorical: 4,
      expectedOutcomesMatched: 14,
    });
  });

  it("fails closed when historical receipts lack a trusted verifier", async () => {
    const result = await evaluateProjectBriefDataset(await trustedReleaseManifest(), {
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });
    expect(result.releaseGate).toBe("failed");
    expect(result.blockedReasons).toContain("historical_confirmation_invalid");
  });

  it("fails the release gate when an observed hard check differs from its frozen expectation", async () => {
    const manifest = await loadSyntheticProjectBriefEvalManifest();
    const mutated = structuredClone(manifest);
    mutated.cases[0]!.requiredFacts.push({
      factId: "unrecorded-release",
      location: "completedChanges:unrecorded-release",
    });
    const result = await evaluateProjectBriefDataset(mutated, {
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });
    expect(result.releaseGate).toBe("failed");
    expect(result.blockedReasons).toContain("case_expectation_mismatch");
  });

  it("keeps the machine report free of Brief, Snapshot, Prompt and secret content", async () => {
    const result = await evaluateProjectBriefDataset(
      await loadSyntheticProjectBriefEvalManifest(),
      { fingerprint: new NodeProjectBriefEvidenceFingerprint() },
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/systemPrompt|userPrompt|canonicalPayload|snapshot|candidateBrief/i);
    expect(serialized).not.toContain("synthetic private marker");
  });

  it("rejects a self-consistent fingerprint on a semantically forged Result", async () => {
    const result = await evaluateProjectBriefDataset(
      await loadSyntheticProjectBriefEvalManifest(),
      { fingerprint: new NodeProjectBriefEvidenceFingerprint() },
    );
    const forged = {
      ...result,
      releaseGate: "passed" as const,
      blockedReasons: [],
    };
    const content = Object.fromEntries(
      Object.entries(forged).filter(([key]) => key !== "resultFingerprint"),
    );
    expect(() => parseProjectBriefEvalResult({
      ...forged,
      resultFingerprint: fingerprintEvalValue(content),
    })).toThrow("project_brief_eval_result_invalid");
  });
});
