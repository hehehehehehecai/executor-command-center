import { canonicalizeEvidenceValue } from "./canonicalization";
import type { ProjectBriefEvidenceSnapshot } from "./evidence-snapshot";

export const projectBriefEvidenceCacheEquivalenceContractVersion =
  "project-brief-evidence-cache-equivalence.v1" as const;

export function buildProjectBriefEvidenceCacheEquivalence(
  snapshot: ProjectBriefEvidenceSnapshot,
) {
  const freshnessSource = snapshot.freshness.sourceRef;
  const freshnessSourceRef = {
    contractVersion: freshnessSource.contractVersion,
    sourceKind: freshnessSource.sourceKind,
    sourceId: freshnessSource.sourceId,
    projectId: freshnessSource.projectId,
    sourceUpdatedAt: freshnessSource.sourceUpdatedAt,
    sourceVersion: freshnessSource.sourceVersion,
    sourceSha: freshnessSource.sourceSha,
  };
  return {
    contractVersion: projectBriefEvidenceCacheEquivalenceContractVersion,
    snapshotContractVersion: snapshot.snapshotContractVersion,
    sourceRefContractVersion: snapshot.sourceRefContractVersion,
    canonicalizationContractVersion: snapshot.canonicalizationContractVersion,
    fingerprintContractVersion: snapshot.fingerprintContractVersion,
    freshnessContractVersion: snapshot.freshnessContractVersion,
    userId: snapshot.userId,
    projectId: snapshot.projectId,
    rangeStart: snapshot.rangeStart,
    rangeEnd: snapshot.rangeEnd,
    projectProfile: snapshot.projectProfile,
    githubActivities: snapshot.githubActivities,
    authorizedDocuments: snapshot.authorizedDocuments,
    confirmedDecisions: snapshot.confirmedDecisions,
    freshness: {
      sourceRef: freshnessSourceRef,
      status: snapshot.freshness.status,
      lastSuccessfulAt: snapshot.freshness.lastSuccessfulAt,
      coverageComplete: snapshot.freshness.coverageComplete,
    },
  } as const;
}

export function canonicalizeProjectBriefEvidenceCacheEquivalence(
  projection: ReturnType<typeof buildProjectBriefEvidenceCacheEquivalence>,
): string {
  return canonicalizeEvidenceValue(projection);
}
