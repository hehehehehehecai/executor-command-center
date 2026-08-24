import { describe, expect, it } from "vitest";

import { projectBriefPersistenceContract } from "./project-brief";
import {
  projectBriefBoundaryNote,
  projectBriefActivePromptVersion,
  projectBriefEvidenceRefContractVersion,
  projectBriefFailureCodes,
  projectBriefPromptVersion,
  projectBriefSupportedPromptVersions,
  projectBriefSchemaVersion,
  type ProjectBrief,
} from "./project-brief-contract";
import {
  parseProjectBrief,
  projectBriefEvidenceRefAlignmentKey,
  projectBriefItemAlignmentKey,
  ProjectBriefSchemaError,
} from "./project-brief-schema";

const projectId = "a4100000-0000-4000-8000-000000000004";
const rangeStart = "2026-08-01T00:00:00.000Z";
const rangeEnd = "2026-08-08T00:00:00.000Z";
const evaluatedAt = "2026-08-08T12:00:00.000Z";

const profileRef = {
  contractVersion: "project-brief-evidence-source-ref.v1",
  sourceKind: "project_profile",
  sourceId: projectId,
  projectId,
} as const;
const commitRef = {
  contractVersion: "project-brief-evidence-source-ref.v1",
  sourceKind: "github_commit",
  sourceId: "commit-synthetic-001",
  projectId,
} as const;
const issueRef = {
  contractVersion: "project-brief-evidence-source-ref.v1",
  sourceKind: "github_issue",
  sourceId: "issue-synthetic-001",
  projectId,
} as const;
const pullRequestRef = {
  contractVersion: "project-brief-evidence-source-ref.v1",
  sourceKind: "github_pull_request",
  sourceId: "pull-request-synthetic-001",
  projectId,
} as const;
const freshnessRef = {
  contractVersion: "project-brief-evidence-source-ref.v1",
  sourceKind: "freshness",
  sourceId: "sync-run-synthetic-001",
  projectId,
} as const;

function minimalBrief(): ProjectBrief {
  return {
    promptVersion: "project-brief-v1",
    schemaVersion: "project-brief-schema-v1",
    projectId,
    evidenceFingerprint: "a".repeat(64),
    rangeStart,
    rangeEnd,
    officialStatus: {
      value: "in_development",
      evidenceRefs: [profileRef],
    },
    summary: {
      text: "Synthetic project evidence is available for the bounded period.",
      evidenceRefs: [profileRef],
    },
    completedChanges: [],
    ongoingWork: [],
    openItems: [],
    riskSignals: [],
    unknowns: [],
    evidenceRefs: [profileRef, freshnessRef],
    freshness: {
      status: "fresh",
      evaluatedAt,
      lastSuccessfulAt: "2026-08-08T11:00:00.000Z",
      coverageComplete: true,
      evidenceRefs: [freshnessRef],
    },
    boundaryNote: projectBriefBoundaryNote,
  };
}

function completeBrief(): ProjectBrief {
  return {
    ...minimalBrief(),
    completedChanges: [{
      id: "completed-change-001",
      text: "Synthetic commit metadata records a completed change.",
      evidenceRefs: [commitRef],
    }],
    ongoingWork: [{
      id: "ongoing-work-001",
      text: "Synthetic pull request metadata records ongoing work.",
      evidenceRefs: [pullRequestRef],
    }],
    openItems: [{
      id: "open-item-001",
      text: "Synthetic issue metadata records an open item.",
      evidenceRefs: [issueRef],
    }],
    riskSignals: [{
      id: "risk-signal-001",
      text: "The available freshness record is partial.",
      evidenceRefs: [freshnessRef],
    }],
    unknowns: [{
      id: "unknown-001",
      text: "Deployment outcome is unknown.",
      missingEvidence: ["No authorized deployment record is present in the snapshot."],
    }],
    evidenceRefs: [profileRef, commitRef, pullRequestRef, issueRef, freshnessRef],
    freshness: {
      ...minimalBrief().freshness,
      status: "partial",
      coverageComplete: false,
    },
  };
}

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function failure(value: unknown): { code: string; path: string | null; serialized: string } {
  try {
    parseProjectBrief(value);
    throw new Error("expected schema failure");
  } catch (error) {
    if (!(error instanceof ProjectBriefSchemaError)) throw error;
    return { code: error.code, path: error.path, serialized: JSON.stringify(error) };
  }
}

describe("Project Brief Schema contract", () => {
  it("P4-A-001 freezes prompt, schema, evidence-ref and persistence contracts", () => {
    expect({
      prompt: projectBriefPromptVersion,
      activePrompt: projectBriefActivePromptVersion,
      supportedPrompts: projectBriefSupportedPromptVersions,
      schema: projectBriefSchemaVersion,
      evidenceRef: projectBriefEvidenceRefContractVersion,
      persistence: projectBriefPersistenceContract,
      failures: projectBriefFailureCodes,
    }).toEqual({
      prompt: "project-brief-v1",
      activePrompt: "project-brief-v2",
      supportedPrompts: ["project-brief-v1", "project-brief-v2"],
      schema: "project-brief-schema-v1",
      evidenceRef: "project-brief-evidence-source-ref.v1",
      persistence: "project-brief-persistence.v1",
      failures: [
        "project_brief_schema_invalid",
        "project_brief_version_invalid",
        "project_brief_range_invalid",
        "project_brief_evidence_ref_invalid",
        "project_brief_duplicate_item",
        "project_brief_duplicate_evidence_ref",
      ],
    });
  });

  it("P4-A-002 accepts the frozen minimum with explicit empty section arrays", () => {
    expect(parseProjectBrief(minimalBrief())).toEqual(minimalBrief());
  });

  it("P4-A-003 accepts every output section without claiming evidence existence", () => {
    expect(parseProjectBrief(completeBrief())).toEqual(completeBrief());
  });

  it("P10.5-A-001 reads both frozen v1 and active v2 while rejecting unknown versions", () => {
    expect(parseProjectBrief(minimalBrief()).promptVersion).toBe("project-brief-v1");
    expect(parseProjectBrief({
      ...minimalBrief(),
      promptVersion: projectBriefActivePromptVersion,
    }).promptVersion).toBe("project-brief-v2");
    expect(failure({
      ...minimalBrief(),
      promptVersion: "project-brief-v3",
    })).toMatchObject({ code: "project_brief_version_invalid", path: "$.promptVersion" });
  });

  it.each([
    ["promptVersion", "project_brief_version_invalid"],
    ["schemaVersion", "project_brief_version_invalid"],
    ["projectId", "project_brief_schema_invalid"],
    ["evidenceFingerprint", "project_brief_schema_invalid"],
    ["rangeStart", "project_brief_range_invalid"],
    ["rangeEnd", "project_brief_range_invalid"],
    ["officialStatus", "project_brief_schema_invalid"],
    ["summary", "project_brief_schema_invalid"],
    ["completedChanges", "project_brief_schema_invalid"],
    ["ongoingWork", "project_brief_schema_invalid"],
    ["openItems", "project_brief_schema_invalid"],
    ["riskSignals", "project_brief_schema_invalid"],
    ["unknowns", "project_brief_schema_invalid"],
    ["evidenceRefs", "project_brief_evidence_ref_invalid"],
    ["freshness", "project_brief_schema_invalid"],
    ["boundaryNote", "project_brief_schema_invalid"],
  ] as const)("P4-A-004 rejects missing required field %s", (field, code) => {
    const value = clone(minimalBrief());
    delete value[field];
    expect(failure(value)).toMatchObject({ code });
  });

  it("P4-A-005 rejects unknown top-level and nested fields", () => {
    expect(failure({ ...minimalBrief(), unexpected: true })).toMatchObject({
      code: "project_brief_schema_invalid",
    });
    expect(failure({
      ...minimalBrief(),
      summary: { ...minimalBrief().summary, unexpected: true },
    })).toMatchObject({ code: "project_brief_schema_invalid" });
  });

  it("P4-A-006 rejects blank, untrimmed and over-limit text", () => {
    for (const text of ["   ", " untrimmed", "x".repeat(2_001)]) {
      expect(failure({ ...minimalBrief(), summary: { text, evidenceRefs: [profileRef] } }))
        .toMatchObject({ code: "project_brief_schema_invalid", path: "$.summary.text" });
    }
  });

  it("P4-A-007 rejects invalid item ids and over-limit section arrays", () => {
    expect(failure({
      ...minimalBrief(),
      completedChanges: [{ id: "Invalid ID", text: "Synthetic fact.", evidenceRefs: [profileRef] }],
    })).toMatchObject({ code: "project_brief_schema_invalid" });
    expect(failure({
      ...minimalBrief(),
      completedChanges: Array.from({ length: 21 }, (_, index) => ({
        id: `item-${index + 1}`,
        text: "Synthetic bounded fact.",
        evidenceRefs: [profileRef],
      })),
    })).toMatchObject({ code: "project_brief_schema_invalid" });
  });

  it("P4-A-008 rejects duplicate item ids only within the same section", () => {
    const repeated = { id: "shared-id", text: "Synthetic fact.", evidenceRefs: [profileRef] };
    expect(failure({ ...minimalBrief(), completedChanges: [repeated, repeated] }))
      .toMatchObject({ code: "project_brief_duplicate_item" });
    const repeatedUnknown = {
      id: "unknown-shared-id",
      text: "Synthetic unknown.",
      missingEvidence: ["Synthetic evidence is absent."],
    };
    expect(failure({ ...minimalBrief(), unknowns: [repeatedUnknown, repeatedUnknown] }))
      .toMatchObject({ code: "project_brief_duplicate_item" });
    expect(parseProjectBrief({
      ...minimalBrief(),
      completedChanges: [repeated],
      ongoingWork: [repeated],
    })).toMatchObject({
      completedChanges: [{ id: "shared-id" }],
      ongoingWork: [{ id: "shared-id" }],
    });
  });

  it("P4-A-009 reuses the exact Project Profile status enum", () => {
    for (const value of [
      "in_planning",
      "in_development",
      "polishing",
      "dormant",
      "completed",
      "archived",
    ] as const) {
      expect(parseProjectBrief({
        ...minimalBrief(),
        officialStatus: { value, evidenceRefs: [profileRef] },
      }).officialStatus.value).toBe(value);
    }
    expect(failure({
      ...minimalBrief(),
      officialStatus: { value: "unknown", evidenceRefs: [profileRef] },
    })).toMatchObject({ code: "project_brief_schema_invalid" });
  });

  it.each([
    ["offset timestamp", "2026-08-01T08:00:00+08:00", rangeEnd],
    ["equal boundary", rangeStart, rangeStart],
    ["reversed boundary", rangeEnd, rangeStart],
  ] as const)("P4-A-010 rejects %s", (_case, start, end) => {
    expect(failure({ ...minimalBrief(), rangeStart: start, rangeEnd: end }))
      .toMatchObject({ code: "project_brief_range_invalid" });
  });

  it("P4-A-011 rejects non-lowercase or non-64-character fingerprints", () => {
    for (const evidenceFingerprint of ["A".repeat(64), "a".repeat(63)]) {
      expect(failure({ ...minimalBrief(), evidenceFingerprint }))
        .toMatchObject({ code: "project_brief_schema_invalid" });
    }
  });

  it("P4-B-001 requires every factual item to carry at least one evidence ref", () => {
    expect(failure({
      ...minimalBrief(),
      completedChanges: [{ id: "fact-001", text: "Synthetic fact.", evidenceRefs: [] }],
    })).toMatchObject({ code: "project_brief_evidence_ref_invalid" });
  });

  it("P4-B-002 validates evidence ref shape, project binding and aggregate membership", () => {
    const malformed = { ...profileRef } as Record<string, unknown>;
    delete malformed.sourceKind;
    expect(failure({
      ...minimalBrief(),
      summary: { text: "Synthetic summary.", evidenceRefs: [malformed] },
    })).toMatchObject({ code: "project_brief_evidence_ref_invalid" });

    const otherProjectRef = {
      ...profileRef,
      projectId: "b4100000-0000-4000-8000-000000000004",
    };
    expect(failure({ ...minimalBrief(), evidenceRefs: [otherProjectRef, freshnessRef] }))
      .toMatchObject({ code: "project_brief_evidence_ref_invalid" });

    expect(failure({ ...minimalBrief(), evidenceRefs: [freshnessRef] }))
      .toMatchObject({ code: "project_brief_evidence_ref_invalid" });
  });

  it("P4-B-003 rejects duplicate refs by sourceKind + sourceId + projectId", () => {
    expect(failure({
      ...minimalBrief(),
      summary: { text: "Synthetic summary.", evidenceRefs: [profileRef, profileRef] },
    })).toMatchObject({ code: "project_brief_duplicate_evidence_ref" });
    expect(failure({
      ...minimalBrief(),
      evidenceRefs: [profileRef, profileRef, freshnessRef],
    })).toMatchObject({ code: "project_brief_duplicate_evidence_ref" });
  });

  it("P4-B-004 keeps Unknown independent and requires explicit missing evidence", () => {
    expect(parseProjectBrief(completeBrief()).unknowns).toEqual([{
      id: "unknown-001",
      text: "Deployment outcome is unknown.",
      missingEvidence: ["No authorized deployment record is present in the snapshot."],
    }]);
    expect(failure({
      ...minimalBrief(),
      unknowns: [{ id: "unknown-001", text: "Unknown.", missingEvidence: [] }],
    })).toMatchObject({ code: "project_brief_schema_invalid" });
    expect(failure({
      ...minimalBrief(),
      unknowns: [{
        id: "unknown-001",
        text: "Unknown.",
        missingEvidence: ["No record is present."],
        evidenceRefs: [profileRef],
      }],
    })).toMatchObject({ code: "project_brief_schema_invalid" });
  });

  it("P4-B-005 keeps Freshness and Boundary Note independently strict", () => {
    expect(failure({
      ...minimalBrief(),
      freshness: { ...minimalBrief().freshness, status: "unknown" },
    })).toMatchObject({ code: "project_brief_schema_invalid" });
    expect(failure({
      ...minimalBrief(),
      freshness: {
        ...minimalBrief().freshness,
        lastSuccessfulAt: "2026-08-08T13:00:00.000Z",
      },
    })).toMatchObject({ code: "project_brief_range_invalid" });
    expect(failure({ ...minimalBrief(), boundaryNote: "Synthetic custom boundary." }))
      .toMatchObject({ code: "project_brief_schema_invalid" });
  });

  it("P4-B-006 exposes unambiguous item and evidence alignment keys", () => {
    expect(projectBriefItemAlignmentKey("completedChanges", "item-001"))
      .toBe('["completedChanges","item-001"]');
    expect(projectBriefItemAlignmentKey("unknowns", "unknown-001"))
      .toBe('["unknowns","unknown-001"]');
    expect(projectBriefEvidenceRefAlignmentKey(profileRef))
      .toBe(`["project_profile","${projectId}","${projectId}"]`);
  });

  it("P4-B-007 returns only stable code and path without echoing the payload", () => {
    const privateText = "synthetic-private-payload-must-not-echo";
    const result = failure({ ...minimalBrief(), summary: { text: privateText, evidenceRefs: [] } });
    expect(result).toEqual({
      code: "project_brief_evidence_ref_invalid",
      path: "$.summary.evidenceRefs",
      serialized: '{"code":"project_brief_evidence_ref_invalid","path":"$.summary.evidenceRefs","name":"ProjectBriefSchemaError"}',
    });
    expect(result.serialized).not.toContain(privateText);
  });
});
