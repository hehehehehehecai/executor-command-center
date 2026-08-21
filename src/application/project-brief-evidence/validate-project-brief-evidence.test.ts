import { describe, expect, it } from "vitest";

import { canonicalizeEvidenceSnapshot } from "@/domain/project-brief-evidence/canonicalization";
import type { ProjectBriefEvidenceErrorCode } from "@/domain/project-brief-evidence/evidence-validation";
import {
  buildProjectBriefEvidenceSnapshot,
  type ProjectBriefEvidenceSnapshot,
  type ProjectBriefEvidenceSources,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
  type ProjectBriefEvidenceRef,
} from "@/domain/project-brief/project-brief-contract";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";
import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";

import type { ProjectBriefEvidenceArtifact } from "./build-project-brief-evidence-snapshot";
import { ValidateProjectBriefEvidenceUseCase } from "./validate-project-brief-evidence";

const actorUserId = "d6000000-0000-4000-8000-000000000006";
const otherUserId = "e6000000-0000-4000-8000-000000000006";
const projectId = "d6100000-0000-4000-8000-000000000006";
const otherProjectId = "e6100000-0000-4000-8000-000000000006";
const rangeStart = "2026-08-01T00:00:00.000Z";
const rangeEnd = "2026-08-08T00:00:00.000Z";
const rangeEndEpsilon = "2026-08-07T23:59:59.999Z";
const now = "2026-08-08T12:00:00.000Z";
const fingerprint = new NodeProjectBriefEvidenceFingerprint();

function sources(): ProjectBriefEvidenceSources {
  return {
    authorizationStatus: "active",
    projectProfile: {
      userId: actorUserId,
      projectId,
      sourceId: "profile-001",
      sourceUpdatedAt: "2026-08-09T00:00:00.000Z",
      sourceVersion: "project-calibration.v1",
      coreGoal: "Synthetic validator goal",
      currentStageGoal: "Validate evidence references",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [
      {
        userId: actorUserId,
        projectId,
        sourceKind: "github_issue",
        sourceId: "activity-at-start",
        occurredAt: rangeStart,
        sourceUpdatedAt: rangeStart,
        sourceVersion: "issue-v1",
        summary: "Synthetic issue at range start",
        facts: { state: "open" },
      },
      {
        userId: actorUserId,
        projectId,
        sourceKind: "github_commit",
        sourceId: "activity-middle",
        occurredAt: "2026-08-04T12:00:00.000Z",
        sourceUpdatedAt: "2026-08-04T12:00:00.000Z",
        sourceVersion: "tree-v1",
        summary: "Synthetic commit",
        facts: { additions: 3 },
      },
    ],
    authorizedDocuments: [
      {
        userId: actorUserId,
        projectId,
        sourceId: "document-001",
        sourceUpdatedAt: "2026-08-09T01:00:00.000Z",
        sourceVersion: "blob-v1",
        sourceSha: `sha256:${"a".repeat(64)}`,
        path: "docs/synthetic.md",
        documentKind: "documentation",
        authorized: true,
      },
    ],
    confirmedDecisionsSourceAvailable: true,
    confirmedDecisions: [
      {
        userId: actorUserId,
        projectId,
        sourceId: "decision-end-epsilon",
        confirmedAt: rangeEndEpsilon,
        sourceVersion: "decision-record.v1",
        status: "confirmed",
        provenance: "connected",
        decision: "Use strict reference validation",
      },
    ],
    freshness: {
      userId: actorUserId,
      projectId,
      sourceId: "freshness-001",
      sourceUpdatedAt: now,
      sourceVersion: "freshness-status.v1",
      input: {
        authorizationRevoked: false,
        latestRun: { status: "completed", finishedAt: now },
        lastSuccessfulAt: now,
        coverageComplete: true,
        now,
      },
    },
  };
}

function projectRef(
  snapshotRef: ProjectBriefEvidenceSnapshot["projectProfile"]["sourceRef"],
): ProjectBriefEvidenceRef {
  return {
    contractVersion: projectBriefEvidenceRefContractVersion,
    sourceKind: snapshotRef.sourceKind,
    sourceId: snapshotRef.sourceId,
    projectId: snapshotRef.projectId,
  };
}

async function artifactFromSnapshot(
  snapshot: ProjectBriefEvidenceSnapshot,
): Promise<ProjectBriefEvidenceArtifact> {
  const canonicalPayload = canonicalizeEvidenceSnapshot(snapshot);
  return {
    snapshot,
    canonicalPayload,
    fingerprint: await fingerprint.sha256Utf8(canonicalPayload),
    cacheEquivalenceFingerprint: await fingerprint.sha256Utf8(canonicalPayload),
  };
}

function briefForArtifact(artifact: ProjectBriefEvidenceArtifact): ProjectBrief {
  const refs = [
    projectRef(artifact.snapshot.projectProfile.sourceRef),
    ...artifact.snapshot.githubActivities.map(({ sourceRef }) => projectRef(sourceRef)),
    ...artifact.snapshot.authorizedDocuments.map(({ sourceRef }) => projectRef(sourceRef)),
    ...artifact.snapshot.confirmedDecisions.items.map(({ sourceRef }) => projectRef(sourceRef)),
    projectRef(artifact.snapshot.freshness.sourceRef),
  ];
  const [profileRef, startRef, middleRef, documentRef, decisionRef, freshnessRef] = refs;
  if (
    !profileRef || !startRef || !middleRef || !documentRef || !decisionRef
    || !freshnessRef
  ) {
    throw new Error("synthetic_fixture_refs_missing");
  }

  return parseProjectBrief({
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    projectId,
    evidenceFingerprint: artifact.fingerprint,
    rangeStart,
    rangeEnd,
    officialStatus: { value: "in_development", evidenceRefs: [profileRef] },
    summary: { text: "Synthetic summary.", evidenceRefs: [startRef] },
    completedChanges: [
      { id: "change-001", text: "Synthetic change.", evidenceRefs: [middleRef] },
    ],
    ongoingWork: [
      { id: "work-001", text: "Synthetic documentation.", evidenceRefs: [documentRef] },
    ],
    openItems: [
      { id: "open-001", text: "Synthetic decision.", evidenceRefs: [decisionRef] },
    ],
    riskSignals: [],
    unknowns: [
      {
        id: "unknown-001",
        text: "No deployment evidence is available.",
        missingEvidence: ["No authorized deployment source is present."],
      },
    ],
    evidenceRefs: refs,
    freshness: {
      status: artifact.snapshot.freshness.status,
      evaluatedAt: artifact.snapshot.freshness.evaluatedAt,
      lastSuccessfulAt: artifact.snapshot.freshness.lastSuccessfulAt,
      coverageComplete: artifact.snapshot.freshness.coverageComplete,
      evidenceRefs: [freshnessRef],
    },
    boundaryNote: projectBriefBoundaryNote,
  });
}

async function validFixture() {
  const snapshot = buildProjectBriefEvidenceSnapshot(
    { userId: actorUserId, projectId, rangeStart, rangeEnd, now },
    sources(),
  );
  const artifact = await artifactFromSnapshot(snapshot);
  return { artifact, brief: briefForArtifact(artifact) };
}

function replaceBriefRef(
  brief: ProjectBrief,
  sourceId: string,
  replacement: ProjectBriefEvidenceRef,
): ProjectBrief {
  const replace = (refs: readonly ProjectBriefEvidenceRef[]) =>
    refs.map((ref) => ref.sourceId === sourceId ? replacement : ref);
  return parseProjectBrief({
    ...brief,
    officialStatus: {
      ...brief.officialStatus,
      evidenceRefs: replace(brief.officialStatus.evidenceRefs),
    },
    summary: { ...brief.summary, evidenceRefs: replace(brief.summary.evidenceRefs) },
    completedChanges: brief.completedChanges.map((item) => ({
      ...item,
      evidenceRefs: replace(item.evidenceRefs),
    })),
    ongoingWork: brief.ongoingWork.map((item) => ({
      ...item,
      evidenceRefs: replace(item.evidenceRefs),
    })),
    openItems: brief.openItems.map((item) => ({
      ...item,
      evidenceRefs: replace(item.evidenceRefs),
    })),
    riskSignals: brief.riskSignals.map((item) => ({
      ...item,
      evidenceRefs: replace(item.evidenceRefs),
    })),
    evidenceRefs: replace(brief.evidenceRefs),
    freshness: {
      ...brief.freshness,
      evidenceRefs: replace(brief.freshness.evidenceRefs),
    },
  });
}

function validator(
  fingerprintPort: { sha256Utf8(value: string): Promise<string> } = fingerprint,
) {
  return new ValidateProjectBriefEvidenceUseCase({ fingerprint: fingerprintPort });
}

async function failureCode(input: {
  actorUserId: string;
  projectId: string;
  brief: ProjectBrief;
  artifact: ProjectBriefEvidenceArtifact;
}) {
  const error = await validator().execute(input).catch((caught: unknown) => caught);
  return (error as { code?: ProjectBriefEvidenceErrorCode }).code;
}

describe("Target A: artifact binding", () => {
  it("[phase6-A01] validates the exact artifact, actor, project, range, and fingerprint", async () => {
    const { artifact, brief } = await validFixture();

    await expect(validator().execute({
      actorUserId,
      projectId,
      brief,
      artifact,
    })).resolves.toEqual({
      contractVersion: "project-brief-evidence-validation.v1",
      status: "valid",
      validatedReferenceCount: 6,
      evidenceFingerprint: artifact.fingerprint,
    });
  });

  it.each([
    ["snapshotContractVersion", "tampered-snapshot.v1"],
    ["sourceRefContractVersion", "tampered-source-ref.v1"],
    ["canonicalizationContractVersion", "tampered-canonicalization.v1"],
    ["fingerprintContractVersion", "tampered-fingerprint.v1"],
    ["freshnessContractVersion", "tampered-freshness.v1"],
  ] as const)("[phase6-A02] rejects invalid artifact version %s", async (field, value) => {
    const { artifact, brief } = await validFixture();
    const snapshot = {
      ...artifact.snapshot,
      [field]: value,
    } as unknown as ProjectBriefEvidenceSnapshot;

    expect(await failureCode({
      actorUserId,
      projectId,
      brief,
      artifact: { ...artifact, snapshot },
    })).toBe("evidence_artifact_invalid");
  });

  it("[phase6-A03] rejects canonical payload text that is not the snapshot canonicalization", async () => {
    const { artifact, brief } = await validFixture();

    expect(await failureCode({
      actorUserId,
      projectId,
      brief,
      artifact: { ...artifact, canonicalPayload: `${artifact.canonicalPayload}\n` },
    })).toBe("evidence_artifact_invalid");
  });

  it("[phase6-A04] rejects an artifact fingerprint that differs from a fresh SHA-256", async () => {
    const { artifact, brief } = await validFixture();
    const mismatched = "f".repeat(64);

    expect(await failureCode({
      actorUserId,
      projectId,
      brief: { ...brief, evidenceFingerprint: mismatched },
      artifact: { ...artifact, fingerprint: mismatched },
    })).toBe("evidence_fingerprint_mismatch");
  });

  it.each(["fingerprint", "rangeStart", "rangeEnd"] as const)(
    "[phase6-A05] rejects Brief %s binding mismatch",
    async (field) => {
      const { artifact, brief } = await validFixture();
      const changed = field === "fingerprint"
        ? { ...brief, evidenceFingerprint: "e".repeat(64) }
        : field === "rangeStart"
          ? { ...brief, rangeStart: "2026-08-02T00:00:00.000Z" }
          : { ...brief, rangeEnd: "2026-08-07T00:00:00.000Z" };

      expect(await failureCode({ actorUserId, projectId, brief: changed, artifact }))
        .toBe("evidence_fingerprint_mismatch");
    },
  );

  it("[phase6-A06] rejects an unusable fingerprint dependency without leaking its error", async () => {
    const privateFailure = "private-fingerprint-failure";
    const { artifact, brief } = await validFixture();
    const error = await validator({
      sha256Utf8: async () => { throw new Error(privateFailure); },
    }).execute({ actorUserId, projectId, brief, artifact }).catch((caught) => caught);

    expect(error).toMatchObject({ code: "evidence_artifact_invalid" });
    expect(JSON.stringify(error)).not.toContain(privateFailure);
  });
});

describe("Target B: reference integrity", () => {
  it("[phase6-B01] validates all five source groups only by their alignment keys", async () => {
    const { artifact, brief } = await validFixture();
    expect(artifact.snapshot.freshness.sourceRef.occurredAt).toBe(now);
    expect(artifact.snapshot.projectProfile.sourceRef.occurredAt).toBeNull();
    expect(artifact.snapshot.authorizedDocuments[0]!.sourceRef.occurredAt).toBeNull();

    await expect(validator().execute({ actorUserId, projectId, brief, artifact }))
      .resolves.toMatchObject({ validatedReferenceCount: 6 });
  });

  it("[phase6-B02] fails when one schema-valid Brief ref has no exact source key", async () => {
    const { artifact, brief } = await validFixture();
    const original = brief.evidenceRefs.find(({ sourceId }) => sourceId === "activity-at-start")!;
    const missingRef = { ...original, sourceId: "missing-source-key" };
    const missingBrief = replaceBriefRef(brief, original.sourceId, missingRef);

    expect(await failureCode({ actorUserId, projectId, brief: missingBrief, artifact }))
      .toBe("evidence_source_not_found");
  });

  it("[phase6-B03] accepts rangeStart and rangeEnd minus one millisecond", async () => {
    const { artifact, brief } = await validFixture();
    expect(artifact.snapshot.githubActivities[0]!.sourceRef.occurredAt).toBe(rangeStart);
    expect(artifact.snapshot.confirmedDecisions.items[0]!.sourceRef.occurredAt)
      .toBe(rangeEndEpsilon);

    await expect(validator().execute({ actorUserId, projectId, brief, artifact }))
      .resolves.toMatchObject({ status: "valid" });
  });

  it("[phase6-B04] rejects activity at the exclusive rangeEnd boundary", async () => {
    const { artifact, brief } = await validFixture();
    const first = artifact.snapshot.githubActivities[0]!;
    const snapshot = {
      ...artifact.snapshot,
      githubActivities: [
        { ...first, sourceRef: { ...first.sourceRef, occurredAt: rangeEnd } },
        ...artifact.snapshot.githubActivities.slice(1),
      ],
    };
    const reboundArtifact = await artifactFromSnapshot(snapshot);

    expect(await failureCode({
      actorUserId,
      projectId,
      brief: { ...brief, evidenceFingerprint: reboundArtifact.fingerprint },
      artifact: reboundArtifact,
    })).toBe("evidence_outside_period");
  });

  it.each([null, " ", `sha256:${"b".repeat(64)}`])(
    "[phase6-B05] rejects document sourceSha %j",
    async (sourceSha) => {
      const { artifact, brief } = await validFixture();
      const document = artifact.snapshot.authorizedDocuments[0]!;
      const snapshot = {
        ...artifact.snapshot,
        authorizedDocuments: [
          { ...document, sourceRef: { ...document.sourceRef, sourceSha } },
        ],
      };
      const reboundArtifact = await artifactFromSnapshot(snapshot);

      expect(await failureCode({
        actorUserId,
        projectId,
        brief: { ...brief, evidenceFingerprint: reboundArtifact.fingerprint },
        artifact: reboundArtifact,
      })).toBe("evidence_document_sha_mismatch");
    },
  );

  it("[phase6-B06] rejects document contentFingerprint mismatch", async () => {
    const { artifact, brief } = await validFixture();
    const document = artifact.snapshot.authorizedDocuments[0]!;
    const snapshot = {
      ...artifact.snapshot,
      authorizedDocuments: [
        { ...document, contentFingerprint: `sha256:${"c".repeat(64)}` },
      ],
    };
    const reboundArtifact = await artifactFromSnapshot(snapshot);

    expect(await failureCode({
      actorUserId,
      projectId,
      brief: { ...brief, evidenceFingerprint: reboundArtifact.fingerprint },
      artifact: reboundArtifact,
    })).toBe("evidence_document_sha_mismatch");
  });
});

describe("Target C: fail-closed safety", () => {
  it("[phase6-C03] rejects actor mismatch before lower-priority project failures", async () => {
    const { artifact, brief } = await validFixture();
    expect(await failureCode({
      actorUserId: otherUserId,
      projectId: otherProjectId,
      brief: { ...brief, projectId: otherProjectId },
      artifact,
    })).toBe("evidence_wrong_user");
  });

  it.each(["input", "brief", "briefRef", "snapshotRef"] as const)(
    "[phase6-C04] rejects wrong project from %s",
    async (target) => {
      const { artifact, brief } = await validFixture();
      let inputProjectId = projectId;
      let changedBrief = brief;
      let changedArtifact = artifact;
      if (target === "input") inputProjectId = otherProjectId;
      if (target === "brief") changedBrief = { ...brief, projectId: otherProjectId };
      if (target === "briefRef") {
        changedBrief = {
          ...brief,
          evidenceRefs: brief.evidenceRefs.map((ref, index) =>
            index === 0 ? { ...ref, projectId: otherProjectId } : ref),
        };
      }
      if (target === "snapshotRef") {
        const snapshot = {
          ...artifact.snapshot,
          projectProfile: {
            ...artifact.snapshot.projectProfile,
            sourceRef: {
              ...artifact.snapshot.projectProfile.sourceRef,
              projectId: otherProjectId,
            },
          },
        };
        changedArtifact = await artifactFromSnapshot(snapshot);
        changedBrief = { ...brief, evidenceFingerprint: changedArtifact.fingerprint };
      }

      expect(await failureCode({
        actorUserId,
        projectId: inputProjectId,
        brief: changedBrief,
        artifact: changedArtifact,
      })).toBe("evidence_wrong_project");
    },
  );

  it("[phase6-C05] fails closed when Artifact freshness says authorization_revoked", async () => {
    const { artifact, brief } = await validFixture();
    const snapshot = {
      ...artifact.snapshot,
      freshness: { ...artifact.snapshot.freshness, status: "authorization_revoked" as const },
    };
    const revokedArtifact = await artifactFromSnapshot(snapshot);

    expect(await failureCode({
      actorUserId,
      projectId,
      brief: { ...brief, evidenceFingerprint: revokedArtifact.fingerprint },
      artifact: revokedArtifact,
    })).toBe("evidence_permission_revoked");
  });

  it.each(["duplicate", "blank-source", "invalid-time"] as const)(
    "[phase6-C06] rejects %s Artifact source refs",
    async (mutation) => {
      const { artifact, brief } = await validFixture();
      const first = artifact.snapshot.githubActivities[0]!;
      const githubActivities = mutation === "duplicate"
        ? [...artifact.snapshot.githubActivities, first]
        : [
            {
              ...first,
              sourceRef: {
                ...first.sourceRef,
                sourceId: mutation === "blank-source" ? " " : first.sourceRef.sourceId,
                occurredAt: mutation === "invalid-time"
                  ? "2026-08-04T12:00:00Z"
                  : first.sourceRef.occurredAt,
              },
            },
            ...artifact.snapshot.githubActivities.slice(1),
          ];
      const snapshot = { ...artifact.snapshot, githubActivities } as ProjectBriefEvidenceSnapshot;
      const mutatedArtifact = await artifactFromSnapshot(snapshot);

      expect(await failureCode({
        actorUserId,
        projectId,
        brief: { ...brief, evidenceFingerprint: mutatedArtifact.fingerprint },
        artifact: mutatedArtifact,
      })).toBe("evidence_artifact_invalid");
    },
  );

  it("[phase6-C07] applies stable priority independent of Brief ref order", async () => {
    const { artifact, brief } = await validFixture();
    const first = artifact.snapshot.githubActivities[0]!;
    const document = artifact.snapshot.authorizedDocuments[0]!;
    const snapshot = {
      ...artifact.snapshot,
      githubActivities: [
        { ...first, sourceRef: { ...first.sourceRef, occurredAt: rangeEnd } },
        ...artifact.snapshot.githubActivities.slice(1),
      ],
      authorizedDocuments: [
        { ...document, sourceRef: { ...document.sourceRef, sourceSha: null } },
      ],
    };
    const mutatedArtifact = await artifactFromSnapshot(snapshot);
    const original = brief.evidenceRefs.find(({ sourceId }) => sourceId === "activity-middle")!;
    const missingRef = { ...original, sourceId: "priority-missing-source" };
    const changedBrief = replaceBriefRef(
      { ...brief, evidenceFingerprint: mutatedArtifact.fingerprint },
      original.sourceId,
      missingRef,
    );
    const reversedBrief = {
      ...changedBrief,
      evidenceRefs: [...changedBrief.evidenceRefs].reverse(),
    };

    expect(await Promise.all([
      failureCode({ actorUserId, projectId, brief: changedBrief, artifact: mutatedArtifact }),
      failureCode({ actorUserId, projectId, brief: reversedBrief, artifact: mutatedArtifact }),
    ])).toEqual(["evidence_source_not_found", "evidence_source_not_found"]);
  });

  it("[phase6-C08] never serializes private text, user, source, path, or SHA", async () => {
    const { artifact, brief } = await validFixture();
    const privateSource = "private-source-id-never-echo";
    const original = brief.evidenceRefs.find(({ sourceId }) => sourceId === "activity-at-start")!;
    const changedBrief = replaceBriefRef(
      brief,
      original.sourceId,
      { ...original, sourceId: privateSource },
    );
    const error = await validator().execute({
      actorUserId,
      projectId,
      brief: changedBrief,
      artifact,
    }).catch((caught) => caught);
    const serialized = JSON.stringify(error);

    expect(serialized).toBe(
      '{"code":"evidence_source_not_found","name":"ProjectBriefEvidenceValidationError"}',
    );
    for (const privateValue of [
      privateSource,
      actorUserId,
      artifact.snapshot.authorizedDocuments[0]!.path,
      artifact.snapshot.authorizedDocuments[0]!.contentFingerprint,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it.each(["unknown", "unavailable-with-items"] as const)(
    "[phase6-C09] rejects confirmed Decision availability mutation %s",
    async (mutation) => {
      const { artifact, brief } = await validFixture();
      const snapshot = {
        ...artifact.snapshot,
        confirmedDecisions: {
          sourceAvailability: mutation === "unknown" ? "unknown" : "unavailable",
          items: artifact.snapshot.confirmedDecisions.items,
        },
      } as unknown as ProjectBriefEvidenceSnapshot;
      const mutatedArtifact = await artifactFromSnapshot(snapshot);

      expect(await failureCode({
        actorUserId,
        projectId,
        brief: { ...brief, evidenceFingerprint: mutatedArtifact.fingerprint },
        artifact: mutatedArtifact,
      })).toBe("evidence_artifact_invalid");
    },
  );

  it("[phase6-C10] applies every priority stage before lower failures", async () => {
    const { artifact, brief } = await validFixture();
    const revokedSnapshot = {
      ...artifact.snapshot,
      freshness: { ...artifact.snapshot.freshness, status: "authorization_revoked" as const },
    };
    const revokedArtifact = await artifactFromSnapshot(revokedSnapshot);

    const original = brief.evidenceRefs.find(({ sourceId }) => sourceId === "activity-at-start")!;
    const missingBrief = replaceBriefRef(
      brief,
      original.sourceId,
      { ...original, sourceId: "lower-priority-missing" },
    );

    const document = artifact.snapshot.authorizedDocuments[0]!;
    const activity = artifact.snapshot.githubActivities[0]!;
    const outsideAndDocumentSnapshot = {
      ...artifact.snapshot,
      githubActivities: [
        { ...activity, sourceRef: { ...activity.sourceRef, occurredAt: rangeEnd } },
        ...artifact.snapshot.githubActivities.slice(1),
      ],
      authorizedDocuments: [
        { ...document, sourceRef: { ...document.sourceRef, sourceSha: null } },
      ],
    };
    const outsideAndDocumentArtifact = await artifactFromSnapshot(
      outsideAndDocumentSnapshot,
    );

    expect(await Promise.all([
      failureCode({
        actorUserId: otherUserId,
        projectId,
        brief,
        artifact: { ...artifact, canonicalPayload: `${artifact.canonicalPayload}\n` },
      }),
      failureCode({
        actorUserId,
        projectId: otherProjectId,
        brief: { ...brief, evidenceFingerprint: "e".repeat(64) },
        artifact: revokedArtifact,
      }),
      failureCode({
        actorUserId,
        projectId,
        brief,
        artifact: revokedArtifact,
      }),
      failureCode({
        actorUserId,
        projectId,
        brief: { ...missingBrief, evidenceFingerprint: "e".repeat(64) },
        artifact,
      }),
      failureCode({
        actorUserId,
        projectId,
        brief: { ...brief, evidenceFingerprint: outsideAndDocumentArtifact.fingerprint },
        artifact: outsideAndDocumentArtifact,
      }),
    ])).toEqual([
      "evidence_artifact_invalid",
      "evidence_wrong_project",
      "evidence_permission_revoked",
      "evidence_fingerprint_mismatch",
      "evidence_outside_period",
    ]);
  });
});
