import { describe, expect, it } from "vitest";

import {
  parseProjectBriefEvalCase,
  parseProjectBriefEvalManifest,
  projectBriefEvalCaseContractVersion,
  projectBriefEvalManifestContractVersion,
  projectBriefEvalResultContractVersion,
} from "./project-brief-eval-contracts";
import { fingerprintEvalValue } from "./project-brief-eval-fingerprint";
import { createSyntheticEvalCaseInput } from "./project-brief-eval-synthetic-cases";

describe("Project Brief Eval contracts", () => {
  it("rejects unknown Case fields instead of silently widening the contract", async () => {
    const value = await createSyntheticEvalCaseInput("valid-complete");
    expect(() => parseProjectBriefEvalCase({ ...value, unexpected: true })).toThrow(
      "project_brief_eval_case_invalid",
    );
  });

  it("requires a matching confirmation receipt for historical Cases", async () => {
    const synthetic = await createSyntheticEvalCaseInput("valid-complete");
    expect(() => parseProjectBriefEvalCase({
      ...synthetic,
      caseType: "human_confirmed_historical",
      source: {
        provenance: "repository_historical",
        sourceFingerprint: "b".repeat(64),
        redactionStatement: "redacted_no_direct_identifiers",
      },
      confirmationReceipt: null,
    })).toThrow("project_brief_eval_confirmation_invalid");

    expect(() => parseProjectBriefEvalCase({
      ...synthetic,
      caseType: "human_confirmed_historical",
      source: {
        provenance: "repository_historical",
        sourceFingerprint: "b".repeat(64),
        redactionStatement: "redacted_no_direct_identifiers",
      },
      confirmationReceipt: {
        confirmerId: "reviewer-role-01",
        confirmerRole: "project_owner",
        confirmedAt: "2026-08-18T08:00:00.000Z",
        caseId: synthetic.caseId,
        subjectFingerprint: synthetic.confirmationSubjectFingerprint,
        scopes: ["source_and_redaction", "readability", "expected_outcomes"],
        sourceFingerprint: "c".repeat(64),
      },
    })).toThrow("project_brief_eval_confirmation_invalid");
  });

  it("rejects duplicate or unsorted manifest Case IDs and dishonest counts", async () => {
    const first = parseProjectBriefEvalCase(
      await createSyntheticEvalCaseInput("valid-complete"),
    );
    const manifest = {
      contractVersion: projectBriefEvalManifestContractVersion,
      caseContractVersion: projectBriefEvalCaseContractVersion,
      resultContractVersion: projectBriefEvalResultContractVersion,
      promptVersion: "project-brief-v1",
      schemaVersion: "project-brief-schema-v1",
      cases: [first, first],
      pendingCandidates: [],
      counts: {
        includedTotal: 2,
        syntheticContract: 2,
        humanConfirmedHistorical: 0,
        pendingHumanConfirmation: 0,
      },
      datasetFingerprint: "d".repeat(64),
    };
    expect(() => parseProjectBriefEvalManifest(manifest)).toThrow(
      "project_brief_eval_manifest_invalid",
    );
    expect(() => parseProjectBriefEvalManifest({
      ...manifest,
      cases: [first],
      counts: { ...manifest.counts, includedTotal: 2 },
    })).toThrow("project_brief_eval_manifest_invalid");
  });

  it("canonicalizes object order, Unicode and newlines while preserving array order", () => {
    const left = fingerprintEvalValue({ z: "Cafe\u0301\r\nline", a: ["one", "two"] });
    const right = fingerprintEvalValue({ a: ["one", "two"], z: "Café\nline" });
    const reorderedArray = fingerprintEvalValue({ a: ["two", "one"], z: "Café\nline" });
    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    expect(reorderedArray).not.toBe(left);
  });

  it("fails closed for cyclic or non-plain fingerprint input", () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => fingerprintEvalValue(cyclic)).toThrow(
      "project_brief_eval_fingerprint_invalid",
    );
    expect(() => fingerprintEvalValue(new Date("2026-08-18T00:00:00.000Z"))).toThrow(
      "project_brief_eval_fingerprint_invalid",
    );
  });
});
