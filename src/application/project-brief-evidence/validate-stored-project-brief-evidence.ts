import type { ProjectBriefEvidenceSourceReader } from "@/application/project-brief-evidence/project-brief-evidence-ports";
import {
  ProjectBriefEvidenceValidationError,
  evidenceValidationFailure,
  projectBriefEvidenceValidationContractVersion,
  type ProjectBriefEvidenceValidationSuccess,
} from "@/domain/project-brief-evidence/evidence-validation";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";

export interface ProjectBriefGenerationReceipt {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly briefId: string;
  readonly status: "completed" | "failed";
  readonly cacheStatus: "hit" | "miss" | "bypass" | null;
  readonly inputFingerprint: string | null;
  readonly promptVersion: string | null;
  readonly schemaVersion: string | null;
  readonly reservationId: string | null;
  readonly sourceInvocationId: string | null;
}

export interface ProjectBriefGenerationReceiptReader {
  listForBrief(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly briefId: string;
  }): Promise<readonly ProjectBriefGenerationReceipt[]>;
}

export interface ProjectBriefFreshnessReceiptReader {
  read(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly sourceId: string;
  }): Promise<{
    readonly sourceId: string;
    readonly projectId: string;
    readonly status: string;
    readonly finishedAt: string | null;
  } | null>;
}

const historicalSourceKinds = new Set([
  "github_commit",
  "github_issue",
  "github_pull_request",
  "github_release",
  "github_workflow_run",
]);

function fingerprintReceipt(
  receipt: ProjectBriefGenerationReceipt,
  input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly briefId: string;
    readonly brief: ProjectBrief;
  },
): boolean {
  return receipt.userId === input.actorUserId
    && receipt.projectId === input.projectId
    && receipt.briefId === input.briefId
    && receipt.status === "completed"
    && (receipt.cacheStatus === "miss" || receipt.cacheStatus === "bypass")
    && receipt.inputFingerprint === input.brief.evidenceFingerprint
    && receipt.promptVersion === input.brief.promptVersion
    && receipt.schemaVersion === input.brief.schemaVersion
    && receipt.reservationId !== null
    && receipt.sourceInvocationId === null;
}

export class ValidateStoredProjectBriefEvidenceUseCase {
  constructor(private readonly dependencies: {
    readonly receiptReader: ProjectBriefGenerationReceiptReader;
    readonly sourceReader: ProjectBriefEvidenceSourceReader;
    readonly freshnessReceiptReader: ProjectBriefFreshnessReceiptReader;
  }) {}

  async execute(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly briefId: string;
    readonly brief: ProjectBrief;
  }): Promise<ProjectBriefEvidenceValidationSuccess> {
    if (
      input.brief.projectId !== input.projectId
      || input.brief.evidenceRefs.some((ref) => ref.projectId !== input.projectId)
    ) {
      return evidenceValidationFailure("evidence_wrong_project");
    }

    let receipts: readonly ProjectBriefGenerationReceipt[];
    try {
      receipts = await this.dependencies.receiptReader.listForBrief({
        userId: input.actorUserId,
        projectId: input.projectId,
        briefId: input.briefId,
      });
    } catch {
      return evidenceValidationFailure("evidence_artifact_invalid");
    }
    const generationReceipts = receipts.filter((receipt) =>
      fingerprintReceipt(receipt, input));
    if (generationReceipts.length !== 1) {
      return evidenceValidationFailure("evidence_fingerprint_mismatch");
    }

    let sources;
    try {
      sources = await this.dependencies.sourceReader.read({
        userId: input.actorUserId,
        projectId: input.projectId,
      });
    } catch {
      return evidenceValidationFailure("evidence_artifact_invalid");
    }
    if (sources === null || sources.projectProfile?.projectId !== input.projectId) {
      return evidenceValidationFailure("evidence_wrong_project");
    }
    if (sources.authorizationStatus !== "active") {
      return evidenceValidationFailure("evidence_permission_revoked");
    }

    for (const ref of input.brief.evidenceRefs) {
      if (ref.sourceKind === "project_profile") {
        if (sources.projectProfile.sourceId !== ref.sourceId) {
          return evidenceValidationFailure("evidence_source_not_found");
        }
        continue;
      }
      if (historicalSourceKinds.has(ref.sourceKind)) {
        const exists = sources.githubActivities.some((source) =>
          source.sourceKind === ref.sourceKind
          && source.sourceId === ref.sourceId
          && source.projectId === input.projectId
          && source.userId === input.actorUserId);
        if (!exists) return evidenceValidationFailure("evidence_source_not_found");
        continue;
      }
      if (ref.sourceKind === "github_document") {
        // The v1 ref does not persist a document hash, so a live fingerprint
        // mismatch cannot be recovered without weakening document integrity.
        return evidenceValidationFailure("evidence_document_sha_mismatch");
      }
      if (ref.sourceKind === "confirmed_decision") {
        const exists = sources.confirmedDecisionsSourceAvailable
          && sources.confirmedDecisions.some((source) =>
            source.sourceId === ref.sourceId
            && source.projectId === input.projectId
            && source.userId === input.actorUserId
            && source.status === "confirmed"
            && source.provenance === "connected");
        if (!exists) return evidenceValidationFailure("evidence_source_not_found");
        continue;
      }
      if (ref.sourceKind === "freshness") {
        let freshness;
        try {
          freshness = await this.dependencies.freshnessReceiptReader.read({
            userId: input.actorUserId,
            projectId: input.projectId,
            sourceId: ref.sourceId,
          });
        } catch {
          return evidenceValidationFailure("evidence_artifact_invalid");
        }
        if (
          freshness === null
          || freshness.sourceId !== ref.sourceId
          || freshness.projectId !== input.projectId
        ) {
          return evidenceValidationFailure("evidence_source_not_found");
        }
        if (
          (freshness.status !== "completed" && freshness.status !== "partial")
          || freshness.finishedAt !== input.brief.freshness.lastSuccessfulAt
          || freshness.finishedAt === null
          || freshness.finishedAt > input.brief.freshness.evaluatedAt
        ) {
          return evidenceValidationFailure("evidence_outside_period");
        }
        continue;
      }
      return evidenceValidationFailure("evidence_source_not_found");
    }

    return {
      contractVersion: projectBriefEvidenceValidationContractVersion,
      status: "valid",
      validatedReferenceCount: input.brief.evidenceRefs.length,
      evidenceFingerprint: input.brief.evidenceFingerprint,
    };
  }
}

export function isRecoverableHistoricalEvidenceError(error: unknown): boolean {
  return error instanceof ProjectBriefEvidenceValidationError
    && error.code === "evidence_fingerprint_mismatch";
}
