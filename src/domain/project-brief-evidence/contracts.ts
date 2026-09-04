export const projectBriefEvidenceSnapshotContractVersion =
  "project-brief-evidence-snapshot.v1" as const;
export const projectBriefEvidenceSourceRefContractVersion =
  "project-brief-evidence-source-ref.v1" as const;
export const projectBriefEvidenceCanonicalizationContractVersion =
  "project-brief-evidence-canonicalization.v1" as const;
export const projectBriefEvidenceFingerprintContractVersion =
  "project-brief-evidence-fingerprint.v1" as const;

export const projectBriefEvidenceFailureCodes = [
  "invalid_request",
  "project_not_found_or_forbidden",
  "authorization_revoked",
  "freshness_unavailable",
  "source_invalid",
  "duplicate_source_ref",
  "canonicalization_failed",
] as const;
export type ProjectBriefEvidenceFailureCode =
  (typeof projectBriefEvidenceFailureCodes)[number];

export class ProjectBriefEvidenceError extends Error {
  readonly name = "ProjectBriefEvidenceError";

  constructor(readonly code: ProjectBriefEvidenceFailureCode) {
    super(code);
  }
}

export function evidenceFailure(
  code: ProjectBriefEvidenceFailureCode,
): never {
  throw new ProjectBriefEvidenceError(code);
}
