import type { EnergyReservationPersistence } from "@/application/ai-usage/ai-usage-persistence";
import type {
  BuildProjectBriefEvidenceSnapshotUseCase,
  ProjectBriefEvidenceArtifact,
} from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import type { ValidateProjectBriefEvidenceUseCase } from "@/application/project-brief-evidence/validate-project-brief-evidence";
import { ProjectBriefEvidenceError } from "@/domain/project-brief-evidence/contracts";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";
import {
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
} from "@/domain/project-brief/project-brief-contract";
import {
  parseProjectBrief,
  ProjectBriefSchemaError,
} from "@/domain/project-brief/project-brief-schema";
import { buildProjectBriefSystemPrompt } from "@/domain/project-brief/project-brief-prompt";
import type { AIProvider } from "@/shared/ai/ai-provider";
import { createStructuredGenerationRequest } from "@/shared/ai/structured-generation-request";
import {
  createStructuredGenerationMetadata,
  type StructuredGenerationMetadata,
  type StructuredGenerationResult,
} from "@/shared/ai/structured-generation-result";

import type {
  DurableCompletedProjectBriefGeneration,
  DurableProjectBriefGenerationOutcome,
  ProjectBriefCache,
  ProjectBriefCacheRecord,
  ProjectBriefGenerationPersistence,
} from "./project-brief-generation-ports";

export const projectBriefGenerationContractVersion =
  "project-brief-generation.v1" as const;
export const projectBriefCacheContractVersion = "project-brief-cache.v1" as const;
export const projectBriefGenerationPersistenceContractVersion =
  "project-brief-generation-persistence.v1" as const;
export const projectBriefEnergyCost = 3 as const;
export const projectBriefCacheTtlMs = 86_400_000 as const;
export const projectBriefGenerationSchemaName = "ProjectBriefV1" as const;
export const projectBriefGenerationMaxOutputTokens = 8_192 as const;

export const projectBriefGenerationFailureStages = [
  "authorization",
  "freshness",
  "snapshot",
  "cache",
  "quota_reservation",
  "provider",
  "schema_validation",
  "evidence_validation",
  "persistence",
  "energy_consume",
  "idempotency_conflict",
] as const;
export type ProjectBriefGenerationFailureStage =
  (typeof projectBriefGenerationFailureStages)[number];

export const projectBriefGenerationFailureCodes = [
  "project_brief_generation_invalid_request",
  "project_brief_authorization_failed",
  "project_brief_freshness_failed",
  "project_brief_snapshot_failed",
  "project_brief_cache_failed",
  "project_brief_quota_reservation_failed",
  "project_brief_provider_failure",
  "project_brief_empty_output",
  "project_brief_parse_failure",
  "project_brief_schema_validation_failed",
  "project_brief_evidence_validation_failed",
  "project_brief_persistence_failed",
  "project_brief_energy_consume_failed",
  "project_brief_idempotency_conflict",
  "reservation_release_failed",
] as const;
export type ProjectBriefGenerationFailureCode =
  (typeof projectBriefGenerationFailureCodes)[number];

export class ProjectBriefGenerationError extends Error {
  readonly name = "ProjectBriefGenerationError";
  readonly stage: ProjectBriefGenerationFailureStage;
  readonly code: ProjectBriefGenerationFailureCode;
  readonly originalStage: ProjectBriefGenerationFailureStage | null;
  readonly originalCode: ProjectBriefGenerationFailureCode | null;

  constructor(input: {
    readonly stage: ProjectBriefGenerationFailureStage;
    readonly code: ProjectBriefGenerationFailureCode;
    readonly originalStage?: ProjectBriefGenerationFailureStage | null;
    readonly originalCode?: ProjectBriefGenerationFailureCode | null;
  }) {
    super(input.code);
    this.stage = input.stage;
    this.code = input.code;
    this.originalStage = input.originalStage ?? null;
    this.originalCode = input.originalCode ?? null;
  }

  toJSON() {
    return {
      name: this.name,
      stage: this.stage,
      code: this.code,
      originalStage: this.originalStage,
      originalCode: this.originalCode,
    };
  }
}

export interface GenerateProjectBriefInput {
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly now: string;
  readonly businessDate: string;
  readonly requestKey: string;
}

export interface ProjectBriefGenerationSuccess {
  readonly contractVersion: typeof projectBriefGenerationContractVersion;
  readonly status: "cache_hit" | "generated";
  readonly energyCharged: 0 | typeof projectBriefEnergyCost;
  readonly briefId: string;
  readonly invocationId: string | null;
  readonly evidenceFingerprint: string;
  readonly brief: ProjectBrief;
}

type EvidenceBuilder = Pick<BuildProjectBriefEvidenceSnapshotUseCase, "execute">;
type EvidenceValidator = Pick<ValidateProjectBriefEvidenceUseCase, "execute">;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const requestKeyPattern = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/;
const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function canonicalUtc(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function generationFailure(
  stage: ProjectBriefGenerationFailureStage,
  code: ProjectBriefGenerationFailureCode,
): never {
  throw new ProjectBriefGenerationError({ stage, code });
}

function validateInput(input: GenerateProjectBriefInput): void {
  if (
    !uuidPattern.test(input.userId)
    || !uuidPattern.test(input.projectId)
    || !canonicalUtc(input.rangeStart)
    || !canonicalUtc(input.rangeEnd)
    || input.rangeStart >= input.rangeEnd
    || !canonicalUtc(input.now)
    || !businessDatePattern.test(input.businessDate)
    || !requestKeyPattern.test(input.requestKey)
  ) {
    generationFailure("snapshot", "project_brief_generation_invalid_request");
  }
}

function cacheRecordMatches(
  record: ProjectBriefCacheRecord,
  input: GenerateProjectBriefInput,
  artifact: ProjectBriefEvidenceArtifact,
): boolean {
  return record.userId === input.userId
    && record.projectId === input.projectId
    && record.rangeStart === input.rangeStart
    && record.rangeEnd === input.rangeEnd
    && record.status === "completed"
    && record.promptVersion === projectBriefPromptVersion
    && record.schemaVersion === projectBriefSchemaVersion
    && record.evidenceFingerprint === artifact.fingerprint
    && record.expiresAt !== null
    && canonicalUtc(record.expiresAt)
    && record.expiresAt > input.now;
}

function briefMatchesArtifact(
  brief: ProjectBrief,
  input: GenerateProjectBriefInput,
  artifact: ProjectBriefEvidenceArtifact,
): boolean {
  return brief.projectId === input.projectId
    && brief.rangeStart === input.rangeStart
    && brief.rangeEnd === input.rangeEnd
    && brief.promptVersion === projectBriefPromptVersion
    && brief.schemaVersion === projectBriefSchemaVersion
    && brief.evidenceFingerprint === artifact.fingerprint;
}

function expiresAt(now: string): string {
  return new Date(Date.parse(now) + projectBriefCacheTtlMs).toISOString();
}

function providerFailure(result: Exclude<StructuredGenerationResult<unknown>, { status: "completed" }>) {
  switch (result.status) {
    case "provider_failure":
      return {
        code: "project_brief_provider_failure" as const,
        metadata: result.metadata,
      };
    case "empty_output":
      return {
        code: "project_brief_empty_output" as const,
        metadata: result.metadata,
      };
    case "parse_failure":
      return {
        code: "project_brief_parse_failure" as const,
        metadata: result.metadata,
      };
  }
}

function replaySuccess(
  outcome: DurableCompletedProjectBriefGeneration,
  artifact: ProjectBriefEvidenceArtifact,
): ProjectBriefGenerationSuccess {
  return {
    contractVersion: projectBriefGenerationContractVersion,
    status: "generated",
    energyCharged: projectBriefEnergyCost,
    briefId: outcome.briefId,
    invocationId: outcome.invocationId,
    evidenceFingerprint: artifact.fingerprint,
    brief: outcome.brief,
  };
}

export class GenerateProjectBriefUseCase {
  constructor(private readonly dependencies: {
    readonly evidenceBuilder: EvidenceBuilder;
    readonly cache: ProjectBriefCache;
    readonly energyReservations: Pick<EnergyReservationPersistence, "reserve">;
    readonly provider: AIProvider;
    readonly evidenceValidator: EvidenceValidator;
    readonly persistence: ProjectBriefGenerationPersistence;
  }) {}

  async execute(input: GenerateProjectBriefInput): Promise<ProjectBriefGenerationSuccess> {
    validateInput(input);
    const artifact = await this.buildArtifact(input);
    const cached = await this.readCache(input, artifact);
    if (cached) return cached;

    let reservation;
    try {
      reservation = await this.dependencies.energyReservations.reserve({
        projectId: input.projectId,
        businessDate: input.businessDate,
        requestKey: input.requestKey,
        amount: projectBriefEnergyCost,
      });
    } catch {
      return generationFailure(
        "quota_reservation",
        "project_brief_quota_reservation_failed",
      );
    }
    if (reservation.amount !== projectBriefEnergyCost) {
      return generationFailure(
        "idempotency_conflict",
        "project_brief_idempotency_conflict",
      );
    }
    if (reservation.outcome === "replayed") {
      return this.replay(reservation.reservationId, input, artifact);
    }

    return this.generateAsOwner(reservation.reservationId, input, artifact);
  }

  private async buildArtifact(
    input: GenerateProjectBriefInput,
  ): Promise<ProjectBriefEvidenceArtifact> {
    try {
      return await this.dependencies.evidenceBuilder.execute(input);
    } catch (error) {
      if (error instanceof ProjectBriefEvidenceError) {
        if (
          error.code === "project_not_found_or_forbidden"
          || error.code === "authorization_revoked"
        ) {
          return generationFailure("authorization", "project_brief_authorization_failed");
        }
        if (error.code === "freshness_unavailable") {
          return generationFailure("freshness", "project_brief_freshness_failed");
        }
      }
      return generationFailure("snapshot", "project_brief_snapshot_failed");
    }
  }

  private async readCache(
    input: GenerateProjectBriefInput,
    artifact: ProjectBriefEvidenceArtifact,
  ): Promise<ProjectBriefGenerationSuccess | null> {
    let record: ProjectBriefCacheRecord | null;
    try {
      record = await this.dependencies.cache.find({
        userId: input.userId,
        projectId: input.projectId,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        promptVersion: projectBriefPromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: artifact.fingerprint,
        now: input.now,
      });
    } catch {
      return generationFailure("cache", "project_brief_cache_failed");
    }
    if (!record || !cacheRecordMatches(record, input, artifact)) return null;
    try {
      const brief = parseProjectBrief(record.payload);
      if (!briefMatchesArtifact(brief, input, artifact)) return null;
      await this.dependencies.evidenceValidator.execute({
        actorUserId: input.userId,
        projectId: input.projectId,
        brief,
        artifact,
      });
      return {
        contractVersion: projectBriefGenerationContractVersion,
        status: "cache_hit",
        energyCharged: 0,
        briefId: record.id,
        invocationId: null,
        evidenceFingerprint: artifact.fingerprint,
        brief,
      };
    } catch {
      return null;
    }
  }

  private async replay(
    reservationId: string,
    input: GenerateProjectBriefInput,
    artifact: ProjectBriefEvidenceArtifact,
  ): Promise<ProjectBriefGenerationSuccess> {
    let outcome: DurableProjectBriefGenerationOutcome;
    try {
      outcome = await this.dependencies.persistence.waitForOutcome(reservationId);
    } catch {
      return generationFailure(
        "idempotency_conflict",
        "project_brief_idempotency_conflict",
      );
    }
    return this.resolveDurableOutcome(outcome, input, artifact);
  }

  private async resolveDurableOutcome(
    outcome: DurableProjectBriefGenerationOutcome,
    input: GenerateProjectBriefInput,
    artifact: ProjectBriefEvidenceArtifact,
  ): Promise<ProjectBriefGenerationSuccess> {
    if (outcome.status === "in_progress") {
      return generationFailure(
        "idempotency_conflict",
        "project_brief_idempotency_conflict",
      );
    }
    if (outcome.status === "failed") {
      throw new ProjectBriefGenerationError({
        stage: outcome.failureStage,
        code: outcome.errorCode,
      });
    }
    try {
      const brief = parseProjectBrief(outcome.brief);
      if (!briefMatchesArtifact(brief, input, artifact)) {
        return generationFailure(
          "idempotency_conflict",
          "project_brief_idempotency_conflict",
        );
      }
      await this.dependencies.evidenceValidator.execute({
        actorUserId: input.userId,
        projectId: input.projectId,
        brief,
        artifact,
      });
      return replaySuccess({ ...outcome, brief }, artifact);
    } catch (error) {
      if (error instanceof ProjectBriefGenerationError) throw error;
      return generationFailure(
        "idempotency_conflict",
        "project_brief_idempotency_conflict",
      );
    }
  }

  private async generateAsOwner(
    reservationId: string,
    input: GenerateProjectBriefInput,
    artifact: ProjectBriefEvidenceArtifact,
  ): Promise<ProjectBriefGenerationSuccess> {
    let result: StructuredGenerationResult<unknown>;
    try {
      result = await this.dependencies.provider.generateStructured(
        createStructuredGenerationRequest({
          systemPrompt: buildProjectBriefSystemPrompt(),
          userPrompt: artifact.canonicalPayload,
          schemaName: projectBriefGenerationSchemaName,
          maxOutputTokens: projectBriefGenerationMaxOutputTokens,
        }),
      );
    } catch {
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        "provider",
        "project_brief_provider_failure",
        null,
      );
    }

    if (result.status !== "completed") {
      const failure = providerFailure(result);
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        "provider",
        failure.code,
        failure.metadata,
      );
    }

    let brief: ProjectBrief;
    try {
      brief = parseProjectBrief(result.value);
    } catch (error) {
      const code = error instanceof ProjectBriefSchemaError
        ? "project_brief_schema_validation_failed"
        : "project_brief_schema_validation_failed";
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        "schema_validation",
        code,
        result.metadata,
      );
    }
    if (!briefMatchesArtifact(brief, input, artifact)) {
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        "schema_validation",
        "project_brief_schema_validation_failed",
        result.metadata,
      );
    }
    try {
      await this.dependencies.evidenceValidator.execute({
        actorUserId: input.userId,
        projectId: input.projectId,
        brief,
        artifact,
      });
    } catch {
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        "evidence_validation",
        "project_brief_evidence_validation_failed",
        result.metadata,
      );
    }

    try {
      const outcome = await this.dependencies.persistence.finalize({
        reservationId,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        promptVersion: projectBriefPromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: artifact.fingerprint,
        brief,
        expiresAt: expiresAt(input.now),
        metadata: result.metadata,
      });
      return replaySuccess(outcome, artifact);
    } catch (error) {
      const energyConsume = error instanceof Error
        && error.message === "project_brief_energy_consume_failed";
      try {
        const durable = await this.dependencies.persistence.waitForOutcome(
          reservationId,
        );
        if (durable.status !== "in_progress") {
          return await this.resolveDurableOutcome(durable, input, artifact);
        }
      } catch (durableError) {
        if (durableError instanceof ProjectBriefGenerationError) {
          throw durableError;
        }
      }
      return this.failAndThrow(
        reservationId,
        artifact.fingerprint,
        energyConsume ? "energy_consume" : "persistence",
        energyConsume
          ? "project_brief_energy_consume_failed"
          : "project_brief_persistence_failed",
        result.metadata,
      );
    }
  }

  private async failAndThrow(
    reservationId: string,
    evidenceFingerprint: string,
    stage: ProjectBriefGenerationFailureStage,
    code: ProjectBriefGenerationFailureCode,
    metadata: StructuredGenerationMetadata | null,
  ): Promise<never> {
    try {
      await this.dependencies.persistence.fail({
        reservationId,
        evidenceFingerprint,
        failureStage: stage,
        errorCode: code,
        metadata: metadata ?? createStructuredGenerationMetadata(),
      });
    } catch {
      throw new ProjectBriefGenerationError({
        stage: "energy_consume",
        code: "reservation_release_failed",
        originalStage: stage,
        originalCode: code,
      });
    }
    throw new ProjectBriefGenerationError({ stage, code });
  }
}
