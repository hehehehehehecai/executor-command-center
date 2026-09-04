import { describe, expect, it } from "vitest";
import {
  projectBriefEvidenceFailureCodes,
  projectBriefEvidenceCanonicalizationContractVersion,
  projectBriefEvidenceFingerprintContractVersion,
  projectBriefEvidenceSnapshotContractVersion,
  projectBriefEvidenceSourceRefContractVersion,
} from "./contracts";
import { canonicalizeEvidenceSnapshot } from "./canonicalization";
import {
  buildProjectBriefEvidenceSnapshot,
  evidenceSourceAlignmentKey,
  type ProjectBriefEvidenceSources,
} from "./evidence-snapshot";

const userId = "a3000000-0000-4000-8000-000000000001";
const otherUserId = "b3000000-0000-4000-8000-000000000002";
const projectId = "a3100000-0000-4000-8000-000000000001";
const otherProjectId = "b3100000-0000-4000-8000-000000000002";
const rangeStart = "2026-08-01T00:00:00.000Z";
const rangeEnd = "2026-08-08T00:00:00.000Z";
const now = "2026-08-08T12:00:00.000Z";

function sources(): ProjectBriefEvidenceSources {
  return {
    authorizationStatus: "active",
    projectProfile: {
      userId,
      projectId,
      sourceId: projectId,
      sourceUpdatedAt: "2026-08-07T10:00:00.000Z",
      sourceVersion: "project-calibration.v1",
      coreGoal: "Build Cafe\u0301 intelligence\r\nwithout private payloads",
      currentStageGoal: "Evidence snapshot",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [
      {
        userId,
        projectId,
        sourceKind: "github_commit",
        sourceId: "commit-in-range",
        occurredAt: "2026-08-03T10:00:00+00:00",
        sourceUpdatedAt: "2026-08-03T10:01:00.000Z",
        sourceVersion: "tree-001",
        summary: "Normalize\r\nactivity",
        facts: { author: "synthetic-user", additions: 3 },
      },
      {
        userId,
        projectId,
        sourceKind: "github_issue",
        sourceId: "issue-at-start",
        occurredAt: rangeStart,
        sourceUpdatedAt: rangeStart,
        sourceVersion: "issue-v1",
        summary: "Boundary included",
        facts: { state: "open" },
      },
      {
        userId,
        projectId,
        sourceKind: "github_issue",
        sourceId: "issue-before-start",
        occurredAt: "2026-07-31T23:59:59.999Z",
        sourceUpdatedAt: "2026-07-31T23:59:59.999Z",
        sourceVersion: "issue-v0",
        summary: "Before range",
        facts: {},
      },
      {
        userId,
        projectId,
        sourceKind: "github_pull_request",
        sourceId: "pr-at-end",
        occurredAt: rangeEnd,
        sourceUpdatedAt: rangeEnd,
        sourceVersion: "pr-v2",
        summary: "End boundary excluded",
        facts: {},
      },
      {
        userId: otherUserId,
        projectId,
        sourceKind: "github_release",
        sourceId: "release-other-user",
        occurredAt: "2026-08-04T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-04T00:00:00.000Z",
        sourceVersion: "release-v1",
        summary: "Other user secret",
        facts: { secret: "never-visible" },
      },
      {
        userId,
        projectId: otherProjectId,
        sourceKind: "github_workflow_run",
        sourceId: "workflow-other-project",
        occurredAt: "2026-08-05T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-05T00:00:00.000Z",
        sourceVersion: "workflow-v1",
        summary: "Other project",
        facts: {},
      },
    ],
    authorizedDocuments: [
      {
        userId,
        projectId,
        sourceId: "doc-authorized",
        sourceUpdatedAt: "2026-08-06T09:00:00.000Z",
        sourceVersion: "blob-sha-001",
        sourceSha: `sha256:${"a".repeat(64)}`,
        path: "docs/architecture.md",
        documentKind: "documentation",
        authorized: true,
      },
      {
        userId,
        projectId,
        sourceId: "doc-unauthorized",
        sourceUpdatedAt: "2026-08-06T09:00:00.000Z",
        sourceVersion: "blob-sha-002",
        sourceSha: `sha256:${"b".repeat(64)}`,
        path: "README.md",
        documentKind: "readme",
        authorized: false,
      },
    ],
    confirmedDecisionsSourceAvailable: true,
    confirmedDecisions: [
      {
        userId,
        projectId,
        sourceId: "decision-confirmed",
        confirmedAt: "2026-08-05T12:00:00.000Z",
        sourceVersion: "decision-record.v1",
        status: "confirmed",
        provenance: "connected",
        decision: "Use deterministic evidence",
      },
      {
        userId,
        projectId,
        sourceId: "decision-candidate",
        confirmedAt: "2026-08-05T12:00:00.000Z",
        sourceVersion: "decision-record.v1",
        status: "candidate",
        provenance: "connected",
        decision: "Candidate must not enter",
      },
      {
        userId,
        projectId,
        sourceId: "decision-unconfirmed",
        confirmedAt: "2026-08-05T12:00:00.000Z",
        sourceVersion: "decision-record.v1",
        status: "unconfirmed",
        provenance: "connected",
        decision: "Unconfirmed must not enter",
      },
      {
        userId,
        projectId,
        sourceId: "decision-preview",
        confirmedAt: "2026-08-05T12:00:00.000Z",
        sourceVersion: "decision-record.v1",
        status: "confirmed",
        provenance: "preview",
        decision: "Preview must not enter",
      },
    ],
    freshness: {
      userId,
      projectId,
      sourceId: "sync-run-001",
      sourceUpdatedAt: "2026-08-08T11:00:00.000Z",
      sourceVersion: "freshness-status.v1",
      input: {
        authorizationRevoked: false,
        latestRun: {
          status: "completed",
          finishedAt: "2026-08-08T11:00:00.000Z",
        },
        lastSuccessfulAt: "2026-08-08T11:00:00.000Z",
        coverageComplete: true,
        now,
      },
    },
  };
}

const buildInput = { userId, projectId, rangeStart, rangeEnd, now } as const;

describe("project brief evidence contracts", () => {
  it("freezes the four Phase 3 contracts without a latest alias", () => {
    expect({
      snapshot: projectBriefEvidenceSnapshotContractVersion,
      sourceRef: projectBriefEvidenceSourceRefContractVersion,
      canonicalization: projectBriefEvidenceCanonicalizationContractVersion,
      fingerprint: projectBriefEvidenceFingerprintContractVersion,
    }).toEqual({
      snapshot: "project-brief-evidence-snapshot.v1",
      sourceRef: "project-brief-evidence-source-ref.v1",
      canonicalization: "project-brief-evidence-canonicalization.v1",
      fingerprint: "project-brief-evidence-fingerprint.v1",
    });
    expect(projectBriefEvidenceFailureCodes).toEqual([
      "invalid_request",
      "project_not_found_or_forbidden",
      "authorization_revoked",
      "freshness_unavailable",
      "source_invalid",
      "duplicate_source_ref",
      "canonicalization_failed",
    ]);
  });

  it("builds only the five reviewed content groups and reuses freshness-status.v1", () => {
    const snapshot = buildProjectBriefEvidenceSnapshot(buildInput, sources());

    expect({
      versions: {
        snapshot: snapshot.snapshotContractVersion,
        sourceRef: snapshot.sourceRefContractVersion,
        canonicalization: snapshot.canonicalizationContractVersion,
        fingerprint: snapshot.fingerprintContractVersion,
        freshness: snapshot.freshnessContractVersion,
      },
      contentKeys: [
        "projectProfile",
        "githubActivities",
        "authorizedDocuments",
        "confirmedDecisions",
        "freshness",
      ].filter((key) => key in snapshot),
    }).toEqual({
      versions: {
        snapshot: "project-brief-evidence-snapshot.v1",
        sourceRef: "project-brief-evidence-source-ref.v1",
        canonicalization: "project-brief-evidence-canonicalization.v1",
        fingerprint: "project-brief-evidence-fingerprint.v1",
        freshness: "freshness-status.v1",
      },
      contentKeys: [
        "projectProfile",
        "githubActivities",
        "authorizedDocuments",
        "confirmedDecisions",
        "freshness",
      ],
    });
  });

  it("applies current user, project, [start,end), authorization and confirmation eligibility", () => {
    const snapshot = buildProjectBriefEvidenceSnapshot(buildInput, sources());

    expect({
      activityIds: snapshot.githubActivities.map(({ sourceRef }) => sourceRef.sourceId),
      documentIds: snapshot.authorizedDocuments.map(({ sourceRef }) => sourceRef.sourceId),
      decisionIds: snapshot.confirmedDecisions.items.map(({ sourceRef }) => sourceRef.sourceId),
    }).toEqual({
      activityIds: ["issue-at-start", "commit-in-range"],
      documentIds: ["doc-authorized"],
      decisionIds: ["decision-confirmed"],
    });
  });

  it("marks confirmed decisions unavailable and empty when Connected persistence is absent", () => {
    const input = sources();
    input.confirmedDecisionsSourceAvailable = false;
    input.confirmedDecisions[0] = {
      ...input.confirmedDecisions[0]!,
      confirmedAt: "invalid-unavailable-record",
    };

    expect(buildProjectBriefEvidenceSnapshot(buildInput, input).confirmedDecisions).toEqual({
      sourceAvailability: "unavailable",
      items: [],
    });
  });

  it.each(["revoked", "suspended", "unavailable"] as const)(
    "fails closed when current authorization is %s",
    (authorizationStatus) => {
      const input = sources();
      input.authorizationStatus = authorizationStatus;

      expect(() => buildProjectBriefEvidenceSnapshot(buildInput, input)).toThrow(
        expect.objectContaining({ code: "authorization_revoked" }),
      );
    },
  );

  it("fails closed when freshness cannot be confirmed", () => {
    const input = sources();
    input.freshness = null;

    expect(() => buildProjectBriefEvidenceSnapshot(buildInput, input)).toThrow(
      expect.objectContaining({ code: "freshness_unavailable" }),
    );
  });

  it("fails closed without a partial snapshot when freshness reports revoked authorization", () => {
    const input = sources();
    if (input.freshness === null) throw new Error("fixture freshness required");
    input.freshness.input = {
      ...input.freshness.input,
      authorizationRevoked: true,
    };

    expect(() => buildProjectBriefEvidenceSnapshot(buildInput, input)).toThrow(
      expect.objectContaining({ code: "authorization_revoked" }),
    );
  });

  it("rejects duplicate sourceKind + sourceId + projectId instead of multiplying facts", () => {
    const input = sources();
    input.githubActivities.push({ ...input.githubActivities[0]! });

    expect(() => buildProjectBriefEvidenceSnapshot(buildInput, input)).toThrow(
      expect.objectContaining({ code: "duplicate_source_ref" }),
    );
  });

  it("uses an unambiguous stable source alignment key", () => {
    const sourceRef = buildProjectBriefEvidenceSnapshot(buildInput, sources())
      .githubActivities[0]!.sourceRef;

    expect(evidenceSourceAlignmentKey(sourceRef)).toBe(
      `["${sourceRef.sourceKind}","${sourceRef.sourceId}","${projectId}"]`,
    );
  });

  it("normalizes Unicode, newlines and equivalent UTC times independent of input order", () => {
    const leftSources = sources();
    const rightSources = sources();
    rightSources.projectProfile!.coreGoal =
      "Build Café intelligence\nwithout private payloads";
    rightSources.githubActivities = [...rightSources.githubActivities].reverse();
    rightSources.githubActivities[4] = {
      ...rightSources.githubActivities[4]!,
      occurredAt: "2026-08-01T02:00:00+02:00",
      sourceUpdatedAt: "2026-08-01T02:00:00+02:00",
    };

    const left = buildProjectBriefEvidenceSnapshot(buildInput, leftSources);
    const right = buildProjectBriefEvidenceSnapshot(buildInput, rightSources);

    expect({
      snapshotsEqual: left,
      canonicalLeft: canonicalizeEvidenceSnapshot(left),
    }).toEqual({
      snapshotsEqual: right,
      canonicalLeft: canonicalizeEvidenceSnapshot(right),
    });
  });

  it("rejects forbidden eligible fact fields before canonicalization", () => {
    const input = sources();
    input.githubActivities[0] = {
      ...input.githubActivities[0]!,
      facts: { rawResponse: "private complete provider body" },
    };

    expect(() => buildProjectBriefEvidenceSnapshot(buildInput, input)).toThrow(
      expect.objectContaining({ code: "source_invalid" }),
    );
  });

  it("rejects invalid request ranges with a stable non-reflective error", () => {
    expect(() => buildProjectBriefEvidenceSnapshot({
      ...buildInput,
      rangeEnd: rangeStart,
    }, sources())).toThrow(expect.objectContaining({ code: "invalid_request" }));
  });
});
