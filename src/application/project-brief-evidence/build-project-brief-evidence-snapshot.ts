import { canonicalizeEvidenceSnapshot } from "@/domain/project-brief-evidence/canonicalization";
import {
  buildProjectBriefEvidenceCacheEquivalence,
  canonicalizeProjectBriefEvidenceCacheEquivalence,
} from "@/domain/project-brief-evidence/cache-equivalence";
import {
  evidenceFailure,
  ProjectBriefEvidenceError,
} from "@/domain/project-brief-evidence/contracts";
import {
  buildProjectBriefEvidenceSnapshot,
  type EvidenceSnapshotBuildInput,
  type ProjectBriefEvidenceSnapshot,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import type {
  ProjectBriefEvidenceFingerprint,
  ProjectBriefEvidenceFreshnessReader,
  ProjectBriefEvidenceSourceReader,
} from "./project-brief-evidence-ports";

export interface ProjectBriefEvidenceArtifact {
  readonly snapshot: ProjectBriefEvidenceSnapshot;
  readonly canonicalPayload: string;
  readonly fingerprint: string;
  readonly cacheEquivalenceFingerprint: string;
}

export class BuildProjectBriefEvidenceSnapshotUseCase {
  constructor(private readonly dependencies: {
    readonly sourceReader: ProjectBriefEvidenceSourceReader;
    readonly freshnessReader: ProjectBriefEvidenceFreshnessReader;
    readonly fingerprint: ProjectBriefEvidenceFingerprint;
  }) {}

  async execute(
    input: EvidenceSnapshotBuildInput,
  ): Promise<ProjectBriefEvidenceArtifact> {
    let sourceData;
    try {
      sourceData = await this.dependencies.sourceReader.read(input);
    } catch {
      return evidenceFailure("source_invalid");
    }
    if (sourceData === null) return evidenceFailure("project_not_found_or_forbidden");

    let freshness;
    try {
      freshness = await this.dependencies.freshnessReader.read(input);
    } catch {
      return evidenceFailure("freshness_unavailable");
    }

    const snapshot = buildProjectBriefEvidenceSnapshot(input, {
      ...sourceData,
      freshness,
    });
    let canonicalPayload: string;
    let fingerprint: string;
    let cacheEquivalenceFingerprint: string;
    try {
      canonicalPayload = canonicalizeEvidenceSnapshot(snapshot);
      fingerprint = await this.dependencies.fingerprint.sha256Utf8(canonicalPayload);
      cacheEquivalenceFingerprint = await this.dependencies.fingerprint.sha256Utf8(
        canonicalizeProjectBriefEvidenceCacheEquivalence(
          buildProjectBriefEvidenceCacheEquivalence(snapshot),
        ),
      );
    } catch (error) {
      if (error instanceof ProjectBriefEvidenceError) throw error;
      return evidenceFailure("canonicalization_failed");
    }
    if (
      !/^[0-9a-f]{64}$/.test(fingerprint)
      || !/^[0-9a-f]{64}$/.test(cacheEquivalenceFingerprint)
    ) {
      return evidenceFailure("canonicalization_failed");
    }
    return { snapshot, canonicalPayload, fingerprint, cacheEquivalenceFingerprint };
  }
}
