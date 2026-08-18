export const projectBriefEvidenceValidationContractVersion =
  "project-brief-evidence-validation.v1" as const;

export const projectBriefEvidenceValidationErrorCodes = [
  "evidence_source_not_found",
  "evidence_wrong_user",
  "evidence_wrong_project",
  "evidence_outside_period",
  "evidence_permission_revoked",
  "evidence_document_sha_mismatch",
  "evidence_fingerprint_mismatch",
  "evidence_artifact_invalid",
] as const;
export type ProjectBriefEvidenceErrorCode =
  (typeof projectBriefEvidenceValidationErrorCodes)[number];

export const projectBriefEvidenceValidationErrorPriority = [
  "evidence_artifact_invalid",
  "evidence_wrong_user",
  "evidence_wrong_project",
  "evidence_permission_revoked",
  "evidence_fingerprint_mismatch",
  "evidence_source_not_found",
  "evidence_outside_period",
  "evidence_document_sha_mismatch",
] as const satisfies readonly ProjectBriefEvidenceErrorCode[];

export interface ProjectBriefEvidenceValidationSuccess {
  readonly contractVersion: typeof projectBriefEvidenceValidationContractVersion;
  readonly status: "valid";
  readonly validatedReferenceCount: number;
  readonly evidenceFingerprint: string;
}

export class ProjectBriefEvidenceValidationError extends Error {
  readonly name = "ProjectBriefEvidenceValidationError";

  constructor(readonly code: ProjectBriefEvidenceErrorCode) {
    super(code);
  }
}

export function evidenceValidationFailure(
  code: ProjectBriefEvidenceErrorCode,
): never {
  throw new ProjectBriefEvidenceValidationError(code);
}
