import { describe, expect, it, vi } from "vitest";

import {
  evaluateProjectBriefDatasetV3,
  loadProjectBriefEvalManifestV3,
} from "@/evaluation/project-brief/project-brief-eval-v3";

import {
  ProjectBriefStagingSmokeRunner,
  evaluateProjectBriefStagingPreflight,
  projectBriefStagingSmokeContractVersion,
} from "./project-brief-staging-smoke";

const implementationCommit = "7".repeat(40);
const rollbackCommit = "6".repeat(40);
const sha = "a".repeat(64);

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: "project-brief-staging-smoke.v1",
    environment: "staging",
    deploymentTarget: "preview",
    stagingProjectId: "staging-project",
    productionProjectId: "production-project",
    implementationCommit,
    deployedCommit: implementationCommit,
    rollbackCommit,
    testUserIdHash: sha,
    testProjectIdHash: "b".repeat(64),
    deepSeekSecretConfigured: true,
    costBoundary: "existing_free_or_configured_allowance",
    stableArtifactReplaySupported: true,
    localGatesPassed: true,
    phase9DatasetFingerprint: "83b64904bb184ba35bc9cb965de5560202794adfe41df4974cb6091a05028fdb",
    phase9ResultFingerprint: "9db13d98a88f4f33752885afa13c589a52f5364f725c334030f332e2bee0bb70",
    ...overrides,
  };
}

describe("ProjectBriefStagingSmokeRunner", () => {
  it("freshly replays the exact Phase 9 v3 release gate", async () => {
    const manifest = await loadProjectBriefEvalManifestV3();
    const result = await evaluateProjectBriefDatasetV3(manifest);
    expect(manifest.datasetFingerprint).toBe(
      "83b64904bb184ba35bc9cb965de5560202794adfe41df4974cb6091a05028fdb",
    );
    expect(result.resultFingerprint).toBe(
      "9db13d98a88f4f33752885afa13c589a52f5364f725c334030f332e2bee0bb70",
    );
    expect(result.caseCounts.expectedOutcomesMatched).toBe(14);
    expect(result.releaseGate).toBe("passed");
  });

  it("fails closed unless staging, commit, rollback, identity, cost and replay are provable", () => {
    expect(evaluateProjectBriefStagingPreflight(preflight())).toEqual({
      status: "ready",
      blockedReasons: [],
    });
    expect(evaluateProjectBriefStagingPreflight(preflight({
      stagingProjectId: "production-project",
      deployedCommit: "5".repeat(40),
      deepSeekSecretConfigured: false,
      stableArtifactReplaySupported: false,
    }))).toEqual({
      status: "blocked",
      blockedReasons: [
        "staging_not_isolated",
        "deployment_commit_mismatch",
        "deepseek_secret_unavailable",
        "stable_artifact_replay_unavailable",
      ],
    });
  });

  it("verifies one cold call, one cache hit, 3 then 0 points and one Provider success", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({
        status: "generated", energyCharged: 3,
        briefId: "40000000-0000-4000-8000-000000000004",
        invocationId: "50000000-0000-4000-8000-000000000005",
        evidenceFingerprint: sha,
      })
      .mockResolvedValueOnce({
        status: "cache_hit", energyCharged: 0,
        briefId: "40000000-0000-4000-8000-000000000004",
        invocationId: "70000000-0000-4000-8000-000000000007",
        evidenceFingerprint: sha,
      });
    const readObservation = vi.fn()
      .mockResolvedValueOnce({
        terminalStatus: "completed" as const, cacheStatus: "miss" as const,
        quotaCharge: 3, providerAttempted: true,
        evidenceFingerprint: sha, failureStage: null,
      })
      .mockResolvedValueOnce({
        terminalStatus: "completed" as const, cacheStatus: "hit" as const,
        quotaCharge: 0, providerAttempted: false,
        evidenceFingerprint: sha, failureStage: null,
      });
    const runner = new ProjectBriefStagingSmokeRunner({ generate, readObservation });
    await expect(runner.execute({
      preflight: preflight(),
      request: {
        projectId: "20000000-0000-4000-8000-000000000002",
        rangeStart: "2026-08-01T00:00:00.000Z",
        rangeEnd: "2026-08-21T00:00:00.000Z",
        requestKey: "phase10-staging-smoke-stable",
        businessDate: "2026-08-21",
      },
    })).resolves.toMatchObject({
      contractVersion: projectBriefStagingSmokeContractVersion,
      status: "passed",
      providerSuccessfulCalls: 1,
      cold: { energyCharged: 3, cacheStatus: "miss" },
      replay: { energyCharged: 0, cacheStatus: "hit" },
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]).toEqual(generate.mock.calls[1]);
    expect(readObservation).toHaveBeenCalledTimes(2);
  });

  it("rejects a second Provider call or a non-identical replay result", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({
        status: "generated", energyCharged: 3, briefId: "brief-a",
        invocationId: "invocation-a", evidenceFingerprint: sha,
      })
      .mockResolvedValueOnce({
        status: "generated", energyCharged: 3, briefId: "brief-b",
        invocationId: "invocation-b", evidenceFingerprint: "b".repeat(64),
      });
    const runner = new ProjectBriefStagingSmokeRunner({
      generate,
      readObservation: async () => ({
        terminalStatus: "completed", cacheStatus: "miss", quotaCharge: 3,
        providerAttempted: true, evidenceFingerprint: sha, failureStage: null,
      }),
    });
    await expect(runner.execute({
      preflight: preflight(),
      request: {
        projectId: "20000000-0000-4000-8000-000000000002",
        rangeStart: "2026-08-01T00:00:00.000Z",
        rangeEnd: "2026-08-21T00:00:00.000Z",
        requestKey: "phase10-staging-smoke-stable",
        businessDate: "2026-08-21",
      },
    })).rejects.toThrow("project_brief_staging_smoke_cache_replay_invalid");
  });
});
