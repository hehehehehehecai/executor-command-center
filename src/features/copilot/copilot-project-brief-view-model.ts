import type {
  ProjectBrief,
  ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";
import { evidenceSourceKinds } from "@/domain/project-brief-evidence/evidence-snapshot";
import type { PanelMode } from "@/shared/panel-query";

const sourceKinds = new Set<string>(evidenceSourceKinds);

export function evidenceReferenceId(
  ref: Pick<ProjectBriefEvidenceRef, "sourceKind" | "sourceId" | "projectId">,
) {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

export function evidenceNavigationHref(
  ref: Pick<ProjectBriefEvidenceRef, "sourceKind" | "sourceId" | "projectId">,
  mode: PanelMode,
): string | null {
  if (!sourceKinds.has(ref.sourceKind)) return null;
  const query = new URLSearchParams({
    mode,
    projectId: ref.projectId,
    selectedEvidence: evidenceReferenceId(ref),
  });
  return `/copilot?${query.toString()}`;
}

export interface CopilotEvidenceViewModel {
  readonly referenceId: string;
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly projectId: string;
  readonly href: string | null;
}

export interface CopilotProjectBriefViewModel {
  readonly briefId: string;
  readonly projectId: string;
  readonly title: string;
  readonly summary: {
    readonly text: string;
    readonly evidence: readonly CopilotEvidenceViewModel[];
  };
  readonly officialStatus: {
    readonly value: string;
    readonly evidence: readonly CopilotEvidenceViewModel[];
  };
  readonly sections: readonly {
    readonly id: "completedChanges" | "ongoingWork" | "openItems" | "riskSignals" | "unknowns";
    readonly title: string;
    readonly empty: boolean;
    readonly emptyMessage: string;
    readonly items: readonly {
      readonly id: string;
      readonly text: string;
      readonly evidence: readonly CopilotEvidenceViewModel[];
      readonly missingEvidence: readonly string[];
    }[];
  }[];
  readonly freshness: {
    readonly status: string;
    readonly evaluatedAt: string;
    readonly lastSuccessfulAt: string | null;
    readonly coverageComplete: boolean;
    readonly evidence: readonly CopilotEvidenceViewModel[];
  };
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly evidenceFingerprint: string;
  readonly boundaryNote: string;
  readonly selectedEvidence: CopilotEvidenceViewModel | null;
}

const sections = [
  ["completedChanges", "已完成变更", "暂无已完成变更"],
  ["ongoingWork", "进行中工作", "暂无进行中工作"],
  ["openItems", "待处理事项", "暂无待处理事项"],
  ["riskSignals", "风险信号", "暂无风险信号"],
  ["unknowns", "未知项与缺失证据", "暂无未知项"],
] as const;

function evidence(
  refs: readonly ProjectBriefEvidenceRef[],
  mode: PanelMode,
): readonly CopilotEvidenceViewModel[] {
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const referenceId = evidenceReferenceId(ref);
    if (seen.has(referenceId)) return [];
    seen.add(referenceId);
    return [{
      referenceId,
      sourceKind: ref.sourceKind,
      sourceId: ref.sourceId,
      projectId: ref.projectId,
      href: evidenceNavigationHref(ref, mode),
    }];
  });
}

export function createCopilotProjectBriefViewModel(
  brief: ProjectBrief,
  input: {
    readonly briefId: string;
    readonly mode: PanelMode;
    readonly selectedEvidence: string | null;
  },
): CopilotProjectBriefViewModel {
  const allEvidence = evidence(brief.evidenceRefs, input.mode);
  const selectedEvidence = allEvidence.find(
    ({ referenceId }) => referenceId === input.selectedEvidence,
  ) ?? null;
  return {
    briefId: input.briefId,
    projectId: brief.projectId,
    title: "项目简报",
    summary: {
      text: brief.summary.text,
      evidence: evidence(brief.summary.evidenceRefs, input.mode),
    },
    officialStatus: {
      value: brief.officialStatus.value,
      evidence: evidence(brief.officialStatus.evidenceRefs, input.mode),
    },
    sections: sections.map(([id, title, emptyMessage]) => {
      const items = brief[id].map((item) => ({
        id: item.id,
        text: item.text,
        evidence: "evidenceRefs" in item
          ? evidence(item.evidenceRefs, input.mode)
          : [],
        missingEvidence: "missingEvidence" in item
          ? [...item.missingEvidence]
          : [],
      }));
      return { id, title, empty: items.length === 0, emptyMessage, items };
    }),
    freshness: {
      status: brief.freshness.status,
      evaluatedAt: brief.freshness.evaluatedAt,
      lastSuccessfulAt: brief.freshness.lastSuccessfulAt,
      coverageComplete: brief.freshness.coverageComplete,
      evidence: evidence(brief.freshness.evidenceRefs, input.mode),
    },
    rangeStart: brief.rangeStart,
    rangeEnd: brief.rangeEnd,
    promptVersion: brief.promptVersion,
    schemaVersion: brief.schemaVersion,
    evidenceFingerprint: brief.evidenceFingerprint,
    boundaryNote: brief.boundaryNote,
    selectedEvidence,
  };
}
