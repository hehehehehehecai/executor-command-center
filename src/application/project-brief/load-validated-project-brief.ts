import type {
  ProjectBriefEvidenceArtifact,
} from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import {
  isRecoverableHistoricalEvidenceError,
  type ValidateStoredProjectBriefEvidenceUseCase,
} from "@/application/project-brief-evidence/validate-stored-project-brief-evidence";
import type { ProjectBriefRecord } from "@/domain/project-brief/project-brief";
import type { ProjectBrief } from "@/domain/project-brief/project-brief-contract";
import { projectBriefSchemaVersion } from "@/domain/project-brief/project-brief-contract";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";

export const projectBriefDisplayContractVersion =
  "project-brief-display.v1" as const;

export const projectBriefDisplayFailureCodes = [
  "brief_not_found",
  "brief_expired",
  "brief_invalid",
  "brief_evidence_validation_failed",
  "brief_unavailable",
] as const;
export type ProjectBriefDisplayFailureCode =
  (typeof projectBriefDisplayFailureCodes)[number];

export class ProjectBriefDisplayError extends Error {
  readonly name = "ProjectBriefDisplayError";

  constructor(readonly code: ProjectBriefDisplayFailureCode) {
    super(code);
  }

  toJSON() {
    return { name: this.name, code: this.code };
  }
}

export interface LoadValidatedProjectBriefInput {
  readonly actorUserId: string;
  readonly projectId: string;
  readonly now: string;
}

export interface LoadedValidatedProjectBrief {
  readonly contractVersion: typeof projectBriefDisplayContractVersion;
  readonly briefId: string;
  readonly brief: ProjectBrief;
  readonly evidenceValidationSource: "live_snapshot" | "generation_receipt";
  readonly artifact: ProjectBriefEvidenceArtifact | null;
}

type Reader = {
  listForProject(projectId: string): Promise<readonly ProjectBriefRecord[]>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function canonicalUtc(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function fail(code: ProjectBriefDisplayFailureCode): never {
  throw new ProjectBriefDisplayError(code);
}

function newestFirst(left: ProjectBriefRecord, right: ProjectBriefRecord) {
  return (right.completedAt ?? "").localeCompare(left.completedAt ?? "")
    || right.createdAt.localeCompare(left.createdAt)
    || left.id.localeCompare(right.id);
}

function matchesRow(brief: ProjectBrief, row: ProjectBriefRecord) {
  return brief.projectId === row.projectId
    && brief.rangeStart === row.rangeStart
    && brief.rangeEnd === row.rangeEnd
    && brief.schemaVersion === projectBriefSchemaVersion
    && brief.promptVersion === row.promptVersion
    && brief.schemaVersion === row.schemaVersion
    && brief.evidenceFingerprint === row.evidenceFingerprint;
}

export class LoadValidatedProjectBriefUseCase {
  constructor(private readonly dependencies: {
    readonly reader: Reader;
    readonly evidenceBuilder: {
      execute(input: {
        readonly userId: string;
        readonly projectId: string;
        readonly rangeStart: string;
        readonly rangeEnd: string;
        readonly now: string;
      }): Promise<ProjectBriefEvidenceArtifact>;
    };
    readonly evidenceValidator: {
      execute(input: {
        readonly actorUserId: string;
        readonly projectId: string;
        readonly brief: ProjectBrief;
        readonly artifact: ProjectBriefEvidenceArtifact;
      }): Promise<unknown>;
    };
    readonly storedEvidenceValidator: Pick<ValidateStoredProjectBriefEvidenceUseCase, "execute">;
  }) {}

  async execute(
    input: LoadValidatedProjectBriefInput,
  ): Promise<LoadedValidatedProjectBrief> {
    if (
      !uuidPattern.test(input.actorUserId)
      || !uuidPattern.test(input.projectId)
      || !canonicalUtc(input.now)
    ) {
      return fail("brief_unavailable");
    }

    let rows: readonly ProjectBriefRecord[];
    let evidenceValidationSource: LoadedValidatedProjectBrief["evidenceValidationSource"] =
      "live_snapshot";
    try {
      rows = await this.dependencies.reader.listForProject(input.projectId);
    } catch {
      return fail("brief_unavailable");
    }
    const completed = rows
      .filter((row) => row.status === "completed")
      .toSorted(newestFirst);
    if (completed.length === 0) return fail("brief_not_found");
    const current = completed.find((row) =>
      row.expiresAt !== null
      && canonicalUtc(row.expiresAt)
      && row.expiresAt > input.now);
    if (!current) return fail("brief_expired");

    let brief: ProjectBrief;
    try {
      brief = parseProjectBrief(current.payload);
      if (!matchesRow(brief, current)) return fail("brief_invalid");
    } catch (error) {
      if (error instanceof ProjectBriefDisplayError) throw error;
      return fail("brief_invalid");
    }

    let artifact: ProjectBriefEvidenceArtifact;
    try {
      artifact = await this.dependencies.evidenceBuilder.execute({
        userId: input.actorUserId,
        projectId: input.projectId,
        rangeStart: brief.rangeStart,
        rangeEnd: brief.rangeEnd,
        now: brief.freshness.evaluatedAt,
      });
    } catch {
      return fail("brief_evidence_validation_failed");
    }

    try {
      await this.dependencies.evidenceValidator.execute({
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        brief,
        artifact,
      });
    } catch (error) {
      if (!isRecoverableHistoricalEvidenceError(error)) {
        return fail("brief_evidence_validation_failed");
      }
      try {
        await this.dependencies.storedEvidenceValidator.execute({
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          briefId: current.id,
          brief,
        });
        evidenceValidationSource = "generation_receipt";
      } catch {
        return fail("brief_evidence_validation_failed");
      }
    }

    return {
      contractVersion: projectBriefDisplayContractVersion,
      briefId: current.id,
      brief,
      evidenceValidationSource,
      artifact: evidenceValidationSource === "live_snapshot" ? artifact : null,
    };
  }
}
