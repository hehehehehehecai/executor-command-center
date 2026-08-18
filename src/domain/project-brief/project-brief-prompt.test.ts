import { describe, expect, it } from "vitest";

import {
  buildProjectBriefSystemPrompt,
  projectBriefPromptPolicy,
} from "./project-brief-prompt";

describe("Project Brief prompt policy", () => {
  it("P4-C-001 binds the prompt to the Evidence Snapshot allow-list", () => {
    expect(projectBriefPromptPolicy).toMatchObject({
      contractVersion: "project-brief-v1",
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
    });
  });

  it("P4-C-002 freezes every prohibited inference class", () => {
    expect(projectBriefPromptPolicy.prohibitedBehaviors).toEqual([
      "action_recommendations",
      "invented_motives",
      "unsupported_value_judgments",
      "certainty_beyond_evidence",
      "external_knowledge",
      "fabricated_evidence_refs",
    ]);
  });

  it("P4-C-003 freezes Parse, Schema, Evidence and visibility boundaries", () => {
    expect(projectBriefPromptPolicy.validationBoundaries).toEqual({
      providerCompletedMeans: "json_parse_succeeded_only",
      schemaValidMeans: "project_brief_shape_succeeded_only",
      evidenceValidMeans: "not_evaluated_in_phase_4",
      briefPersistenceCompletedRequires: "parse_schema_and_evidence_validation",
      phase4ProducesCompletedBrief: false,
      userVisibleMeans: "not_authorized_in_phase_4",
    });
  });

  it("P4-C-004 renders a deterministic provider-neutral system policy", () => {
    expect(buildProjectBriefSystemPrompt()).toBe([
      "Contract: project-brief-v1.",
      "Use only the supplied Project Brief Evidence Snapshot.",
      "Return only a JSON value conforming to project-brief-schema-v1.",
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
    ].join("\n"));
  });
});
