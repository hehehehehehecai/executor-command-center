import type { EnergyReservationPersistence } from "@/application/ai-usage/ai-usage-persistence";
import type { EnergyReservationReceipt } from "@/domain/ai-usage/ai-usage";
import type { ProjectBriefEvidenceArtifact } from "@/application/project-brief-evidence/build-project-brief-evidence-snapshot";
import type { ProjectBriefEvidenceValidationSuccess } from "@/domain/project-brief-evidence/evidence-validation";
import { ProjectBriefEvidenceError } from "@/domain/project-brief-evidence/contracts";
import {
  projectBriefBoundaryNote,
  projectBriefActivePromptVersion,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
} from "@/domain/project-brief/project-brief-contract";
import {
  completedStructuredGeneration,
  emptyStructuredGenerationOutput,
  parseStructuredGenerationFailure,
  providerStructuredGenerationFailure,
  type StructuredGenerationResult,
} from "@/shared/ai/structured-generation-result";
import type { StructuredGenerationRequest } from "@/shared/ai/structured-generation-request";
import { describe, expect, it, vi } from "vitest";

import {
  GenerateProjectBriefUseCase,
  projectBriefCacheContractVersion,
  projectBriefEnergyCost,
  projectBriefGenerationContractVersion,
  projectBriefGenerationMaxOutputTokens,
  projectBriefGenerationPersistenceContractVersion,
  projectBriefGenerationSchemaName,
  ProjectBriefGenerationError,
} from "./generate-project-brief";
import type {
  ProjectBriefCache,
  ProjectBriefGenerationPersistence,
} from "./project-brief-generation-ports";

const userId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000002";
const reservationId = "30000000-0000-4000-8000-000000000003";
const briefId = "40000000-0000-4000-8000-000000000004";
const invocationId = "50000000-0000-4000-8000-000000000005";
const fingerprint = "a".repeat(64);
const cacheEquivalenceFingerprint = "b".repeat(64);
const rangeStart = "2026-08-01T00:00:00.000Z";
const rangeEnd = "2026-08-18T00:00:00.000Z";
const now = "2026-08-18T06:00:00.000Z";

const evidenceRef = {
  contractVersion: projectBriefEvidenceRefContractVersion,
  sourceKind: "project_profile" as const,
  sourceId: "profile:synthetic-phase7",
  projectId,
};

function validBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return {
    promptVersion: projectBriefPromptVersion,
    schemaVersion: projectBriefSchemaVersion,
    projectId,
    evidenceFingerprint: fingerprint,
    rangeStart,
    rangeEnd,
    officialStatus: { value: "in_development", evidenceRefs: [evidenceRef] },
    summary: { text: "Synthetic bounded summary.", evidenceRefs: [evidenceRef] },
    completedChanges: [],
    ongoingWork: [],
    openItems: [],
    riskSignals: [],
    unknowns: [{
      id: "unknown-input",
      text: "No additional facts are available.",
      missingEvidence: ["Synthetic fixture intentionally omits details."],
    }],
    evidenceRefs: [evidenceRef],
    freshness: {
      status: "fresh",
      evaluatedAt: now,
      lastSuccessfulAt: now,
      coverageComplete: true,
      evidenceRefs: [evidenceRef],
    },
    boundaryNote: projectBriefBoundaryNote,
    ...overrides,
  };
}

function activeBrief(overrides: Partial<ProjectBrief> = {}): ProjectBrief {
  return validBrief({ promptVersion: projectBriefActivePromptVersion, ...overrides });
}

function artifact(): ProjectBriefEvidenceArtifact {
  return {
    snapshot: {
      userId,
      projectId,
      rangeStart,
      rangeEnd,
      projectProfile: {
        sourceRef: {
          contractVersion: projectBriefEvidenceRefContractVersion,
          sourceKind: "project_profile",
          sourceId: evidenceRef.sourceId,
          projectId,
          occurredAt: null,
          sourceUpdatedAt: now,
          sourceVersion: "synthetic-v1",
          sourceSha: null,
        },
        coreGoal: "Synthetic core goal.",
        currentStageGoal: "Synthetic current stage goal.",
        status: "in_development",
        currentBlocker: null,
      },
      githubActivities: [],
      authorizedDocuments: [],
      confirmedDecisions: { sourceAvailability: "unavailable", items: [] },
      freshness: {
        sourceRef: {
          contractVersion: projectBriefEvidenceRefContractVersion,
          sourceKind: "freshness",
          sourceId: "freshness:synthetic-phase7",
          projectId,
          occurredAt: now,
          sourceUpdatedAt: now,
          sourceVersion: "freshness-status.v1",
          sourceSha: null,
        },
        status: "fresh",
        evaluatedAt: now,
        lastSuccessfulAt: now,
        coverageComplete: true,
      },
    } as unknown as ProjectBriefEvidenceArtifact["snapshot"],
    canonicalPayload: "{\"synthetic\":\"phase7\"}",
    fingerprint,
    cacheEquivalenceFingerprint,
  };
}

function input() {
  return {
    userId,
    projectId,
    rangeStart,
    rangeEnd,
    now,
    requestKey: "brief:phase7:synthetic",
  } as const;
}

function completedDurable(brief = activeBrief()) {
  return {
    status: "completed" as const,
    outcome: "completed" as const,
    reservationId,
    briefId,
    invocationId,
    brief,
  };
}

function harness(options: {
  cache?: Awaited<ReturnType<ProjectBriefCache["find"]>>;
  reserve?: Awaited<ReturnType<EnergyReservationPersistence["reserve"]>>;
  provider?: StructuredGenerationResult<unknown>;
  waited?: Awaited<ReturnType<ProjectBriefGenerationPersistence["waitForOutcome"]>>;
  finalizeError?: Error;
  failError?: Error;
  cacheHitError?: Error;
} = {}) {
  const calls: string[] = [];
  const builtArtifact = artifact();
  const brief = activeBrief();
  const evidenceBuilder = {
    execute: vi.fn(async () => {
      calls.push("authorization:freshness:snapshot:fingerprint");
      return builtArtifact;
    }),
  };
  const cache: ProjectBriefCache = {
    find: vi.fn(async () => {
      calls.push("cache");
      return options.cache ?? null;
    }),
  };
  const energyReservations: Pick<EnergyReservationPersistence, "reserve"> = {
    reserve: vi.fn(async () => {
      calls.push("reserve:3");
      const defaultReceipt: EnergyReservationReceipt = {
        reservationId,
        status: "reserved",
        outcome: "reserved",
        amount: 3,
        availableAfter: 7,
        businessDate: "2026-08-24",
      };
      return options.reserve ?? defaultReceipt;
    }),
  };
  const generateStructured = vi.fn(async (_request: StructuredGenerationRequest) => {
      void _request;
      calls.push("provider");
      return options.provider ?? completedStructuredGeneration(brief, {
        provider: "synthetic",
        model: "fixture-v1",
        requestId: "request-synthetic",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 30,
      });
  });
  const provider = {
    generateStructured<T>(request: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>> {
      return generateStructured(request) as Promise<StructuredGenerationResult<T>>;
    },
  };
  const evidenceValidator = {
    execute: vi.fn(async (): Promise<ProjectBriefEvidenceValidationSuccess> => {
      calls.push("evidence_validation");
      return {
        contractVersion: "project-brief-evidence-validation.v1",
        status: "valid",
        validatedReferenceCount: 1,
        evidenceFingerprint: fingerprint,
      };
    }),
  };
  const persistence: ProjectBriefGenerationPersistence = {
    waitForOutcome: vi.fn(async () => {
      calls.push("wait_durable_outcome");
      return options.waited ?? completedDurable();
    }),
    finalize: vi.fn(async (value) => {
      calls.push("atomic_save_and_consume");
      if (options.finalizeError) throw options.finalizeError;
      return completedDurable(value.brief);
    }),
    fail: vi.fn(async (value) => {
      calls.push("persist_failure_and_release");
      if (options.failError) throw options.failError;
      return {
        status: "failed" as const,
        outcome: "released" as const,
        reservationId: value.reservationId,
        failureStage: value.failureStage,
        errorCode: value.errorCode,
      };
    }),
    recordCacheHit: vi.fn(async (value) => {
      calls.push("persist_cache_hit_observation");
      if (options.cacheHitError) throw options.cacheHitError;
      return {
        status: "completed" as const,
        outcome: "cache_hit" as const,
        briefId: value.briefId,
        invocationId: "70000000-0000-4000-8000-000000000007",
        sourceInvocationId: invocationId,
      };
    }),
  };
  const useCase = new GenerateProjectBriefUseCase({
    evidenceBuilder,
    cache,
    energyReservations,
    provider,
    evidenceValidator,
    persistence,
  });
  return {
    calls,
    useCase,
    evidenceBuilder,
    cache,
    energyReservations,
    provider: { generateStructured },
    evidenceValidator,
    persistence,
  };
}

describe("GenerateProjectBriefUseCase", () => {
  it("freezes Phase 7 versions, energy cost and provider request constants", () => {
    expect(projectBriefGenerationContractVersion).toBe("project-brief-generation.v1");
    expect(projectBriefCacheContractVersion).toBe("project-brief-cache.v1");
    expect(projectBriefGenerationPersistenceContractVersion).toBe(
      "project-brief-generation-persistence.v2",
    );
    expect(projectBriefEnergyCost).toBe(3);
    expect(projectBriefGenerationSchemaName).toBe("ProjectBriefV2");
    expect(projectBriefGenerationMaxOutputTokens).toBe(8_192);
  });

  it("runs cache miss through provider, schema, evidence and atomic finalization in order", async () => {
    const h = harness();
    await expect(h.useCase.execute(input())).resolves.toMatchObject({
      contractVersion: projectBriefGenerationContractVersion,
      status: "generated",
      energyCharged: 3,
      briefId,
      invocationId,
      evidenceFingerprint: fingerprint,
    });
    expect(h.calls).toEqual([
      "authorization:freshness:snapshot:fingerprint",
      "cache",
      "reserve:3",
      "provider",
      "evidence_validation",
      "atomic_save_and_consume",
    ]);
    expect(h.energyReservations.reserve).toHaveBeenCalledWith({
      projectId,
      requestKey: "brief:phase7:synthetic",
    });
    expect(h.provider.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      schemaName: "ProjectBriefV2",
      maxOutputTokens: 8_192,
      userPrompt: expect.stringContaining(fingerprint),
    }));
    const request = vi.mocked(h.provider.generateStructured).mock.calls[0]?.[0];
    expect(request?.systemPrompt).toContain("project-brief-v2");
    expect(request?.systemPrompt).toContain("completedChanges");
    expect(JSON.parse(request?.userPrompt ?? "{}")).toMatchObject({
      trustedConstants: {
        promptVersion: "project-brief-v2",
        schemaVersion: "project-brief-schema-v1",
        projectId,
        evidenceFingerprint: fingerprint,
        rangeStart,
        rangeEnd,
        boundaryNote: projectBriefBoundaryNote,
      },
      canonicalEvidenceSnapshot: { synthetic: "phase7" },
    });
  });

  it("preserves fractional provider latency until the persistence boundary finalizes", async () => {
    const h = harness({
      provider: completedStructuredGeneration(activeBrief(), {
        provider: "synthetic",
        latencyMs: 27.5,
      }),
    });

    await expect(h.useCase.execute(input())).resolves.toMatchObject({ status: "generated" });
    expect(h.persistence.finalize).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ latencyMs: 27.5 }),
    }));
  });

  it("returns a revalidated exact cache hit for zero energy without reserving or calling provider", async () => {
    const cachedBrief = activeBrief();
    const h = harness({
      cache: {
        id: briefId,
        userId,
        projectId,
        rangeStart,
        rangeEnd,
        promptVersion: projectBriefActivePromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: fingerprint,
        cacheEquivalenceFingerprint,
        payloadFingerprint: "d".repeat(64),
        status: "completed",
        payload: cachedBrief,
        expiresAt: "2026-08-19T06:00:00.000Z",
      },
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({
      status: "cache_hit",
      energyCharged: 0,
      briefId,
      brief: cachedBrief,
    });
    expect(h.calls).toEqual([
      "authorization:freshness:snapshot:fingerprint",
      "cache",
      "persist_cache_hit_observation",
    ]);
    expect(h.energyReservations.reserve).not.toHaveBeenCalled();
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it("returns the original validated Brief when only evaluation time changes", async () => {
    const cachedBrief = activeBrief();
    const h = harness({
      cache: {
        id: briefId,
        userId,
        projectId,
        rangeStart,
        rangeEnd,
        promptVersion: projectBriefActivePromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: fingerprint,
        cacheEquivalenceFingerprint,
        payloadFingerprint: "d".repeat(64),
        status: "completed",
        payload: cachedBrief,
        expiresAt: "2026-08-19T06:00:00.000Z",
      },
    });
    const currentFingerprint = "c".repeat(64);
    vi.mocked(h.evidenceBuilder.execute).mockResolvedValueOnce({
      ...artifact(),
      fingerprint: currentFingerprint,
    });

    await expect(h.useCase.execute(input())).resolves.toMatchObject({
      status: "cache_hit",
      energyCharged: 0,
      evidenceFingerprint: fingerprint,
      invocationId: "70000000-0000-4000-8000-000000000007",
      brief: cachedBrief,
    });
    expect(h.energyReservations.reserve).not.toHaveBeenCalled();
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it("fails closed when a validated cache hit cannot persist its observation", async () => {
    const h = harness({
      cacheHitError: new Error("private observation storage error"),
      cache: {
        id: briefId, userId, projectId, rangeStart, rangeEnd,
        promptVersion: projectBriefActivePromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: fingerprint,
        cacheEquivalenceFingerprint,
        payloadFingerprint: "d".repeat(64),
        status: "completed",
        payload: activeBrief(),
        expiresAt: "2026-08-19T06:00:00.000Z",
      },
    });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "persistence",
      code: "project_brief_persistence_failed",
    });
    expect(h.energyReservations.reserve).not.toHaveBeenCalled();
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it("fails closed on a cache reader error before reserve or provider", async () => {
    const h = harness();
    vi.mocked(h.cache.find).mockRejectedValueOnce(new Error("private cache error"));
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "cache",
      code: "project_brief_cache_failed",
    });
    expect(h.energyReservations.reserve).not.toHaveBeenCalled();
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ["authorization", "project_not_found_or_forbidden", "project_brief_authorization_failed"],
    ["freshness", "freshness_unavailable", "project_brief_freshness_failed"],
    ["snapshot", "source_invalid", "project_brief_snapshot_failed"],
  ] as const)(
    "does not grant or reserve when %s evidence construction fails",
    async (stage, evidenceCode, generationCode) => {
      const h = harness();
      vi.mocked(h.evidenceBuilder.execute).mockRejectedValueOnce(
        new ProjectBriefEvidenceError(evidenceCode),
      );

      await expect(h.useCase.execute(input())).rejects.toMatchObject({
        stage,
        code: generationCode,
      });
      expect(h.cache.find).not.toHaveBeenCalled();
      expect(h.energyReservations.reserve).not.toHaveBeenCalled();
      expect(h.provider.generateStructured).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["expired", { expiresAt: now }],
    ["prompt version", { promptVersion: "project-brief-old" }],
    ["fingerprint", { evidenceFingerprint: "b".repeat(64) }],
    ["range", { rangeEnd: "2026-08-17T00:00:00.000Z" }],
    ["payload binding", { payload: activeBrief({ projectId: "60000000-0000-4000-8000-000000000006" }) }],
  ])("treats %s cache entry as a miss", async (_caseId, override) => {
    const h = harness({
      cache: {
        id: briefId,
        userId,
        projectId,
        rangeStart,
        rangeEnd,
        promptVersion: projectBriefActivePromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: fingerprint,
        cacheEquivalenceFingerprint,
        payloadFingerprint: "d".repeat(64),
        status: "completed",
        payload: activeBrief(),
        expiresAt: "2026-08-19T06:00:00.000Z",
        ...override,
      },
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({ status: "generated" });
    expect(h.energyReservations.reserve).toHaveBeenCalledOnce();
    expect(h.provider.generateStructured).toHaveBeenCalledOnce();
  });

  it("never lets a readable v1 Brief satisfy an active v2 cache lookup", async () => {
    const h = harness({
      cache: {
        id: briefId,
        userId,
        projectId,
        rangeStart,
        rangeEnd,
        promptVersion: projectBriefPromptVersion,
        schemaVersion: projectBriefSchemaVersion,
        evidenceFingerprint: fingerprint,
        cacheEquivalenceFingerprint,
        payloadFingerprint: "d".repeat(64),
        status: "completed",
        payload: validBrief(),
        expiresAt: "2026-08-19T06:00:00.000Z",
      },
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({ status: "generated" });
    expect(h.cache.find).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: projectBriefActivePromptVersion,
    }));
    expect(h.provider.generateStructured).toHaveBeenCalledOnce();
  });

  it("fails before cache, reserve and provider when artifact binding contradicts input", async () => {
    const h = harness();
    vi.mocked(h.evidenceBuilder.execute).mockResolvedValueOnce({
      ...artifact(),
      snapshot: { ...artifact().snapshot, rangeEnd: "2026-08-17T00:00:00.000Z" },
    });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "snapshot",
      code: "project_brief_snapshot_failed",
    });
    expect(h.cache.find).not.toHaveBeenCalled();
    expect(h.energyReservations.reserve).not.toHaveBeenCalled();
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ["provider_failure", providerStructuredGenerationFailure({ reasonCode: "unavailable" }), "project_brief_provider_failure"],
    ["empty_output", emptyStructuredGenerationOutput(), "project_brief_empty_output"],
    ["parse_failure", parseStructuredGenerationFailure(), "project_brief_parse_failure"],
  ])("releases the reservation for provider outcome %s", async (_caseId, provider, code) => {
    const h = harness({ provider });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      name: "ProjectBriefGenerationError",
      stage: "provider",
      code,
    });
    expect(h.persistence.fail).toHaveBeenCalledWith(expect.objectContaining({
      reservationId,
      promptVersion: "project-brief-v2",
      schemaVersion: "project-brief-schema-v1",
      evidenceFingerprint: "a".repeat(64),
      failureStage: "provider",
      errorCode: code,
    }));
    expect(h.calls.at(-1)).toBe("persist_failure_and_release");
  });

  it("preserves fractional provider latency until the persistence boundary releases failure", async () => {
    const h = harness({
      provider: providerStructuredGenerationFailure({
        reasonCode: "unavailable",
        metadata: { provider: "synthetic", latencyMs: 27.5 },
      }),
    });

    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      code: "project_brief_provider_failure",
    });
    expect(h.persistence.fail).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: "project-brief-v2",
      schemaVersion: "project-brief-schema-v1",
      metadata: expect.objectContaining({ latencyMs: 27.5 }),
    }));
  });

  it("separates schema failure and releases before returning", async () => {
    const h = harness({ provider: completedStructuredGeneration({ arbitrary: true }) });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "schema_validation",
      code: "project_brief_schema_validation_failed",
    });
    expect(h.evidenceValidator.execute).not.toHaveBeenCalled();
    expect(h.persistence.fail).toHaveBeenCalledOnce();
    expect(h.persistence.fail).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: "project-brief-v2",
      schemaVersion: "project-brief-schema-v1",
    }));
  });

  it("separates evidence failure and never finalizes Completed", async () => {
    const h = harness();
    vi.mocked(h.evidenceValidator.execute).mockRejectedValueOnce(
      new Error("evidence_source_not_found"),
    );
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "evidence_validation",
      code: "project_brief_evidence_validation_failed",
    });
    expect(h.persistence.finalize).not.toHaveBeenCalled();
    expect(h.persistence.fail).toHaveBeenCalledOnce();
    expect(h.persistence.fail).toHaveBeenCalledWith(expect.objectContaining({
      promptVersion: "project-brief-v2",
      schemaVersion: "project-brief-schema-v1",
    }));
  });

  it("returns the same durable result for a consumed replay without another provider call", async () => {
    const h = harness({
      reserve: {
        reservationId,
        status: "consumed",
        outcome: "replayed",
        amount: 3,
        availableAfter: 7,
        businessDate: "2026-08-24",
      },
      waited: completedDurable(),
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({
      status: "generated",
      briefId,
      invocationId,
      energyCharged: 3,
    });
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
    expect(h.persistence.finalize).not.toHaveBeenCalled();
  });

  it("maps insufficient balance to quota reservation failure without attempting release", async () => {
    const h = harness();
    vi.mocked(h.energyReservations.reserve).mockRejectedValueOnce(
      new Error("energy_insufficient_balance"),
    );
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "quota_reservation",
      code: "project_brief_quota_reservation_failed",
    });
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
    expect(h.persistence.fail).not.toHaveBeenCalled();
  });

  it("waits on a durable outcome for a replayed reserved request and never becomes a second owner", async () => {
    const h = harness({
      reserve: {
        reservationId,
        status: "reserved",
        outcome: "replayed",
        amount: 3,
        availableAfter: 7,
        businessDate: "2026-08-24",
      },
      waited: completedDurable(),
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({ status: "generated" });
    expect(h.persistence.waitForOutcome).toHaveBeenCalledWith(reservationId);
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
  });

  it("lets two concurrent requests elect one provider owner and one durable waiter", async () => {
    const h = harness();
    vi.mocked(h.energyReservations.reserve)
      .mockResolvedValueOnce({
        reservationId,
        status: "reserved",
        outcome: "reserved",
        amount: 3,
        availableAfter: 7,
        businessDate: "2026-08-24",
      })
      .mockResolvedValueOnce({
        reservationId,
        status: "reserved",
        outcome: "replayed",
        amount: 3,
        availableAfter: 7,
        businessDate: "2026-08-24",
      });
    let releaseWaiter: ((value: ReturnType<typeof completedDurable>) => void) | null = null;
    const durableWait = new Promise<ReturnType<typeof completedDurable>>((resolve) => {
      releaseWaiter = resolve;
    });
    vi.mocked(h.persistence.waitForOutcome).mockImplementationOnce(async () => durableWait);
    vi.mocked(h.persistence.finalize).mockImplementationOnce(async (value) => {
      const outcome = completedDurable(value.brief);
      releaseWaiter?.(outcome);
      return outcome;
    });

    const [first, second] = await Promise.all([
      h.useCase.execute(input()),
      h.useCase.execute(input()),
    ]);
    expect(first.briefId).toBe(second.briefId);
    expect(first.invocationId).toBe(second.invocationId);
    expect(h.provider.generateStructured).toHaveBeenCalledTimes(1);
    expect(h.persistence.finalize).toHaveBeenCalledTimes(1);
    expect(h.persistence.waitForOutcome).toHaveBeenCalledTimes(1);
  });

  it("replays a durable released failure without provider or another release", async () => {
    const h = harness({
      reserve: {
        reservationId,
        status: "released",
        outcome: "replayed",
        amount: 3,
        availableAfter: 10,
        businessDate: "2026-08-24",
      },
      waited: {
        status: "failed",
        outcome: "released",
        reservationId,
        failureStage: "provider",
        errorCode: "project_brief_provider_failure",
      },
    });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "provider",
      code: "project_brief_provider_failure",
    });
    expect(h.provider.generateStructured).not.toHaveBeenCalled();
    expect(h.persistence.fail).not.toHaveBeenCalled();
  });

  it("promotes release failure over the original safe failure", async () => {
    const h = harness({
      provider: emptyStructuredGenerationOutput(),
      failError: new Error("storage unavailable"),
    });
    await expect(h.useCase.execute(input())).rejects.toEqual(
      expect.objectContaining({
        name: "ProjectBriefGenerationError",
        stage: "energy_consume",
        code: "reservation_release_failed",
        originalStage: "provider",
        originalCode: "project_brief_empty_output",
      }),
    );
  });

  it("releases after atomic finalization failure and leaves completion to the database transaction", async () => {
    const h = harness({
      finalizeError: new Error("transaction rolled back"),
      waited: { status: "in_progress", outcome: "reserved", reservationId },
    });
    await expect(h.useCase.execute(input())).rejects.toMatchObject({
      stage: "persistence",
      code: "project_brief_persistence_failed",
    });
    expect(h.calls.slice(-3)).toEqual([
      "atomic_save_and_consume",
      "wait_durable_outcome",
      "persist_failure_and_release",
    ]);
  });

  it("resolves an ambiguous finalize response from the durable consumed outcome before release", async () => {
    const h = harness({
      finalizeError: new Error("response lost after commit"),
      waited: completedDurable(),
    });
    await expect(h.useCase.execute(input())).resolves.toMatchObject({
      status: "generated",
      briefId,
      invocationId,
      energyCharged: 3,
    });
    expect(h.persistence.waitForOutcome).toHaveBeenCalledWith(reservationId);
    expect(h.persistence.fail).not.toHaveBeenCalled();
  });

  it("serializes only stable failure metadata without prompt, payload or secrets", () => {
    const error = new ProjectBriefGenerationError({
      stage: "provider",
      code: "project_brief_provider_failure",
    });
    const serialized = JSON.stringify(error);
    expect(serialized).toBe(
      '{"name":"ProjectBriefGenerationError","stage":"provider","code":"project_brief_provider_failure","originalStage":null,"originalCode":null}',
    );
    expect(serialized).not.toContain("systemPrompt");
    expect(serialized).not.toContain("userPrompt");
    expect(serialized).not.toContain("Authorization");
  });
});
