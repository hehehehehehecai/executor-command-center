import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseProjectBriefEvalCase,
  projectBriefEvalCaseContractVersion,
} from "./project-brief-eval-contracts";
import {
  historicalBriefArtifactContractVersion,
  historicalBriefConversionContractVersion,
  historicalBriefEvalCaseContractVersion,
  historicalBriefMappingVersion,
  parseHistoricalBriefConversionAttestation,
  parseHistoricalBriefEvalCase,
} from "./project-brief-eval-historical-contracts";
import {
  convertHistoricalBriefSource,
  loadRegisteredHistoricalBriefCase,
  parseHistoricalBriefSource,
  verifyHistoricalBriefReceipt,
} from "./project-brief-eval-historical-converter";
import {
  getTrustedHistoricalBriefSource,
  historicalBriefSourceRegistry,
  historicalBriefSourceRegistryVersion,
} from "./project-brief-eval-historical-registry";
import {
  evaluateProjectBriefDatasetV2,
  fingerprintProjectBriefEvalManifestV2Input,
  loadProjectBriefEvalManifestV2,
  projectBriefEvalDatasetV2CaseIds,
  projectBriefEvalDatasetV2ProfileVersion,
  projectBriefEvalManifestV2ContractVersion,
  projectBriefEvalResultV2ContractVersion,
} from "./project-brief-eval-v2";
import { createSyntheticEvalCaseInput } from "./project-brief-eval-synthetic-cases";
import {
  fingerprintEvalCaseContent,
  fingerprintEvalCaseSubject,
} from "./project-brief-eval-fingerprint";
import {
  projectBriefEvalV2CaseProfileVersion,
  projectBriefEvalV2CaseRegistry,
} from "./project-brief-eval-v2-case-registry";

const expectedSources = [
  {
    caseId: "eval-hist-01-explorer",
    documentSha256: "2822254a3603b8248a7b2537cc48f2e2076ea0c35dafa99b9573ddd3125aa8c0",
    sectionCount: 12,
    factCount: 21,
    unknownCount: 4,
  },
  {
    caseId: "eval-hist-02-idea-graveyard",
    documentSha256: "b31f7bfafd8b81ed590a4db9cccefe5b935772eeef97b70ad8d0240f4fe1fd8f",
    sectionCount: 13,
    factCount: 18,
    unknownCount: 5,
  },
  {
    caseId: "eval-hist-03-brave-tavern",
    documentSha256: "ee15a77769d4e35abc08b1a05bafdcf2275af9514baab3733ebb25c7e357ec77",
    sectionCount: 13,
    factCount: 15,
    unknownCount: 4,
  },
  {
    caseId: "eval-hist-04-parallelmail",
    documentSha256: "39d72696094ab2f3c415be4ef545ba0cd40e01174d9c320e40b02e6f7bf65b10",
    sectionCount: 13,
    factCount: 17,
    unknownCount: 5,
  },
] as const;

describe("Project Brief historical artifact v2", () => {
  it("freezes v2 separately while preserving the v1 acceptance boundary", async () => {
    expect(projectBriefEvalCaseContractVersion).toBe("project-brief-eval-case.v1");
    expect(historicalBriefArtifactContractVersion).toBe(
      "project-brief-eval-historical-brief-artifact.v1",
    );
    expect(historicalBriefConversionContractVersion).toBe(
      "project-brief-eval-historical-brief-conversion.v1",
    );
    expect(historicalBriefEvalCaseContractVersion).toBe("project-brief-eval-case.v2");
    expect(historicalBriefMappingVersion).toBe("project-brief-historical-mapping.v1");
    expect(projectBriefEvalManifestV2ContractVersion).toBe("project-brief-eval-manifest.v2");
    expect(projectBriefEvalResultV2ContractVersion).toBe("project-brief-eval-result.v2");
    expect(projectBriefEvalDatasetV2ProfileVersion).toBe("project-brief-eval-dataset.v2");
    expect(projectBriefEvalV2CaseProfileVersion).toBe("project-brief-eval-case-profile.v2");

    const synthetic = await createSyntheticEvalCaseInput("valid-complete");
    expect(parseProjectBriefEvalCase(synthetic).contractVersion).toBe(
      "project-brief-eval-case.v1",
    );
    expect(() => parseProjectBriefEvalCase({
      ...synthetic,
      sourceMode: "historical_brief_artifact",
    })).toThrow("project_brief_eval_case_invalid");
  });

  it("keeps four exact source hashes in an immutable registry independent of Case output", () => {
    expect(historicalBriefSourceRegistryVersion).toBe(
      "project-brief-eval-historical-source-registry.v1",
    );
    expect(historicalBriefSourceRegistry.map(({ caseId, documentSha256 }) => ({
      caseId,
      documentSha256,
    }))).toEqual(expectedSources.map(({ caseId, documentSha256 }) => ({
      caseId,
      documentSha256,
    })));
    expect(Object.isFrozen(historicalBriefSourceRegistry)).toBe(true);
    expect(Object.isFrozen(historicalBriefSourceRegistry[0])).toBe(true);
    expect(Object.isFrozen(historicalBriefSourceRegistry[0]!.receipt)).toBe(true);
    expect(Object.isFrozen(historicalBriefSourceRegistry[0]!.receipt.scopes)).toBe(true);
    expect("outputCaseFingerprint" in historicalBriefSourceRegistry[0]!).toBe(false);
  });

  it.each(expectedSources)(
    "converts $caseId deterministically without partial section or fact projection",
    async ({ caseId, sectionCount, factCount, unknownCount }) => {
      const first = await loadRegisteredHistoricalBriefCase(caseId);
      const second = await loadRegisteredHistoricalBriefCase(caseId);
      expect(first).toEqual(second);
      expect(first.contentFingerprint).toBe(second.contentFingerprint);
      expect(first.projection.sections).toHaveLength(sectionCount);
      expect(first.projection.facts).toHaveLength(factCount);
      expect(first.projection.unknowns).toHaveLength(unknownCount);
      expect(first.projection.sectionOrder).toContain("Freshness");
      expect(first.projection.sectionOrder).toContain("Boundary Note");
      expect(first.projection.sectionOrder).toContain("Evidence Refs");
      expect(first.projection.boundaryNote.length).toBeGreaterThan(0);
      expect(first.projection.facts.every(({ evidenceIds }) =>
        evidenceIds.every((id) => /^E-\d{3}$/.test(id)))).toBe(true);
      const factsWithoutEvidence = first.projection.facts.filter(({ evidenceIds }) =>
        evidenceIds.length === 0).map(({ section, ordinal }) => ({ section, ordinal }));
      expect(factsWithoutEvidence).toEqual(caseId === "eval-hist-01-explorer"
        ? [{ section: "Ongoing Work", ordinal: 3 }]
        : []);
      expect(first.sourceArtifact).not.toHaveProperty("snapshot");
      expect(first.sourceArtifact).not.toHaveProperty("freshness");
      expect(first.sourceArtifact).not.toHaveProperty("decisionAvailability");
      expect(parseHistoricalBriefEvalCase(first)).toEqual(first);
    },
  );

  it("rejects a one-byte source mutation before conversion", async () => {
    const trusted = getTrustedHistoricalBriefSource("eval-hist-01-explorer");
    const bytes = await readFile(trusted.fixturePath);
    const mutated = Buffer.concat([bytes, Buffer.from(" ")]);
    await expect(convertHistoricalBriefSource({
      caseId: trusted.caseId,
      sourceBytes: mutated,
    })).rejects.toThrow("historical_brief_source_fingerprint_mismatch");
  });

  it("rejects receipt drift independently from conversion attestation", async () => {
    const trusted = getTrustedHistoricalBriefSource("eval-hist-02-idea-graveyard");
    const parsed = parseHistoricalBriefSource(await readFile(trusted.fixturePath));
    expect(() => verifyHistoricalBriefReceipt(trusted.caseId, {
      ...parsed,
      receipt: { ...parsed.receipt, confirmerId: "project-owner:wrong" },
    })).toThrow("historical_brief_confirmation_invalid");
    expect(() => verifyHistoricalBriefReceipt(trusted.caseId, {
      ...parsed,
      receipt: { ...parsed.receipt, confirmerRole: "converter" },
    })).toThrow("historical_brief_confirmation_invalid");
    expect(() => verifyHistoricalBriefReceipt(trusted.caseId, {
      ...parsed,
      receipt: { ...parsed.receipt, confirmedAt: "2026-08-20" },
    })).toThrow("historical_brief_confirmation_invalid");
    const invalidScope = structuredClone(parsed);
    Reflect.set(invalidScope.receipt, "scopes", ["readability"]);
    expect(() => verifyHistoricalBriefReceipt(
      trusted.caseId,
      invalidScope,
    )).toThrow("historical_brief_confirmation_invalid");

    const converted = await loadRegisteredHistoricalBriefCase(trusted.caseId);
    expect(() => parseHistoricalBriefEvalCase({
      ...converted,
      converterTrusted: true,
    })).toThrow("historical_brief_case_invalid");
    expect(() => parseHistoricalBriefConversionAttestation(
      converted.humanConfirmationReceipt,
    )).toThrow("historical_brief_conversion_invalid");
  });

  it("preserves unknowns and source time expressions without fabricating production metadata", async () => {
    const explorer = await loadRegisteredHistoricalBriefCase("eval-hist-01-explorer");
    expect(explorer.projection.timeExpression).toContain("精确 UTC 时间待确认");
    expect(explorer.projection.unknowns.some(({ text }) =>
      text.includes("最终时间点和证据组合尚未确认"))).toBe(true);
    expect(explorer.projection.facts.some(({ text }) =>
      text.includes("最终时间点和证据组合尚未确认"))).toBe(false);
    expect(JSON.stringify(explorer)).not.toContain("coverageComplete");
    expect(JSON.stringify(explorer)).not.toContain("authorizationStatus");

    const brave = await loadRegisteredHistoricalBriefCase("eval-hist-03-brave-tavern");
    expect(brave.sourceArtifact.documentBriefId).toBe(
      "brave-tavern-current-20260819T155616Z",
    );
    expect(brave.humanConfirmationReceipt.briefId).toBe(
      "brave-tavern-current-2026-08-19",
    );
  });
});

describe("Project Brief Eval v2 dataset", () => {
  it("loads 10 synthetic plus 4 trusted historical cases with a stable fingerprint", async () => {
    const first = await loadProjectBriefEvalManifestV2();
    const second = await loadProjectBriefEvalManifestV2();
    expect(first).toEqual(second);
    expect(first.counts).toEqual({
      includedTotal: 14,
      syntheticContract: 10,
      humanConfirmedHistorical: 4,
      pendingHumanConfirmation: 0,
    });
    expect(first.cases.map(({ caseId }) => caseId)).toEqual(projectBriefEvalDatasetV2CaseIds);
    expect(first.fingerprintInput.cases).toEqual(projectBriefEvalV2CaseRegistry);
    expect(Object.isFrozen(projectBriefEvalV2CaseRegistry)).toBe(true);
    expect(Object.isFrozen(projectBriefEvalV2CaseRegistry[0])).toBe(true);
    expect(first.datasetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first.datasetFingerprint).toBe(
      "49e91aed2c4b70f3eb37df0d8cc48dd2610be56b490c172b17683a72bfb4c6e0",
    );
    expect(fingerprintProjectBriefEvalManifestV2Input({
      ...first.fingerprintInput,
      historicalMappingVersion: "project-brief-historical-mapping.v2",
    })).not.toBe(first.datasetFingerprint);

    const truncated = structuredClone(first);
    truncated.cases.splice(-2);
    truncated.fingerprintInput.cases.splice(-2);
    truncated.counts.includedTotal = truncated.cases.length;
    truncated.counts.syntheticContract -= 2;
    truncated.datasetFingerprint = fingerprintProjectBriefEvalManifestV2Input(
      truncated.fingerprintInput,
    );
    await expect(evaluateProjectBriefDatasetV2(truncated)).rejects.toThrow(
      "project_brief_eval_manifest_v2_invalid",
    );

    const replaced = structuredClone(first);
    const synthetic = replaced.cases.find(({ caseId }) =>
      caseId === "eval-syn-01-valid-complete");
    if (synthetic === undefined || synthetic.contractVersion !== projectBriefEvalCaseContractVersion) {
      throw new Error("test_fixture_missing");
    }
    synthetic.title = "weakened replacement";
    synthetic.confirmationSubjectFingerprint = fingerprintEvalCaseSubject(synthetic);
    synthetic.contentFingerprint = fingerprintEvalCaseContent(synthetic);
    const summary = replaced.fingerprintInput.cases.find(({ caseId }) =>
      caseId === synthetic.caseId);
    if (summary === undefined) throw new Error("test_fixture_missing");
    summary.contentFingerprint = synthetic.contentFingerprint;
    replaced.datasetFingerprint = fingerprintProjectBriefEvalManifestV2Input(
      replaced.fingerprintInput,
    );
    await expect(evaluateProjectBriefDatasetV2(replaced)).rejects.toThrow(
      "project_brief_eval_manifest_v2_invalid",
    );
  });

  it("keeps the dataset blocked on the honest Evidence boundary and scopes synthetic review", async () => {
    const result = await evaluateProjectBriefDatasetV2(
      await loadProjectBriefEvalManifestV2(),
    );
    expect(result.releaseGate).toBe("blocked");
    expect(result.blockedReasons).toEqual([
      "historical_evidence_boundary_unresolved",
    ]);
    expect(result.resultFingerprint).toBe(
      "724d4cb66a876e7406ac8d37c7f6014893f4a5b965df87e1d292ecbca42b4b3a",
    );
    expect(result.caseCounts).toEqual({
      includedTotal: 14,
      syntheticContract: 10,
      humanConfirmedHistorical: 4,
      pendingHumanConfirmation: 0,
      expectedOutcomesMatched: 14,
    });
    const synthetic = result.cases.find(({ caseId }) =>
      caseId === "eval-syn-01-valid-complete");
    expect(synthetic?.readability.human).toEqual({
      status: "not_applicable",
      reasonCode: "synthetic_human_readability_not_applicable",
    });
    const historical = result.cases.filter(({ caseType }) =>
      caseType === "human_confirmed_historical");
    expect(historical).toHaveLength(4);
    const explorer = historical.find(({ caseId }) => caseId === "eval-hist-01-explorer");
    expect(explorer?.checks.evidenceValidity).toEqual({
      status: "blocked",
      reasonCode: "historical_fact_evidence_unavailable",
    });
    expect(explorer?.checks.timeRange).toEqual({
      status: "blocked",
      reasonCode: "historical_time_range_unresolved",
    });
    expect(explorer?.expectedValidity).toBe("blocked");
    expect(explorer?.actualValidity).toBe("blocked");
    expect(explorer?.expectationMatched).toBe(true);
    expect(historical.filter(({ caseId }) => caseId !== "eval-hist-01-explorer")
      .every(({ checks }) => Object.values(checks).every(({ status }) => status === "pass")))
      .toBe(true);
  });

  it("rejects conversion output tampering even when stored fingerprint fields are unchanged", async () => {
    const manifest = await loadProjectBriefEvalManifestV2();
    const tampered = structuredClone(manifest);
    const historical = tampered.cases.find(({ caseId }) => caseId === "eval-hist-02-idea-graveyard");
    if (historical === undefined || historical.contractVersion !== historicalBriefEvalCaseContractVersion) {
      throw new Error("test_fixture_missing");
    }
    historical.title = "tampered historical title";
    const result = await evaluateProjectBriefDatasetV2(tampered);
    expect(result.releaseGate).toBe("failed");
    expect(result.blockedReasons).toContain("historical_trust_invalid");
    expect(result.blockedReasons).toContain("case_expectation_mismatch");
  });

  it("keeps the v2 report free of source prose, paths and receipt identifiers", async () => {
    const result = await evaluateProjectBriefDatasetV2(
      await loadProjectBriefEvalManifestV2(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/candidateBrief|canonicalPayload|sourceDocument|fixturePath/i);
    expect(serialized).not.toContain("项目所有者／最终确认人");
    expect(serialized).not.toContain("review-receipt:");
    expect(result.resultFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
