import { describe, expect, it } from "vitest";

import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";

import { evaluateProjectBriefDataset } from "./project-brief-eval-harness";
import {
  loadSyntheticProjectBriefEvalManifest,
  syntheticProjectBriefEvalCoverage,
} from "./project-brief-eval-synthetic-cases";

describe("Project Brief synthetic Eval dataset", () => {
  it("contains ten independent synthetic Contract Cases in stable ID order", async () => {
    const manifest = await loadSyntheticProjectBriefEvalManifest();
    expect(manifest.cases).toHaveLength(10);
    expect(manifest.cases.map(({ caseId }) => caseId)).toEqual([
      "eval-syn-01-valid-complete",
      "eval-syn-02-valid-unknown",
      "eval-syn-03-schema-extra-field",
      "eval-syn-04-evidence-not-found",
      "eval-syn-05-evidence-cross-project",
      "eval-syn-06-time-outside-range",
      "eval-syn-07-required-fact-missing",
      "eval-syn-08-forbidden-assertion",
      "eval-syn-09-unknown-leaked-as-fact",
      "eval-syn-10-readability-placeholder",
    ]);
    expect(syntheticProjectBriefEvalCoverage).toEqual([
      "valid_complete",
      "valid_unknown",
      "schema_extra_field",
      "evidence_not_found",
      "evidence_cross_project",
      "time_outside_range",
      "required_fact_missing",
      "forbidden_assertion",
      "unknown_leaked_as_fact",
      "readability_proxy_failure",
    ]);
  });

  it("binds every Case and the manifest to stable SHA-256 fingerprints", async () => {
    const first = await loadSyntheticProjectBriefEvalManifest();
    const second = await loadSyntheticProjectBriefEvalManifest();
    expect(first.datasetFingerprint).toBe(second.datasetFingerprint);
    expect(first.datasetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    for (const item of first.cases) {
      expect(item.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(item.source.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("binds the machine-readable result to a stable SHA-256 fingerprint", async () => {
    const manifest = await loadSyntheticProjectBriefEvalManifest();
    const dependencies = { fingerprint: new NodeProjectBriefEvidenceFingerprint() };
    const first = await evaluateProjectBriefDataset(manifest, dependencies);
    const second = await evaluateProjectBriefDataset(manifest, dependencies);
    expect(first.resultFingerprint).toBe(second.resultFingerprint);
    expect(first.resultFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not invent historical or pending Cases and therefore remains blocked", async () => {
    const manifest = await loadSyntheticProjectBriefEvalManifest();
    expect(manifest.counts).toEqual({
      includedTotal: 10,
      syntheticContract: 10,
      humanConfirmedHistorical: 0,
      pendingHumanConfirmation: 0,
    });
    expect(manifest.pendingCandidates).toEqual([]);
    const result = await evaluateProjectBriefDataset(manifest, {
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });
    expect(result.releaseGate).toBe("blocked");
  });
});
