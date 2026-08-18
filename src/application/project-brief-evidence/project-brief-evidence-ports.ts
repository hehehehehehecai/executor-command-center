import type {
  EvidenceSnapshotBuildInput,
  ProjectBriefEvidenceSourceData,
  RawFreshnessSource,
} from "@/domain/project-brief-evidence/evidence-snapshot";

export interface ProjectBriefEvidenceSourceReader {
  read(input: Pick<EvidenceSnapshotBuildInput, "userId" | "projectId">):
    Promise<ProjectBriefEvidenceSourceData | null>;
}

export interface ProjectBriefEvidenceFreshnessReader {
  read(input: Pick<EvidenceSnapshotBuildInput, "userId" | "projectId" | "now">):
    Promise<RawFreshnessSource | null>;
}

export interface ProjectBriefEvidenceFingerprint {
  sha256Utf8(canonicalPayload: string): Promise<string>;
}
