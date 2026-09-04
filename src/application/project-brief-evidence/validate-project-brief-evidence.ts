import { canonicalizeEvidenceSnapshot } from "@/domain/project-brief-evidence/canonicalization";
import {
  projectBriefEvidenceCanonicalizationContractVersion,
  projectBriefEvidenceFingerprintContractVersion,
  projectBriefEvidenceSnapshotContractVersion,
  projectBriefEvidenceSourceRefContractVersion,
} from "@/domain/project-brief-evidence/contracts";
import {
  evidenceValidationFailure,
  ProjectBriefEvidenceValidationError,
  projectBriefEvidenceValidationContractVersion,
  type ProjectBriefEvidenceValidationSuccess,
} from "@/domain/project-brief-evidence/evidence-validation";
import {
  evidenceSourceAlignmentKey,
  evidenceSourceKinds,
  type EvidenceSourceRef,
  type ProjectBriefEvidenceDocument,
  type ProjectBriefEvidenceSnapshot,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import type {
  ProjectBrief,
  ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";
import {
  freshnessStatusContract,
  freshnessStatuses,
} from "@/domain/synchronization/synchronization-state";

import type { ProjectBriefEvidenceArtifact } from "./build-project-brief-evidence-snapshot";
import type { ProjectBriefEvidenceFingerprint } from "./project-brief-evidence-ports";

export interface ValidateProjectBriefEvidenceInput {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly artifact: ProjectBriefEvidenceArtifact;
}

type IndexedEvidence = {
  readonly sourceRef: EvidenceSourceRef;
  readonly document: ProjectBriefEvidenceDocument | null;
};

type PreparedArtifact = {
  readonly snapshot: ProjectBriefEvidenceSnapshot;
  readonly sourceRefs: readonly EvidenceSourceRef[];
  readonly sourceIndex: ReadonlyMap<string, IndexedEvidence>;
  readonly recomputedFingerprint: string;
};

const fingerprintPattern = /^[0-9a-f]{64}$/;
const lowerUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sourceKindSet = new Set<string>(evidenceSourceKinds);
const freshnessStatusSet = new Set<string>(freshnessStatuses);
const activitySourceKinds = new Set<string>([
  "github_commit",
  "github_issue",
  "github_pull_request",
  "github_release",
  "github_workflow_run",
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalUtc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isNullableCanonicalUtc(value: unknown): value is string | null {
  return value === null || isCanonicalUtc(value);
}

function isNullableNonemptyString(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && value.length > 0
    && value.trim() === value
  );
}

function hasValidSourceRefShape(value: unknown): value is EvidenceSourceRef {
  if (!isRecord(value)) return false;
  return value.contractVersion === projectBriefEvidenceSourceRefContractVersion
    && typeof value.sourceKind === "string"
    && sourceKindSet.has(value.sourceKind)
    && typeof value.sourceId === "string"
    && value.sourceId.length > 0
    && value.sourceId.trim() === value.sourceId
    && typeof value.projectId === "string"
    && lowerUuidPattern.test(value.projectId)
    && isNullableCanonicalUtc(value.occurredAt)
    && isNullableCanonicalUtc(value.sourceUpdatedAt)
    && isNullableNonemptyString(value.sourceVersion)
    && (value.sourceSha === null || typeof value.sourceSha === "string");
}

function hasExpectedReferenceSemantics(
  ref: EvidenceSourceRef,
  expectedKind: "project_profile" | "activity" | "github_document"
    | "confirmed_decision" | "freshness",
) {
  if (ref.sourceUpdatedAt === null || ref.sourceVersion === null) return false;
  switch (expectedKind) {
    case "project_profile":
      return ref.sourceKind === "project_profile"
        && ref.occurredAt === null
        && ref.sourceSha === null;
    case "activity":
      return activitySourceKinds.has(ref.sourceKind)
        && ref.occurredAt !== null
        && ref.sourceSha === null;
    case "github_document":
      return ref.sourceKind === "github_document" && ref.occurredAt === null;
    case "confirmed_decision":
      return ref.sourceKind === "confirmed_decision"
        && ref.occurredAt !== null
        && ref.sourceSha === null;
    case "freshness":
      return ref.sourceKind === "freshness"
        && ref.occurredAt !== null
        && ref.sourceSha === null;
  }
}

function projectRefAlignmentKey(ref: ProjectBriefEvidenceRef) {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

function assertArtifactVersions(snapshot: ProjectBriefEvidenceSnapshot) {
  if (
    snapshot.snapshotContractVersion !== projectBriefEvidenceSnapshotContractVersion
    || snapshot.sourceRefContractVersion !== projectBriefEvidenceSourceRefContractVersion
    || snapshot.canonicalizationContractVersion
      !== projectBriefEvidenceCanonicalizationContractVersion
    || snapshot.fingerprintContractVersion
      !== projectBriefEvidenceFingerprintContractVersion
    || snapshot.freshnessContractVersion !== freshnessStatusContract
  ) {
    return evidenceValidationFailure("evidence_artifact_invalid");
  }
}

function sourceItems(snapshot: ProjectBriefEvidenceSnapshot) {
  if (
    !isRecord(snapshot.projectProfile)
    || !Array.isArray(snapshot.githubActivities)
    || !Array.isArray(snapshot.authorizedDocuments)
    || !isRecord(snapshot.confirmedDecisions)
    || !Array.isArray(snapshot.confirmedDecisions.items)
    || !isRecord(snapshot.freshness)
    || (
      snapshot.confirmedDecisions.sourceAvailability !== "available"
      && snapshot.confirmedDecisions.sourceAvailability !== "unavailable"
    )
    || (
      snapshot.confirmedDecisions.sourceAvailability === "unavailable"
      && snapshot.confirmedDecisions.items.length > 0
    )
  ) {
    return evidenceValidationFailure("evidence_artifact_invalid");
  }

  const items: Array<{
    sourceRef: unknown;
    expectedKind: Parameters<typeof hasExpectedReferenceSemantics>[1];
    document: ProjectBriefEvidenceDocument | null;
  }> = [
    {
      sourceRef: snapshot.projectProfile.sourceRef,
      expectedKind: "project_profile",
      document: null,
    },
  ];
  for (const activity of snapshot.githubActivities) {
    if (!isRecord(activity)) return evidenceValidationFailure("evidence_artifact_invalid");
    items.push({ sourceRef: activity.sourceRef, expectedKind: "activity", document: null });
  }
  for (const document of snapshot.authorizedDocuments) {
    if (!isRecord(document)) return evidenceValidationFailure("evidence_artifact_invalid");
    items.push({
      sourceRef: document.sourceRef,
      expectedKind: "github_document",
      document: document as unknown as ProjectBriefEvidenceDocument,
    });
  }
  for (const decision of snapshot.confirmedDecisions.items) {
    if (!isRecord(decision)) return evidenceValidationFailure("evidence_artifact_invalid");
    items.push({
      sourceRef: decision.sourceRef,
      expectedKind: "confirmed_decision",
      document: null,
    });
  }
  items.push({
    sourceRef: snapshot.freshness.sourceRef,
    expectedKind: "freshness",
    document: null,
  });
  return items;
}

function buildSourceIndex(snapshot: ProjectBriefEvidenceSnapshot) {
  const refs: EvidenceSourceRef[] = [];
  const index = new Map<string, IndexedEvidence>();
  for (const item of sourceItems(snapshot)) {
    if (
      !hasValidSourceRefShape(item.sourceRef)
      || !hasExpectedReferenceSemantics(item.sourceRef, item.expectedKind)
    ) {
      return evidenceValidationFailure("evidence_artifact_invalid");
    }
    const key = evidenceSourceAlignmentKey(item.sourceRef);
    if (index.has(key)) return evidenceValidationFailure("evidence_artifact_invalid");
    refs.push(item.sourceRef);
    index.set(key, { sourceRef: item.sourceRef, document: item.document });
  }
  return { refs, index };
}

function assertSnapshotShape(snapshot: ProjectBriefEvidenceSnapshot) {
  if (
    !lowerUuidPattern.test(snapshot.userId)
    || !lowerUuidPattern.test(snapshot.projectId)
    || !isCanonicalUtc(snapshot.rangeStart)
    || !isCanonicalUtc(snapshot.rangeEnd)
    || snapshot.rangeStart >= snapshot.rangeEnd
    || !freshnessStatusSet.has(snapshot.freshness.status)
    || !isCanonicalUtc(snapshot.freshness.evaluatedAt)
    || !isNullableCanonicalUtc(snapshot.freshness.lastSuccessfulAt)
    || typeof snapshot.freshness.coverageComplete !== "boolean"
  ) {
    return evidenceValidationFailure("evidence_artifact_invalid");
  }
}

export class ValidateProjectBriefEvidenceUseCase {
  constructor(private readonly dependencies: {
    readonly fingerprint: ProjectBriefEvidenceFingerprint;
  }) {}

  async execute(
    input: ValidateProjectBriefEvidenceInput,
  ): Promise<ProjectBriefEvidenceValidationSuccess> {
    const prepared = await this.prepareArtifact(input.artifact);
    const { snapshot } = prepared;

    if (input.actorUserId !== snapshot.userId) {
      return evidenceValidationFailure("evidence_wrong_user");
    }
    if (
      input.projectId !== snapshot.projectId
      || input.brief.projectId !== snapshot.projectId
      || prepared.sourceRefs.some((ref) => ref.projectId !== snapshot.projectId)
      || input.brief.evidenceRefs.some((ref) => ref.projectId !== snapshot.projectId)
    ) {
      return evidenceValidationFailure("evidence_wrong_project");
    }
    if (snapshot.freshness.status === "authorization_revoked") {
      return evidenceValidationFailure("evidence_permission_revoked");
    }
    if (
      input.brief.rangeStart !== snapshot.rangeStart
      || input.brief.rangeEnd !== snapshot.rangeEnd
      || input.brief.evidenceFingerprint !== input.artifact.fingerprint
      || prepared.recomputedFingerprint !== input.artifact.fingerprint
    ) {
      return evidenceValidationFailure("evidence_fingerprint_mismatch");
    }

    const matched: IndexedEvidence[] = [];
    for (const ref of input.brief.evidenceRefs) {
      const evidence = prepared.sourceIndex.get(projectRefAlignmentKey(ref));
      if (!evidence) return evidenceValidationFailure("evidence_source_not_found");
      matched.push(evidence);
    }

    if (matched.some(({ sourceRef }) => {
      if (
        !activitySourceKinds.has(sourceRef.sourceKind)
        && sourceRef.sourceKind !== "confirmed_decision"
      ) {
        return false;
      }
      return sourceRef.occurredAt === null
        || sourceRef.occurredAt < snapshot.rangeStart
        || sourceRef.occurredAt >= snapshot.rangeEnd;
    })) {
      return evidenceValidationFailure("evidence_outside_period");
    }

    if (matched.some(({ sourceRef, document }) =>
      sourceRef.sourceKind === "github_document"
      && (
        document === null
        || typeof document.contentFingerprint !== "string"
        || document.contentFingerprint.trim() === ""
        || sourceRef.sourceSha === null
        || sourceRef.sourceSha !== document.contentFingerprint
      ))) {
      return evidenceValidationFailure("evidence_document_sha_mismatch");
    }

    return {
      contractVersion: projectBriefEvidenceValidationContractVersion,
      status: "valid",
      validatedReferenceCount: input.brief.evidenceRefs.length,
      evidenceFingerprint: input.artifact.fingerprint,
    };
  }

  private async prepareArtifact(
    artifact: ProjectBriefEvidenceArtifact,
  ): Promise<PreparedArtifact> {
    try {
      if (
        !isRecord(artifact)
        || !isRecord(artifact.snapshot)
        || typeof artifact.canonicalPayload !== "string"
        || typeof artifact.fingerprint !== "string"
        || !fingerprintPattern.test(artifact.fingerprint)
      ) {
        return evidenceValidationFailure("evidence_artifact_invalid");
      }
      const snapshot = artifact.snapshot as unknown as ProjectBriefEvidenceSnapshot;
      assertArtifactVersions(snapshot);
      assertSnapshotShape(snapshot);
      const { refs, index } = buildSourceIndex(snapshot);
      const canonicalPayload = canonicalizeEvidenceSnapshot(snapshot);
      if (canonicalPayload !== artifact.canonicalPayload) {
        return evidenceValidationFailure("evidence_artifact_invalid");
      }
      const recomputedFingerprint = await this.dependencies.fingerprint.sha256Utf8(
        canonicalPayload,
      );
      if (!fingerprintPattern.test(recomputedFingerprint)) {
        return evidenceValidationFailure("evidence_artifact_invalid");
      }
      return {
        snapshot,
        sourceRefs: refs,
        sourceIndex: index,
        recomputedFingerprint,
      };
    } catch (error) {
      if (error instanceof ProjectBriefEvidenceValidationError) throw error;
      return evidenceValidationFailure("evidence_artifact_invalid");
    }
  }
}
