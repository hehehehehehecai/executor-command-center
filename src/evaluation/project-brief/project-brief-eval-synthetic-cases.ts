import { canonicalizeEvidenceSnapshot } from "@/domain/project-brief-evidence/canonicalization";
import {
  buildProjectBriefEvidenceSnapshot,
  type EvidenceSourceRef,
  type ProjectBriefEvidenceSnapshot,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
  type ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";

import {
  parseProjectBriefEvalCase,
  parseProjectBriefEvalManifest,
  projectBriefEvalCaseContractVersion,
  projectBriefEvalManifestContractVersion,
  projectBriefEvalResultContractVersion,
  type ProjectBriefEvalCase,
  type ProjectBriefEvalManifest,
} from "./project-brief-eval-contracts";
import {
  fingerprintEvalCaseContent,
  fingerprintEvalCaseSubject,
  fingerprintEvalValue,
  sha256Utf8,
} from "./project-brief-eval-fingerprint";

export const syntheticProjectBriefEvalCoverage = [
  "valid_complete",
  "valid_unknown",
  "schema_extra_field",
  "evidence_not_found",
  "evidence_cross_project",
  "time_outside_range",
  "required_fact_missing",
  "forbidden_assertion",
  "unknown_leaked_as_fact",
  "readability_proxy_failure",
] as const;

type SyntheticCoverageKey =
  | "valid-complete"
  | "valid-unknown"
  | "schema-extra-field"
  | "evidence-not-found"
  | "evidence-cross-project"
  | "time-outside-range"
  | "required-fact-missing"
  | "forbidden-assertion"
  | "unknown-leaked-as-fact"
  | "readability-placeholder";

const userId = "91000000-0000-4000-8000-000000000001";
const projectId = "92000000-0000-4000-8000-000000000002";
const otherProjectId = "93000000-0000-4000-8000-000000000003";
const rangeStart = "2026-07-01T00:00:00.000Z";
const rangeEnd = "2026-08-01T00:00:00.000Z";
const evaluatedAt = "2026-08-01T00:00:00.000Z";

function evidenceReferenceId(
  sourceKind: EvidenceSourceRef["sourceKind"],
  sourceId: string,
  ownerProjectId = projectId,
): string {
  return JSON.stringify([sourceKind, sourceId, ownerProjectId]);
}

function baseSnapshot(): ProjectBriefEvidenceSnapshot {
  return buildProjectBriefEvidenceSnapshot({
    userId,
    projectId,
    rangeStart,
    rangeEnd,
    now: evaluatedAt,
  }, {
    authorizationStatus: "active",
    projectProfile: {
      userId,
      projectId,
      sourceId: "profile-synthetic-01",
      sourceUpdatedAt: "2026-07-31T11:00:00.000Z",
      sourceVersion: "profile.v1",
      coreGoal: "Deliver a bounded synthetic navigation release.",
      currentStageGoal: "Validate the project brief evaluation contract.",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [{
      userId,
      projectId,
      sourceKind: "github_issue",
      sourceId: "issue-synthetic-42",
      occurredAt: "2026-07-20T10:00:00.000Z",
      sourceUpdatedAt: "2026-07-20T11:00:00.000Z",
      sourceVersion: "issue.v1",
      summary: "Synthetic navigation work was completed.",
      facts: { state: "closed", change: "navigation" },
    }],
    authorizedDocuments: [{
      userId,
      projectId,
      sourceId: "document-synthetic-plan",
      sourceUpdatedAt: "2026-07-22T08:00:00.000Z",
      sourceVersion: "document.v1",
      sourceSha: "a".repeat(64),
      path: "docs/synthetic-plan.md",
      documentKind: "plan",
      authorized: true,
    }],
    confirmedDecisionsSourceAvailable: true,
    confirmedDecisions: [{
      userId,
      projectId,
      sourceId: "decision-synthetic-scope",
      confirmedAt: "2026-07-24T09:00:00.000Z",
      sourceVersion: "decision.v1",
      status: "confirmed",
      provenance: "connected",
      decision: "Keep the release scope bounded to navigation.",
    }],
    freshness: {
      userId,
      projectId,
      sourceId: "freshness-synthetic-01",
      sourceUpdatedAt: "2026-08-01T00:00:00.000Z",
      sourceVersion: "freshness-status.v1",
      input: {
        authorizationRevoked: false,
        latestRun: {
          status: "completed",
          finishedAt: "2026-07-31T12:00:00.000Z",
        },
        lastSuccessfulAt: "2026-07-31T12:00:00.000Z",
        coverageComplete: true,
        now: evaluatedAt,
      },
    },
  });
}

function artifactFromSnapshot(snapshot: ProjectBriefEvidenceSnapshot) {
  const canonicalPayload = canonicalizeEvidenceSnapshot(snapshot);
  return { snapshot, canonicalPayload, fingerprint: sha256Utf8(canonicalPayload) };
}

function briefRef(ref: EvidenceSourceRef): ProjectBriefEvidenceRef {
  return {
    contractVersion: projectBriefEvidenceRefContractVersion,
    sourceKind: ref.sourceKind,
    sourceId: ref.sourceId,
    projectId: ref.projectId,
  };
}

function baseBrief(snapshot: ProjectBriefEvidenceSnapshot, fingerprint: string): ProjectBrief {
  const profile = briefRef(snapshot.projectProfile.sourceRef);
  const activity = briefRef(snapshot.githubActivities[0]!.sourceRef);
  const document = briefRef(snapshot.authorizedDocuments[0]!.sourceRef);
  const decision = briefRef(snapshot.confirmedDecisions.items[0]!.sourceRef);
  const freshness = briefRef(snapshot.freshness.sourceRef);
  return {
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    projectId: snapshot.projectId,
    evidenceFingerprint: fingerprint,
    rangeStart: snapshot.rangeStart,
    rangeEnd: snapshot.rangeEnd,
    officialStatus: { value: "in_development", evidenceRefs: [profile] },
    summary: {
      text: "The synthetic project completed navigation work within the bounded period.",
      evidenceRefs: [profile, activity],
    },
    completedChanges: [{
      id: "completed-navigation",
      text: "Navigation work was completed.",
      evidenceRefs: [activity],
    }],
    ongoingWork: [{
      id: "ongoing-contract-check",
      text: "The synthetic evaluation contract remains under verification.",
      evidenceRefs: [document],
    }],
    openItems: [{
      id: "open-bounded-release",
      text: "The bounded release scope remains recorded.",
      evidenceRefs: [decision],
    }],
    riskSignals: [{
      id: "risk-single-activity",
      text: "Only one synthetic activity supports the completed change.",
      evidenceRefs: [activity],
    }],
    unknowns: [],
    evidenceRefs: [profile, activity, document, decision, freshness],
    freshness: {
      status: snapshot.freshness.status,
      evaluatedAt: snapshot.freshness.evaluatedAt,
      lastSuccessfulAt: snapshot.freshness.lastSuccessfulAt,
      coverageComplete: snapshot.freshness.coverageComplete,
      evidenceRefs: [freshness],
    },
    boundaryNote: projectBriefBoundaryNote,
  };
}

const pass = {
  schema: "pass",
  evidenceValidity: "pass",
  timeRange: "pass",
  requiredFacts: "pass",
  forbiddenAssertions: "pass",
  unknownHandling: "pass",
  readabilityAutomatic: "pass",
  readabilityHuman: "blocked",
} as const;

function buildCase(key: SyntheticCoverageKey) {
  let snapshot = baseSnapshot();
  let artifact = artifactFromSnapshot(snapshot);
  let brief: unknown = baseBrief(snapshot, artifact.fingerprint);
  let expectedValidity: "valid" | "invalid" = "valid";
  let expectedChecks: Record<keyof typeof pass, "pass" | "fail" | "blocked" | "not_applicable"> = { ...pass };
  let requiredFacts: Array<{
    factId: string;
    location: string;
    contentMatch: {
      kind: "exact_normalized" | "token_sequence";
      value: string;
    };
    requiredEvidenceReferenceIds: string[];
  }> = [{
    factId: "official-status",
    location: "officialStatus",
    contentMatch: { kind: "exact_normalized", value: "in_development" },
    requiredEvidenceReferenceIds: [
      evidenceReferenceId("project_profile", "profile-synthetic-01"),
    ],
  }, {
    factId: "summary-navigation",
    location: "summary",
    contentMatch: { kind: "token_sequence", value: "completed navigation work" },
    requiredEvidenceReferenceIds: [
      evidenceReferenceId("github_issue", "issue-synthetic-42"),
    ],
  }, {
    factId: "completed-navigation",
    location: "completedChanges:completed-navigation",
    contentMatch: { kind: "exact_normalized", value: "Navigation work was completed." },
    requiredEvidenceReferenceIds: [
      evidenceReferenceId("github_issue", "issue-synthetic-42"),
    ],
  }];
  let forbiddenAssertions: Array<{
    assertionId: string;
    match: { kind: "exact_normalized" | "token_sequence"; value: string };
  }> = [];
  let expectedUnknowns: Array<{ unknownId: string; text: string }> = [];
  let caseId = "";
  let title = "";

  switch (key) {
    case "valid-complete":
      caseId = "eval-syn-01-valid-complete";
      title = "Complete valid synthetic Brief";
      break;
    case "valid-unknown": {
      caseId = "eval-syn-02-valid-unknown";
      title = "Unknown remains explicit";
      const unknown = {
        id: "unknown-release-owner",
        text: "The release owner is not established by the bounded evidence.",
        missingEvidence: ["A confirmed ownership record is absent."],
      };
      brief = { ...(brief as ProjectBrief), unknowns: [unknown] };
      expectedUnknowns = [{ unknownId: unknown.id, text: unknown.text }];
      break;
    }
    case "schema-extra-field":
      caseId = "eval-syn-03-schema-extra-field";
      title = "Strict Schema rejects an extra field";
      brief = { ...(brief as ProjectBrief), unexpected: "synthetic private marker" };
      expectedValidity = "invalid";
      expectedChecks = {
        schema: "fail", evidenceValidity: "blocked", timeRange: "blocked",
        requiredFacts: "blocked", forbiddenAssertions: "blocked",
        unknownHandling: "blocked", readabilityAutomatic: "blocked",
        readabilityHuman: "blocked",
      };
      break;
    case "evidence-not-found": {
      caseId = "eval-syn-04-evidence-not-found";
      title = "Missing Evidence reference fails closed";
      const original = brief as ProjectBrief;
      const missing = { ...original.completedChanges[0]!.evidenceRefs[0]!, sourceId: "issue-synthetic-missing" };
      brief = {
        ...original,
        summary: { ...original.summary, evidenceRefs: [original.summary.evidenceRefs[0]!, missing] },
        completedChanges: [{ ...original.completedChanges[0]!, evidenceRefs: [missing] }],
        riskSignals: [{ ...original.riskSignals[0]!, evidenceRefs: [missing] }],
        evidenceRefs: original.evidenceRefs.map((ref) =>
          ref.sourceKind === "github_issue" ? missing : ref),
      };
      requiredFacts = requiredFacts.map((fact) => ({
        ...fact,
        requiredEvidenceReferenceIds: fact.factId === "official-status"
          ? fact.requiredEvidenceReferenceIds
          : [evidenceReferenceId("github_issue", "issue-synthetic-missing")],
      }));
      expectedValidity = "invalid";
      expectedChecks = { ...pass, evidenceValidity: "fail", timeRange: "blocked" };
      break;
    }
    case "evidence-cross-project": {
      caseId = "eval-syn-05-evidence-cross-project";
      title = "Cross-project Evidence fails closed";
      const original = structuredClone(brief as ProjectBrief) as unknown as Record<string, unknown>;
      const rewrite = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        if ("projectId" in record) record.projectId = otherProjectId;
        for (const item of Object.values(record)) {
          if (Array.isArray(item)) item.forEach(rewrite);
          else rewrite(item);
        }
      };
      rewrite(original);
      brief = original;
      requiredFacts = requiredFacts.map((fact) => ({
        ...fact,
        requiredEvidenceReferenceIds: fact.factId === "official-status"
          ? [evidenceReferenceId(
              "project_profile",
              "profile-synthetic-01",
              otherProjectId,
            )]
          : [evidenceReferenceId(
              "github_issue",
              "issue-synthetic-42",
              otherProjectId,
            )],
      }));
      expectedValidity = "invalid";
      expectedChecks = { ...pass, evidenceValidity: "fail", timeRange: "blocked" };
      break;
    }
    case "time-outside-range": {
      caseId = "eval-syn-06-time-outside-range";
      title = "Range end Evidence is excluded";
      snapshot = structuredClone(snapshot);
      (snapshot.githubActivities[0]!.sourceRef as { occurredAt: string | null }).occurredAt = rangeEnd;
      artifact = artifactFromSnapshot(snapshot);
      brief = baseBrief(snapshot, artifact.fingerprint);
      expectedValidity = "invalid";
      expectedChecks = { ...pass, evidenceValidity: "fail", timeRange: "fail" };
      break;
    }
    case "required-fact-missing": {
      caseId = "eval-syn-07-required-fact-missing";
      title = "Required fact is absent";
      const original = brief as ProjectBrief;
      brief = { ...original, completedChanges: [] };
      expectedValidity = "invalid";
      expectedChecks = { ...pass, requiredFacts: "fail" };
      break;
    }
    case "forbidden-assertion": {
      caseId = "eval-syn-08-forbidden-assertion";
      title = "Forbidden assertion is detected";
      const text = "The team must ship immediately.";
      const original = brief as ProjectBrief;
      brief = { ...original, summary: { ...original.summary, text } };
      forbiddenAssertions = [{
        assertionId: "must-ship-immediately",
        match: { kind: "exact_normalized", value: text },
      }];
      requiredFacts = requiredFacts.map((fact) => fact.location === "summary"
        ? {
            ...fact,
            contentMatch: { kind: "exact_normalized", value: text },
          }
        : fact);
      expectedValidity = "invalid";
      expectedChecks = { ...pass, forbiddenAssertions: "fail" };
      break;
    }
    case "unknown-leaked-as-fact": {
      caseId = "eval-syn-09-unknown-leaked-as-fact";
      title = "Unknown cannot be restated as fact";
      const text = "The release owner is Taylor.";
      const original = brief as ProjectBrief;
      brief = {
        ...original,
        summary: { ...original.summary, text },
        unknowns: [{
          id: "unknown-release-owner",
          text,
          missingEvidence: ["No confirmed ownership record exists."],
        }],
      };
      expectedUnknowns = [{ unknownId: "unknown-release-owner", text }];
      requiredFacts = requiredFacts.map((fact) => fact.location === "summary"
        ? {
            ...fact,
            contentMatch: { kind: "exact_normalized", value: text },
          }
        : fact);
      expectedValidity = "invalid";
      expectedChecks = { ...pass, unknownHandling: "fail" };
      break;
    }
    case "readability-placeholder": {
      caseId = "eval-syn-10-readability-placeholder";
      title = "Readability proxy rejects placeholders";
      const original = brief as ProjectBrief;
      brief = {
        ...original,
        completedChanges: [{ ...original.completedChanges[0]!, text: "TODO" }],
      };
      requiredFacts = requiredFacts.map((fact) =>
        fact.location === "completedChanges:completed-navigation"
          ? {
              ...fact,
              contentMatch: { kind: "exact_normalized", value: "TODO" },
            }
          : fact);
      expectedValidity = "invalid";
      expectedChecks = { ...pass, readabilityAutomatic: "fail" };
      break;
    }
  }

  const sourceFingerprint = fingerprintEvalValue({
    contract: "project-brief-eval-synthetic-source.v1",
    caseId,
    title,
  });
  const subject = {
    contractVersion: projectBriefEvalCaseContractVersion,
    caseId,
    caseType: "synthetic_contract" as const,
    title,
    artifact,
    candidateBrief: brief,
    expectedValidity,
    expectedChecks,
    requiredFacts,
    forbiddenAssertions,
    expectedUnknowns,
    source: {
      provenance: "synthetic_generated" as const,
      sourceFingerprint,
      redactionStatement: "synthetic_no_personal_data" as const,
    },
  };
  const withoutFingerprint = {
    ...subject,
    confirmationSubjectFingerprint: fingerprintEvalCaseSubject(subject),
    confirmationReceipt: null,
    readabilityReview: null,
  };
  return {
    ...withoutFingerprint,
    contentFingerprint: fingerprintEvalCaseContent(withoutFingerprint),
  };
}

const coverageKeys: readonly SyntheticCoverageKey[] = [
  "valid-complete", "valid-unknown", "schema-extra-field", "evidence-not-found",
  "evidence-cross-project", "time-outside-range", "required-fact-missing",
  "forbidden-assertion", "unknown-leaked-as-fact", "readability-placeholder",
];

export async function createSyntheticEvalCaseInput(
  key: SyntheticCoverageKey,
): Promise<ReturnType<typeof buildCase>> {
  return buildCase(key);
}

export async function loadSyntheticProjectBriefEvalManifest(): Promise<ProjectBriefEvalManifest> {
  const cases: ProjectBriefEvalCase[] = coverageKeys
    .map(buildCase)
    .map(parseProjectBriefEvalCase)
    .sort((left, right) => left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : 0);
  const fingerprintInput = {
    contractVersion: projectBriefEvalManifestContractVersion,
    caseContractVersion: projectBriefEvalCaseContractVersion,
    resultContractVersion: projectBriefEvalResultContractVersion,
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    cases: cases.map(({ caseId, contentFingerprint }) => ({ caseId, contentFingerprint })),
    pendingCandidates: [],
  };
  return parseProjectBriefEvalManifest({
    ...fingerprintInput,
    cases,
    counts: {
      includedTotal: cases.length,
      syntheticContract: cases.length,
      humanConfirmedHistorical: 0,
      pendingHumanConfirmation: 0,
    },
    datasetFingerprint: fingerprintEvalValue(fingerprintInput),
  });
}
