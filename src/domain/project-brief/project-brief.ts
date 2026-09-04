export const projectBriefPersistenceContract = "project-brief-persistence.v1" as const;

export const projectBriefStatuses = ["pending", "completed", "failed"] as const;
export type ProjectBriefStatus = (typeof projectBriefStatuses)[number];

export interface ProjectBriefCompletionLineage {
  readonly promptVersion: string | null;
  readonly schemaVersion: string | null;
  readonly evidenceFingerprint: string | null;
  readonly payload: Readonly<Record<string, unknown>> | null;
}

export interface ProjectBriefRecord extends ProjectBriefCompletionLineage {
  readonly id: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly status: ProjectBriefStatus;
  readonly failureStage: string | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
}

export function canCompleteProjectBrief(
  lineage: ProjectBriefCompletionLineage,
): boolean {
  return Boolean(
    lineage.promptVersion?.trim()
      && lineage.schemaVersion?.trim()
      && lineage.evidenceFingerprint?.match(/^[0-9a-f]{64}$/)
      && lineage.payload,
  );
}
