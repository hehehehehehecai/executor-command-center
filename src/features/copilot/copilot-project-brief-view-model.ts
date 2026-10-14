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
  readonly summary?: string;
  readonly occurredAt?: string | null;
  readonly relationship?: string;
  readonly originalHref?: string | null;
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
    readonly value: string | null;
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
  readonly evidenceSources: readonly CopilotEvidenceViewModel[];
  readonly generatedAt: string | null;
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
    readonly evidenceDetails?: readonly CopilotEvidenceViewModel[];
    readonly generatedAt?: string;
  },
): CopilotProjectBriefViewModel {
  const allEvidence = evidence(brief.evidenceRefs.filter(ref => ref.projectId === brief.projectId && sourceKinds.has(ref.sourceKind)), input.mode)
    .map(ref => {
      const detail = input.evidenceDetails?.find(item => item.referenceId === ref.referenceId && item.projectId === brief.projectId);
      return detail ? { ...ref, summary: detail.summary, occurredAt: detail.occurredAt, relationship: detail.relationship, originalHref: safeEvidenceOriginalHref(detail.originalHref) } : ref;
    });
  const selectedEvidence = allEvidence.find(
    ({ referenceId }) => referenceId === input.selectedEvidence,
  ) ?? null;
  const readableEvidence = (refs: readonly ProjectBriefEvidenceRef[]) => refs.flatMap(ref => {
    const match = allEvidence.find(item => item.referenceId === evidenceReferenceId(ref));
    return match ? [match] : [];
  });
  return {
    briefId: input.briefId,
    projectId: brief.projectId,
    title: "项目简报",
    summary: {
      text: brief.summary.text,
      evidence: readableEvidence(brief.summary.evidenceRefs),
    },
    officialStatus: {
      value: brief.officialStatus.value,
      evidence: readableEvidence(brief.officialStatus.evidenceRefs),
    },
    sections: sections.map(([id, title, emptyMessage]) => {
      const items = brief[id].map((item) => ({
        id: item.id,
        text: item.text,
        evidence: "evidenceRefs" in item
          ? readableEvidence(item.evidenceRefs)
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
      evidence: readableEvidence(brief.freshness.evidenceRefs),
    },
    rangeStart: brief.rangeStart,
    rangeEnd: brief.rangeEnd,
    promptVersion: brief.promptVersion,
    schemaVersion: brief.schemaVersion,
    evidenceFingerprint: brief.evidenceFingerprint,
    boundaryNote: brief.boundaryNote,
    selectedEvidence,
    evidenceSources: allEvidence,
    generatedAt: input.generatedAt ?? null,
  };
}

export function safeEvidenceOriginalHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.hash || url.search) return null;
    if (!/^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/(commit|issues|pull|releases\/tag|actions\/runs|blob)\/.+/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
