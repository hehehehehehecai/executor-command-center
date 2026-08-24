import { evidenceSourceKinds } from "@/domain/project-brief-evidence/evidence-snapshot";
import type { FreshnessStatus } from "@/domain/synchronization/synchronization-state";

import {
  projectBriefActivePromptVersion,
  projectBriefBoundaryNote,
  projectBriefFreshnessStatuses,
  projectBriefLimits,
  projectBriefOfficialStatuses,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBriefEvidenceRef,
} from "./project-brief-contract";

export const projectBriefGenerationPromptContractVersion =
  "project-brief-generation-prompt.v2" as const;

export const projectBriefPromptPolicy = {
  contractVersion: projectBriefPromptVersion,
  inputScope: "project_brief_evidence_snapshot_only",
  allowedSources: [
    "projectProfile",
    "githubActivities",
    "authorizedDocuments",
    "confirmedDecisions",
    "freshness",
  ],
  requiredOutputs: [
    "rangeStart",
    "rangeEnd",
    "officialStatus",
    "summary",
    "completedChanges",
    "ongoingWork",
    "openItems",
    "riskSignals",
    "unknowns",
    "evidenceRefs",
    "freshness",
    "boundaryNote",
  ],
  prohibitedBehaviors: [
    "action_recommendations",
    "invented_motives",
    "unsupported_value_judgments",
    "certainty_beyond_evidence",
    "external_knowledge",
    "fabricated_evidence_refs",
  ],
  validationBoundaries: {
    providerCompletedMeans: "json_parse_succeeded_only",
    schemaValidMeans: "project_brief_shape_succeeded_only",
    evidenceValidMeans: "not_evaluated_in_phase_4",
    briefPersistenceCompletedRequires: "parse_schema_and_evidence_validation",
    phase4ProducesCompletedBrief: false,
    userVisibleMeans: "not_authorized_in_phase_4",
  },
  boundaryNote: projectBriefBoundaryNote,
} as const;

const systemPromptLines = [
  `Contract: ${projectBriefPromptVersion}.`,
  "Use only the supplied Project Brief Evidence Snapshot.",
  `Return only a JSON value conforming to ${projectBriefSchemaVersion}.`,
  "Every factual item, Official Status, Summary, and Freshness must cite non-empty Evidence Refs from the snapshot.",
  "Put unsupported or unavailable facts in Unknowns with explicit missing evidence; do not fabricate a reference.",
  "Do not provide action recommendations.",
  "Do not invent motives or intent.",
  "Do not make unsupported value judgments.",
  "Do not express certainty beyond the supplied evidence and freshness.",
  "Do not use external knowledge.",
  "JSON parse success is not Schema validation, Evidence validation, or authorization for user visibility.",
  "Do not mark a Project Brief Completed; persistence completion requires Parse, Schema, and Evidence validation.",
  "Preserve the fixed Boundary Note exactly.",
] as const;

export function buildProjectBriefSystemPrompt(): string {
  return systemPromptLines.join("\n");
}

const activeSystemPromptLines = [
  `Contract: ${projectBriefActivePromptVersion}.`,
  "Use only the supplied canonical Project Brief Evidence Snapshot and availableEvidenceRefs.",
  `Return exactly one JSON object conforming to ${projectBriefSchemaVersion}.`,
  "Do not return Markdown, a code fence, explanatory text, or any extra field.",
  "The complete top-level JSON structure is: promptVersion, schemaVersion, projectId, evidenceFingerprint, rangeStart, rangeEnd, officialStatus { value, evidenceRefs }, summary { text, evidenceRefs }, completedChanges[] { id, text, evidenceRefs }, ongoingWork[] { id, text, evidenceRefs }, openItems[] { id, text, evidenceRefs }, riskSignals[] { id, text, evidenceRefs }, unknowns[] { id, text, missingEvidence }, evidenceRefs[], freshness { status, evaluatedAt, lastSuccessfulAt, coverageComplete, evidenceRefs }, boundaryNote.",
  `Official Status value must be exactly one of: ${projectBriefOfficialStatuses.join(", ")}.`,
  `Freshness status must be exactly one of: ${projectBriefFreshnessStatuses.join(", ")}.`,
  `Evidence sourceKind must be exactly one of: ${evidenceSourceKinds.join(", ")}.`,
  "Copy every trustedConstants value byte-for-byte; never calculate a fingerprint, version, project ID, time range, or Boundary Note.",
  "Evidence Refs have exactly contractVersion, sourceKind, sourceId, and projectId, and must be copied from availableEvidenceRefs.",
  "Every factual item, Official Status, Summary, and Freshness must cite one or more available Evidence Refs.",
  "Every Evidence Ref projectId must equal trustedConstants.projectId.",
  "The top-level evidenceRefs must equal the deduplicated union of refs used by Official Status, Summary, all four factual sections, and Freshness: no missing or extra refs.",
  "Fact and Unknown ids must be unique within their section and use lowercase letters or digits separated only by '-' or '_'.",
  "Unsupported or unavailable content belongs only in unknowns with non-empty missingEvidence; never fabricate an Evidence Ref.",
  "All timestamps must be canonical UTC; freshness.lastSuccessfulAt may be null.",
  `Maximums: summary text ${projectBriefLimits.summaryText} characters; item text ${projectBriefLimits.itemText}; item id ${projectBriefLimits.itemId}; items per factual section ${projectBriefLimits.itemsPerSection}; unknowns ${projectBriefLimits.unknowns}; missingEvidence entries per Unknown ${projectBriefLimits.missingEvidencePerUnknown}; missingEvidence text ${projectBriefLimits.missingEvidenceText}; refs per item ${projectBriefLimits.evidenceRefsPerItem}; aggregate refs ${projectBriefLimits.evidenceRefs}; sourceId ${projectBriefLimits.sourceId}.`,
  "Replace the outputTemplate summary marker with an evidence-bounded summary; do not copy the marker literally.",
  "Do not provide recommendations, infer motives, make unsupported value judgments, use external knowledge, or express certainty beyond the snapshot.",
  "JSON parse success is not Schema validation, Evidence validation, persistence completion, or authorization for user visibility.",
] as const;

export interface BuildProjectBriefGenerationPromptInput {
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly evidenceFingerprint: string;
  readonly canonicalEvidenceSnapshot: string;
  readonly officialStatus: string;
  readonly freshness: {
    readonly status: FreshnessStatus;
    readonly evaluatedAt: string;
    readonly lastSuccessfulAt: string | null;
    readonly coverageComplete: boolean;
  };
  readonly availableEvidenceRefs: readonly ProjectBriefEvidenceRef[];
  readonly profileEvidenceRef: ProjectBriefEvidenceRef;
  readonly freshnessEvidenceRef: ProjectBriefEvidenceRef;
}

export interface ProjectBriefGenerationPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export class ProjectBriefPromptContractError extends Error {
  readonly name = "ProjectBriefPromptContractError";

  constructor() {
    super("project_brief_prompt_contract_invalid");
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fingerprintPattern = /^[0-9a-f]{64}$/;

function canonicalUtc(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function refKey(ref: ProjectBriefEvidenceRef): string {
  return JSON.stringify([ref.sourceKind, ref.sourceId, ref.projectId]);
}

function validatePromptInput(input: BuildProjectBriefGenerationPromptInput): void {
  const refs = [...input.availableEvidenceRefs];
  const keys = refs.map(refKey);
  const profileKey = refKey(input.profileEvidenceRef);
  const freshnessKey = refKey(input.freshnessEvidenceRef);
  if (
    !uuidPattern.test(input.projectId)
    || !fingerprintPattern.test(input.evidenceFingerprint)
    || !canonicalUtc(input.rangeStart)
    || !canonicalUtc(input.rangeEnd)
    || input.rangeStart >= input.rangeEnd
    || input.canonicalEvidenceSnapshot.trim() === ""
    || !new Set<string>(projectBriefOfficialStatuses).has(input.officialStatus)
    || !new Set<string>(projectBriefFreshnessStatuses).has(input.freshness.status)
    || !canonicalUtc(input.freshness.evaluatedAt)
    || (input.freshness.lastSuccessfulAt !== null
      && (!canonicalUtc(input.freshness.lastSuccessfulAt)
        || input.freshness.lastSuccessfulAt > input.freshness.evaluatedAt))
    || refs.length < 2
    || new Set(keys).size !== keys.length
    || !keys.includes(profileKey)
    || !keys.includes(freshnessKey)
    || refs.some((ref) => ref.projectId !== input.projectId)
  ) {
    throw new ProjectBriefPromptContractError();
  }
}

export function buildProjectBriefGenerationPrompt(
  input: BuildProjectBriefGenerationPromptInput,
): ProjectBriefGenerationPrompt {
  validatePromptInput(input);
  let canonicalEvidenceSnapshot: unknown;
  try {
    canonicalEvidenceSnapshot = JSON.parse(input.canonicalEvidenceSnapshot);
  } catch {
    throw new ProjectBriefPromptContractError();
  }
  if (
    canonicalEvidenceSnapshot === null
    || typeof canonicalEvidenceSnapshot !== "object"
    || Array.isArray(canonicalEvidenceSnapshot)
  ) {
    throw new ProjectBriefPromptContractError();
  }
  const availableEvidenceRefs = [...input.availableEvidenceRefs]
    .toSorted((left, right) => refKey(left).localeCompare(refKey(right)));
  const evidenceRefs = [input.profileEvidenceRef, input.freshnessEvidenceRef]
    .toSorted((left, right) => refKey(left).localeCompare(refKey(right)));
  const envelope = {
    contractVersion: projectBriefGenerationPromptContractVersion,
    trustedConstants: {
      promptVersion: projectBriefActivePromptVersion,
      schemaVersion: projectBriefSchemaVersion,
      projectId: input.projectId,
      evidenceFingerprint: input.evidenceFingerprint,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      boundaryNote: projectBriefBoundaryNote,
    },
    availableEvidenceRefs,
    outputTemplate: {
      promptVersion: projectBriefActivePromptVersion,
      schemaVersion: projectBriefSchemaVersion,
      projectId: input.projectId,
      evidenceFingerprint: input.evidenceFingerprint,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      officialStatus: {
        value: input.officialStatus,
        evidenceRefs: [input.profileEvidenceRef],
      },
      summary: {
        text: "REPLACE_WITH_EVIDENCE_BOUND_SUMMARY",
        evidenceRefs: [input.profileEvidenceRef],
      },
      completedChanges: [],
      ongoingWork: [],
      openItems: [],
      riskSignals: [],
      unknowns: [],
      evidenceRefs,
      freshness: {
        ...input.freshness,
        evidenceRefs: [input.freshnessEvidenceRef],
      },
      boundaryNote: projectBriefBoundaryNote,
    },
    canonicalEvidenceSnapshot,
  } as const;
  return {
    systemPrompt: activeSystemPromptLines.join("\n"),
    userPrompt: JSON.stringify(envelope),
  };
}
