import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
  type ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";

export const syntheticBriefUserId = "10000000-0000-4000-8000-000000000001";
export const syntheticBriefProjectId = "20000000-0000-4000-8000-000000000002";
export const syntheticBriefId = "30000000-0000-4000-8000-000000000003";
export const syntheticBriefFingerprint = "a".repeat(64);
export const syntheticBriefRangeStart = "2026-08-01T00:00:00.000Z";
export const syntheticBriefRangeEnd = "2026-08-18T00:00:00.000Z";
export const syntheticBriefEvaluatedAt = "2026-08-18T01:00:00.000Z";

export function syntheticEvidenceRef(
  sourceKind: ProjectBriefEvidenceRef["sourceKind"],
  sourceId: string,
): ProjectBriefEvidenceRef {
  return {
    contractVersion: projectBriefEvidenceRefContractVersion,
    sourceKind,
    sourceId,
    projectId: syntheticBriefProjectId,
  };
}

export function syntheticProjectBrief(
  overrides: Partial<ProjectBrief> = {},
): ProjectBrief {
  const profile = syntheticEvidenceRef("project_profile", "profile:odyssey");
  const issue = syntheticEvidenceRef("github_issue", "issue:42");
  const freshness = syntheticEvidenceRef("freshness", "freshness:odyssey");

  return {
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    projectId: syntheticBriefProjectId,
    evidenceFingerprint: syntheticBriefFingerprint,
    rangeStart: syntheticBriefRangeStart,
    rangeEnd: syntheticBriefRangeEnd,
    officialStatus: { value: "in_development", evidenceRefs: [profile] },
    summary: {
      text: "虚构项目已完成导航基线，并在验证离线简报流程。",
      evidenceRefs: [issue],
    },
    completedChanges: [
      { id: "completed-navigation", text: "完成虚构导航基线。", evidenceRefs: [issue] },
    ],
    ongoingWork: [
      { id: "ongoing-brief", text: "验证虚构简报流程。", evidenceRefs: [issue] },
    ],
    openItems: [],
    riskSignals: [],
    unknowns: [
      { id: "unknown-decision", text: "尚无法确认下一里程碑。", missingEvidence: ["已确认决策记录"] },
    ],
    evidenceRefs: [profile, issue, freshness],
    freshness: {
      status: "fresh",
      evaluatedAt: syntheticBriefEvaluatedAt,
      lastSuccessfulAt: "2026-08-18T00:30:00.000Z",
      coverageComplete: true,
      evidenceRefs: [freshness],
    },
    boundaryNote: projectBriefBoundaryNote,
    ...overrides,
  };
}
