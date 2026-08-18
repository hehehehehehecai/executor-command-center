import { projectStatuses, type ProjectStatus } from "@/domain/project-calibration/project-calibration";
import {
  projectBriefEvidenceSourceRefContractVersion,
} from "@/domain/project-brief-evidence/contracts";
import type { EvidenceSourceKind } from "@/domain/project-brief-evidence/evidence-snapshot";
import {
  freshnessStatuses,
  type FreshnessStatus,
} from "@/domain/synchronization/synchronization-state";

export const projectBriefPromptVersion = "project-brief-v1" as const;
export const projectBriefSchemaVersion = "project-brief-schema-v1" as const;
export const projectBriefEvidenceRefContractVersion =
  projectBriefEvidenceSourceRefContractVersion;

export const projectBriefFailureCodes = [
  "project_brief_schema_invalid",
  "project_brief_version_invalid",
  "project_brief_range_invalid",
  "project_brief_evidence_ref_invalid",
  "project_brief_duplicate_item",
  "project_brief_duplicate_evidence_ref",
] as const;
export type ProjectBriefFailureCode = (typeof projectBriefFailureCodes)[number];

export const projectBriefOfficialStatuses = projectStatuses;
export const projectBriefFreshnessStatuses = freshnessStatuses;

export const projectBriefFactSections = [
  "completedChanges",
  "ongoingWork",
  "openItems",
  "riskSignals",
] as const;
export type ProjectBriefFactSection = (typeof projectBriefFactSections)[number];
export const projectBriefItemSections = [
  ...projectBriefFactSections,
  "unknowns",
] as const;
export type ProjectBriefItemSection = (typeof projectBriefItemSections)[number];

export const projectBriefLimits = {
  summaryText: 2_000,
  itemText: 1_000,
  itemId: 64,
  itemsPerSection: 20,
  unknowns: 20,
  missingEvidencePerUnknown: 10,
  missingEvidenceText: 500,
  evidenceRefs: 100,
  evidenceRefsPerItem: 10,
  sourceId: 255,
} as const;

export const projectBriefBoundaryNote =
  "This brief summarizes only the bounded Evidence Snapshot. It does not recommend actions, infer motives, validate evidence references, or authorize user visibility." as const;

export interface ProjectBriefEvidenceRef {
  readonly contractVersion: typeof projectBriefEvidenceRefContractVersion;
  readonly sourceKind: EvidenceSourceKind;
  readonly sourceId: string;
  readonly projectId: string;
}

export interface ProjectBriefFactItem {
  readonly id: string;
  readonly text: string;
  readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
}

export interface ProjectBriefUnknownItem {
  readonly id: string;
  readonly text: string;
  readonly missingEvidence: readonly string[];
}

export interface ProjectBrief {
  readonly promptVersion: typeof projectBriefPromptVersion;
  readonly schemaVersion: typeof projectBriefSchemaVersion;
  readonly projectId: string;
  readonly evidenceFingerprint: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly officialStatus: {
    readonly value: ProjectStatus;
    readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
  };
  readonly summary: {
    readonly text: string;
    readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
  };
  readonly completedChanges: readonly ProjectBriefFactItem[];
  readonly ongoingWork: readonly ProjectBriefFactItem[];
  readonly openItems: readonly ProjectBriefFactItem[];
  readonly riskSignals: readonly ProjectBriefFactItem[];
  readonly unknowns: readonly ProjectBriefUnknownItem[];
  readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
  readonly freshness: {
    readonly status: FreshnessStatus;
    readonly evaluatedAt: string;
    readonly lastSuccessfulAt: string | null;
    readonly coverageComplete: boolean;
    readonly evidenceRefs: readonly ProjectBriefEvidenceRef[];
  };
  readonly boundaryNote: typeof projectBriefBoundaryNote;
}
