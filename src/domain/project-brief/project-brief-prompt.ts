import {
  projectBriefBoundaryNote,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
} from "./project-brief-contract";

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
