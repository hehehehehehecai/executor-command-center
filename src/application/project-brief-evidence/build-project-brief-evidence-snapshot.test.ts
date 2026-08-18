import { describe, expect, it } from "vitest";
import type {
  ProjectBriefEvidenceSources,
  RawFreshnessSource,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import { NodeProjectBriefEvidenceFingerprint } from "@/infrastructure/project-brief-evidence/node-project-brief-evidence-fingerprint";
import { BuildProjectBriefEvidenceSnapshotUseCase } from "./build-project-brief-evidence-snapshot";

const userId = "c3000000-0000-4000-8000-000000000003";
const projectId = "c3100000-0000-4000-8000-000000000003";
const input = {
  userId,
  projectId,
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-08T00:00:00.000Z",
  now: "2026-08-08T12:00:00.000Z",
} as const;

function sourceData(): Omit<ProjectBriefEvidenceSources, "freshness"> {
  return {
    authorizationStatus: "active",
    projectProfile: {
      userId,
      projectId,
      sourceId: projectId,
      sourceUpdatedAt: "2026-08-07T00:00:00.000Z",
      sourceVersion: "project-calibration.v1",
      coreGoal: "Synthetic goal",
      currentStageGoal: "Deterministic evidence",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [
      {
        userId,
        projectId,
        sourceKind: "github_commit",
        sourceId: "commit-001",
        occurredAt: "2026-08-03T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-03T00:00:00.000Z",
        sourceVersion: "tree-001",
        summary: "Synthetic commit",
        facts: { author: "synthetic" },
      },
    ],
    authorizedDocuments: [],
    confirmedDecisionsSourceAvailable: false,
    confirmedDecisions: [],
  };
}

function freshness(overrides: Partial<RawFreshnessSource> = {}): RawFreshnessSource {
  return {
    userId,
    projectId,
    sourceId: "sync-001",
    sourceUpdatedAt: "2026-08-08T11:00:00.000Z",
    sourceVersion: "freshness-status.v1",
    input: {
      authorizationRevoked: false,
      latestRun: { status: "completed", finishedAt: "2026-08-08T11:00:00.000Z" },
      lastSuccessfulAt: "2026-08-08T11:00:00.000Z",
      coverageComplete: true,
      now: input.now,
    },
    ...overrides,
  };
}

function useCase(
  source = sourceData(),
  freshnessValue: RawFreshnessSource | null = freshness(),
) {
  return new BuildProjectBriefEvidenceSnapshotUseCase({
    sourceReader: { read: async () => source },
    freshnessReader: { read: async () => freshnessValue },
    fingerprint: new NodeProjectBriefEvidenceFingerprint(),
  });
}

describe("BuildProjectBriefEvidenceSnapshotUseCase", () => {
  it("returns a canonical payload and lowercase 64 character SHA-256 fingerprint", async () => {
    const result = await useCase().execute(input);

    expect({
      fingerprint: result.fingerprint,
      canonicalPayload: result.canonicalPayload,
      parsed: JSON.parse(result.canonicalPayload),
    }).toEqual({
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      canonicalPayload: JSON.stringify(JSON.parse(result.canonicalPayload)),
      parsed: result.snapshot,
    });
  });

  it("produces identical payload and fingerprint for equivalent source return order", async () => {
    const left = sourceData();
    left.githubActivities.push({
      ...left.githubActivities[0]!,
      sourceId: "commit-002",
      occurredAt: "2026-08-04T00:00:00.000Z",
      sourceUpdatedAt: "2026-08-04T00:00:00.000Z",
    });
    const right = { ...left, githubActivities: [...left.githubActivities].reverse() };

    const [leftResult, rightResult] = await Promise.all([
      useCase(left).execute(input),
      useCase(right).execute(input),
    ]);

    expect({ payload: leftResult.canonicalPayload, fingerprint: leftResult.fingerprint })
      .toEqual({ payload: rightResult.canonicalPayload, fingerprint: rightResult.fingerprint });
  });

  it.each([
    ["eligible fact", (data: ReturnType<typeof sourceData>): void => {
      data.githubActivities[0] = { ...data.githubActivities[0]!, summary: "Changed" };
    }],
    ["source version", (data: ReturnType<typeof sourceData>): void => {
      data.githubActivities[0] = { ...data.githubActivities[0]!, sourceVersion: "tree-002" };
    }],
    ["snapshot contract input range", (): void => undefined],
    ["freshness status", (): void => undefined],
  ] as const)("changes fingerprint when %s changes", async (mutation, mutate) => {
    const baseline = await useCase().execute(input);
    const changedSources = sourceData();
    mutate(changedSources);
    const changedInput = mutation === "snapshot contract input range"
      ? { ...input, rangeEnd: "2026-08-09T00:00:00.000Z" }
      : input;
    const changedFreshness = mutation === "freshness status"
      ? freshness({
          input: {
            ...freshness().input,
            lastSuccessfulAt: "2026-08-06T00:00:00.000Z",
          },
        })
      : freshness();
    const changed = await useCase(changedSources, changedFreshness).execute(changedInput);

    expect(changed.fingerprint).not.toBe(baseline.fingerprint);
  });

  it("normalizes reader failures to a stable error without returning partial evidence", async () => {
    const useCaseWithFailure = new BuildProjectBriefEvidenceSnapshotUseCase({
      sourceReader: { read: async () => { throw new Error(`raw ${otherUserSecret}`); } },
      freshnessReader: { read: async () => freshness() },
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });

    const error = await useCaseWithFailure.execute(input).catch((caught) => caught);
    expect({ code: error?.code, serialized: JSON.stringify(error) }).toEqual({
      code: "source_invalid",
      serialized: '{"code":"source_invalid","name":"ProjectBriefEvidenceError"}',
    });
  });

  it("fails closed when project ownership cannot be established", async () => {
    const missing = new BuildProjectBriefEvidenceSnapshotUseCase({
      sourceReader: { read: async () => null },
      freshnessReader: { read: async () => freshness() },
      fingerprint: new NodeProjectBriefEvidenceFingerprint(),
    });

    await expect(missing.execute(input)).rejects.toMatchObject({
      code: "project_not_found_or_forbidden",
    });
  });

  it("rejects a non-SHA-256 fingerprint as canonicalization_failed", async () => {
    const invalidFingerprint = new BuildProjectBriefEvidenceSnapshotUseCase({
      sourceReader: { read: async () => sourceData() },
      freshnessReader: { read: async () => freshness() },
      fingerprint: { sha256Utf8: async () => "NOT-A-SHA-256" },
    });

    await expect(invalidFingerprint.execute(input)).rejects.toMatchObject({
      code: "canonicalization_failed",
    });
  });
});

const otherUserSecret = "other-user-private-document-never-echo";
