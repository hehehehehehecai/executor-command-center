import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildProjectBriefEvidenceCacheEquivalence,
  canonicalizeProjectBriefEvidenceCacheEquivalence,
  projectBriefEvidenceCacheEquivalenceContractVersion,
} from "./cache-equivalence";
import type { ProjectBriefEvidenceSnapshot } from "./evidence-snapshot";

function snapshot(now: string): ProjectBriefEvidenceSnapshot {
  return {
    snapshotContractVersion: "project-brief-evidence-snapshot.v1",
    sourceRefContractVersion: "project-brief-evidence-source-ref.v1",
    canonicalizationContractVersion: "project-brief-evidence-canonicalization.v1",
    fingerprintContractVersion: "project-brief-evidence-fingerprint.v1",
    freshnessContractVersion: "freshness-status.v1",
    userId: "10000000-0000-4000-8000-000000000001",
    projectId: "20000000-0000-4000-8000-000000000002",
    rangeStart: "2026-08-01T00:00:00.000Z",
    rangeEnd: "2026-08-18T00:00:00.000Z",
    projectProfile: {
      sourceRef: {
        contractVersion: "project-brief-evidence-source-ref.v1",
        sourceKind: "project_profile",
        sourceId: "profile-1",
        projectId: "20000000-0000-4000-8000-000000000002",
        occurredAt: null,
        sourceUpdatedAt: "2026-08-17T00:00:00.000Z",
        sourceVersion: "profile-v1",
        sourceSha: null,
      },
      coreGoal: "Goal",
      currentStageGoal: "Stage",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [],
    authorizedDocuments: [],
    confirmedDecisions: { sourceAvailability: "unavailable", items: [] },
    freshness: {
      sourceRef: {
        contractVersion: "project-brief-evidence-source-ref.v1",
        sourceKind: "freshness",
        sourceId: "sync-1",
        projectId: "20000000-0000-4000-8000-000000000002",
        occurredAt: now,
        sourceUpdatedAt: "2026-08-18T05:00:00.000Z",
        sourceVersion: "freshness-status.v1",
        sourceSha: null,
      },
      status: "fresh",
      evaluatedAt: now,
      lastSuccessfulAt: "2026-08-18T05:00:00.000Z",
      coverageComplete: true,
    },
  };
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("Project Brief evidence cache equivalence", () => {
  it("freezes the version and ignores only the pure evaluation timestamps", () => {
    expect(projectBriefEvidenceCacheEquivalenceContractVersion)
      .toBe("project-brief-evidence-cache-equivalence.v1");
    const first = snapshot("2026-08-18T06:00:00.000Z");
    const replay = snapshot("2026-08-18T06:00:01.000Z");

    expect(sha(JSON.stringify(first))).not.toBe(sha(JSON.stringify(replay)));
    expect(canonicalizeProjectBriefEvidenceCacheEquivalence(
      buildProjectBriefEvidenceCacheEquivalence(first),
    )).toBe(canonicalizeProjectBriefEvidenceCacheEquivalence(
      buildProjectBriefEvidenceCacheEquivalence(replay),
    ));
  });

  it.each([
    ["source version", (value: ProjectBriefEvidenceSnapshot) => ({
      ...value,
      projectProfile: {
        ...value.projectProfile,
        sourceRef: { ...value.projectProfile.sourceRef, sourceVersion: "profile-v2" },
      },
    })],
    ["freshness status", (value: ProjectBriefEvidenceSnapshot) => ({
      ...value,
      freshness: { ...value.freshness, status: "stale" as const },
    })],
    ["last successful time", (value: ProjectBriefEvidenceSnapshot) => ({
      ...value,
      freshness: {
        ...value.freshness,
        lastSuccessfulAt: "2026-08-17T05:00:00.000Z",
      },
    })],
    ["coverage", (value: ProjectBriefEvidenceSnapshot) => ({
      ...value,
      freshness: { ...value.freshness, coverageComplete: false },
    })],
    ["range", (value: ProjectBriefEvidenceSnapshot) => ({
      ...value,
      rangeStart: "2026-08-02T00:00:00.000Z",
    })],
  ] as const)("changes when %s changes", (_name, mutate) => {
    const baseline = canonicalizeProjectBriefEvidenceCacheEquivalence(
      buildProjectBriefEvidenceCacheEquivalence(snapshot("2026-08-18T06:00:00.000Z")),
    );
    const changed = canonicalizeProjectBriefEvidenceCacheEquivalence(
      buildProjectBriefEvidenceCacheEquivalence(
        mutate(snapshot("2026-08-18T06:00:00.000Z")),
      ),
    );
    expect(changed).not.toBe(baseline);
  });
});
