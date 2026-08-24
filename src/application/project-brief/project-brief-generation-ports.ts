import type { EnergyReservationReceipt } from "@/domain/ai-usage/ai-usage";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";
import type { StructuredGenerationMetadata } from "@/shared/ai/structured-generation-result";

import type {
  ProjectBriefGenerationFailureCode,
  ProjectBriefGenerationFailureStage,
} from "./generate-project-brief";

export interface ProjectBriefCacheKey {
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly evidenceFingerprint: string;
  readonly cacheEquivalenceFingerprint: string;
  readonly now: string;
}

export interface ProjectBriefCacheRecord {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly promptVersion: string | null;
  readonly schemaVersion: string | null;
  readonly evidenceFingerprint: string | null;
  readonly cacheEquivalenceFingerprint: string | null;
  readonly payloadFingerprint: string | null;
  readonly status: "pending" | "completed" | "failed";
  readonly payload: unknown;
  readonly expiresAt: string | null;
}

export interface ProjectBriefCache {
  find(key: ProjectBriefCacheKey): Promise<ProjectBriefCacheRecord | null>;
}

export interface FinalizeProjectBriefGenerationInput {
  readonly reservationId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly evidenceFingerprint: string;
  readonly cacheEquivalenceFingerprint: string;
  readonly brief: ProjectBrief;
  readonly expiresAt: string;
  readonly metadata: StructuredGenerationMetadata;
}

export interface FailProjectBriefGenerationInput {
  readonly reservationId: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly evidenceFingerprint: string;
  readonly cacheEquivalenceFingerprint: string;
  readonly failureStage: ProjectBriefGenerationFailureStage;
  readonly errorCode: ProjectBriefGenerationFailureCode;
  readonly metadata: StructuredGenerationMetadata | null;
}

export interface DurableCompletedProjectBriefGeneration {
  readonly status: "completed";
  readonly outcome: "completed" | "replayed";
  readonly reservationId: string;
  readonly briefId: string;
  readonly invocationId: string;
  readonly brief: ProjectBrief;
}

export interface DurableFailedProjectBriefGeneration {
  readonly status: "failed";
  readonly outcome: "released" | "replayed";
  readonly reservationId: string;
  readonly failureStage: ProjectBriefGenerationFailureStage;
  readonly errorCode: ProjectBriefGenerationFailureCode;
}

export interface DurableInProgressProjectBriefGeneration {
  readonly status: "in_progress";
  readonly outcome: "reserved";
  readonly reservationId: string;
}

export interface RecordProjectBriefCacheHitInput {
  readonly briefId: string;
  readonly currentEvidenceFingerprint: string;
  readonly cacheEquivalenceFingerprint: string;
  readonly observedAt: string;
}

export interface RecordedProjectBriefCacheHit {
  readonly status: "completed";
  readonly outcome: "cache_hit";
  readonly briefId: string;
  readonly invocationId: string;
  readonly sourceInvocationId: string;
}

export type DurableProjectBriefGenerationOutcome =
  | DurableCompletedProjectBriefGeneration
  | DurableFailedProjectBriefGeneration
  | DurableInProgressProjectBriefGeneration;

export interface ProjectBriefGenerationPersistence {
  waitForOutcome(reservationId: string): Promise<DurableProjectBriefGenerationOutcome>;
  finalize(
    input: FinalizeProjectBriefGenerationInput,
  ): Promise<DurableCompletedProjectBriefGeneration>;
  fail(input: FailProjectBriefGenerationInput): Promise<DurableFailedProjectBriefGeneration>;
  recordCacheHit(input: RecordProjectBriefCacheHitInput): Promise<RecordedProjectBriefCacheHit>;
}

export type ProjectBriefReservation = EnergyReservationReceipt;
