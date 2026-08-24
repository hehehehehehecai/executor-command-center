import { describe, expect, it } from "vitest";

import {
  buildProjectBriefGenerationPrompt,
  buildProjectBriefSystemPrompt,
  projectBriefPromptPolicy,
} from "./project-brief-prompt";
import {
  projectBriefActivePromptVersion,
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefSchemaVersion,
} from "./project-brief-contract";

const projectId = "20000000-0000-4000-8000-000000000002";
const rangeStart = "2026-08-01T00:00:00.000Z";
const rangeEnd = "2026-08-18T00:00:00.000Z";
const fingerprint = "a".repeat(64);

const profileRef = {
  contractVersion: projectBriefEvidenceRefContractVersion,
  sourceKind: "project_profile" as const,
  sourceId: "profile:prompt-contract",
  projectId,
};
const freshnessRef = {
  contractVersion: projectBriefEvidenceRefContractVersion,
  sourceKind: "freshness" as const,
  sourceId: "freshness:prompt-contract",
  projectId,
};

function generationPromptInput() {
  return {
    projectId,
    rangeStart,
    rangeEnd,
    evidenceFingerprint: fingerprint,
    canonicalEvidenceSnapshot: '{"snapshot":"synthetic"}',
    officialStatus: "in_development" as const,
    freshness: {
      status: "fresh" as const,
      evaluatedAt: "2026-08-18T06:00:00.000Z",
      lastSuccessfulAt: "2026-08-18T05:00:00.000Z",
      coverageComplete: true,
    },
    availableEvidenceRefs: [profileRef, freshnessRef],
    profileEvidenceRef: profileRef,
    freshnessEvidenceRef: freshnessRef,
  };
}

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

  it("P10.5-C-001 builds a deterministic v2 request with every trusted literal", () => {
    const first = buildProjectBriefGenerationPrompt(generationPromptInput());
    const second = buildProjectBriefGenerationPrompt(generationPromptInput());
    expect(first).toEqual(second);
    expect(first.systemPrompt).toContain("project-brief-v2");
    expect(first.systemPrompt).toContain("officialStatus");
    expect(first.systemPrompt).toContain("completedChanges");
    expect(first.systemPrompt).toContain("unknowns");
    expect(first.systemPrompt).toContain("evidenceRefs");
    expect(first.systemPrompt).toContain("Do not return Markdown");

    const envelope = JSON.parse(first.userPrompt) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      contractVersion: "project-brief-generation-prompt.v2",
      trustedConstants: {
        promptVersion: projectBriefActivePromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        projectId,
        evidenceFingerprint: fingerprint,
        rangeStart,
        rangeEnd,
        boundaryNote: projectBriefBoundaryNote,
      },
      canonicalEvidenceSnapshot: { snapshot: "synthetic" },
    });
    expect(envelope).toHaveProperty("outputTemplate.officialStatus.evidenceRefs");
    expect(envelope).toHaveProperty("outputTemplate.summary.evidenceRefs");
    expect(envelope).toHaveProperty("outputTemplate.freshness.evidenceRefs");
  });

  it("P10.5-C-002 canonicalizes ref order and rejects duplicate or invalid prompt inputs", () => {
    const input = generationPromptInput();
    const reversed = buildProjectBriefGenerationPrompt({
      ...input,
      availableEvidenceRefs: [...input.availableEvidenceRefs].reverse(),
    });
    expect(reversed).toEqual(buildProjectBriefGenerationPrompt(input));
    expect(() => buildProjectBriefGenerationPrompt({
      ...input,
      availableEvidenceRefs: [profileRef, profileRef, freshnessRef],
    })).toThrowError("project_brief_prompt_contract_invalid");
    expect(() => buildProjectBriefGenerationPrompt({
      ...input,
      canonicalEvidenceSnapshot: "not-json",
    })).toThrowError("project_brief_prompt_contract_invalid");
  });
});
