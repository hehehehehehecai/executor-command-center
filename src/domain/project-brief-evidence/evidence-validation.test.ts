import { describe, expect, it } from "vitest";

import {
  ProjectBriefEvidenceValidationError,
  projectBriefEvidenceValidationContractVersion,
  projectBriefEvidenceValidationErrorCodes,
  projectBriefEvidenceValidationErrorPriority,
} from "./evidence-validation";

describe("project-brief-evidence-validation.v1", () => {
  it("[phase6-C01] exposes the frozen version, error taxonomy, and priority", () => {
    expect(projectBriefEvidenceValidationContractVersion).toBe(
      "project-brief-evidence-validation.v1",
    );
    expect(projectBriefEvidenceValidationErrorCodes).toEqual([
      "evidence_source_not_found",
      "evidence_wrong_user",
      "evidence_wrong_project",
      "evidence_outside_period",
      "evidence_permission_revoked",
      "evidence_document_sha_mismatch",
      "evidence_fingerprint_mismatch",
      "evidence_artifact_invalid",
    ]);
    expect(projectBriefEvidenceValidationErrorPriority).toEqual([
      "evidence_artifact_invalid",
      "evidence_wrong_user",
      "evidence_wrong_project",
      "evidence_permission_revoked",
      "evidence_fingerprint_mismatch",
      "evidence_source_not_found",
      "evidence_outside_period",
      "evidence_document_sha_mismatch",
    ]);
  });

  it("[phase6-C02] serializes only a stable code and name", () => {
    const error = new ProjectBriefEvidenceValidationError(
      "evidence_source_not_found",
    );

    expect(JSON.stringify(error)).toBe(
      '{"code":"evidence_source_not_found","name":"ProjectBriefEvidenceValidationError"}',
    );
  });
});
