import {
  projectBriefBoundaryNote,
  projectBriefEvidenceRefContractVersion,
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
  type ProjectBrief,
} from "@/domain/project-brief/project-brief-contract";
import { createStructuredGenerationMetadata } from "@/shared/ai/structured-generation-result";
import { describe, expect, it, vi } from "vitest";

import { SupabaseProjectBriefGenerationPersistence } from "./supabase-project-brief-generation-persistence";

const projectId = "20000000-0000-4000-8000-000000000002";
const reservationId = "30000000-0000-4000-8000-000000000003";
const briefId = "40000000-0000-4000-8000-000000000004";
const invocationId = "50000000-0000-4000-8000-000000000005";
const ref = {
  contractVersion: projectBriefEvidenceRefContractVersion,
  sourceKind: "project_profile" as const,
  sourceId: "profile:phase7-persistence",
  projectId,
};
const brief: ProjectBrief = {
  promptVersion: projectBriefPromptVersion,
  schemaVersion: projectBriefSchemaVersion,
  projectId,
  evidenceFingerprint: "a".repeat(64),
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-18T00:00:00.000Z",
  officialStatus: { value: "in_development", evidenceRefs: [ref] },
  summary: { text: "Synthetic persistence summary.", evidenceRefs: [ref] },
  completedChanges: [],
  ongoingWork: [],
  openItems: [],
  riskSignals: [],
  unknowns: [],
  evidenceRefs: [ref],
  freshness: {
    status: "fresh",
    evaluatedAt: "2026-08-18T06:00:00.000Z",
    lastSuccessfulAt: "2026-08-18T06:00:00.000Z",
    coverageComplete: true,
    evidenceRefs: [ref],
  },
  boundaryNote: projectBriefBoundaryNote,
};

describe("SupabaseProjectBriefGenerationPersistence", () => {
  it("maps finalization to one atomic RPC and parses the durable Brief", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: "completed",
        outcome: "completed",
        reservation_id: reservationId,
        brief_id: briefId,
        invocation_id: invocationId,
        brief,
      },
      error: null,
    }));
    const persistence = new SupabaseProjectBriefGenerationPersistence({
      trustedRpc: { rpc },
      authenticatedRpc: { rpc: vi.fn() },
      actorUserId: "10000000-0000-4000-8000-000000000001",
    });
    await expect(persistence.finalize({
      reservationId,
      rangeStart: brief.rangeStart,
      rangeEnd: brief.rangeEnd,
      promptVersion: brief.promptVersion,
      schemaVersion: brief.schemaVersion,
      evidenceFingerprint: brief.evidenceFingerprint,
      brief,
      expiresAt: "2026-08-19T06:00:00.000Z",
      metadata: createStructuredGenerationMetadata({
        provider: "synthetic",
        model: "fixture-v1",
        requestId: "request-1",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 30,
      }),
    })).resolves.toMatchObject({ status: "completed", briefId, invocationId, brief });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("finalize_project_brief_generation", {
      p_actor_user_id: "10000000-0000-4000-8000-000000000001",
      p_reservation_id: reservationId,
      p_range_start: brief.rangeStart,
      p_range_end: brief.rangeEnd,
      p_prompt_version: brief.promptVersion,
      p_schema_version: brief.schemaVersion,
      p_evidence_fingerprint: brief.evidenceFingerprint,
      p_payload: brief,
      p_expires_at: "2026-08-19T06:00:00.000Z",
      p_provider: "synthetic",
      p_model: "fixture-v1",
      p_request_id: "request-1",
      p_input_tokens: 10,
      p_output_tokens: 20,
      p_latency_ms: 30,
    });
  });

  it("atomically records a safe failure and release through one RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: "failed",
        outcome: "released",
        reservation_id: reservationId,
        failure_stage: "provider",
        error_code: "project_brief_provider_failure",
      },
      error: null,
    }));
    const persistence = new SupabaseProjectBriefGenerationPersistence({
      trustedRpc: { rpc },
      authenticatedRpc: { rpc: vi.fn() },
      actorUserId: "10000000-0000-4000-8000-000000000001",
    });
    await expect(persistence.fail({
      reservationId,
      evidenceFingerprint: brief.evidenceFingerprint,
      failureStage: "provider",
      errorCode: "project_brief_provider_failure",
      metadata: createStructuredGenerationMetadata({ provider: "synthetic" }),
    })).resolves.toMatchObject({ status: "failed", outcome: "released" });
    expect(rpc).toHaveBeenCalledWith("fail_project_brief_generation", {
      p_actor_user_id: "10000000-0000-4000-8000-000000000001",
      p_reservation_id: reservationId,
      p_failure_stage: "provider",
      p_error_code: "project_brief_provider_failure",
      p_provider: "synthetic",
      p_model: null,
      p_request_id: null,
      p_input_fingerprint: brief.evidenceFingerprint,
      p_input_tokens: null,
      p_output_tokens: null,
      p_latency_ms: null,
    });
  });

  it("polls only the durable RPC for a replayed reserved request", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { status: "in_progress", outcome: "reserved", reservation_id: reservationId },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "completed",
          outcome: "replayed",
          reservation_id: reservationId,
          brief_id: briefId,
          invocation_id: invocationId,
          brief,
        },
        error: null,
      });
    const sleep = vi.fn(async () => undefined);
    const persistence = new SupabaseProjectBriefGenerationPersistence(
      {
        trustedRpc: { rpc: vi.fn() },
        authenticatedRpc: { rpc },
        actorUserId: "10000000-0000-4000-8000-000000000001",
      },
      { attempts: 3, intervalMs: 5, sleep },
    );
    await expect(persistence.waitForOutcome(reservationId)).resolves.toMatchObject({
      status: "completed",
      outcome: "replayed",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("returns in_progress after the bounded wait and never creates an in-memory owner lock", async () => {
    const rpc = vi.fn(async () => ({
      data: { status: "in_progress", outcome: "reserved", reservation_id: reservationId },
      error: null,
    }));
    const persistence = new SupabaseProjectBriefGenerationPersistence(
      {
        trustedRpc: { rpc: vi.fn() },
        authenticatedRpc: { rpc },
        actorUserId: "10000000-0000-4000-8000-000000000001",
      },
      { attempts: 2, intervalMs: 1, sleep: async () => undefined },
    );
    await expect(persistence.waitForOutcome(reservationId)).resolves.toMatchObject({
      status: "in_progress",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("returns only stable RPC errors and rejects malformed private payloads", async () => {
    const stable = new SupabaseProjectBriefGenerationPersistence({
      trustedRpc: { rpc: vi.fn() },
      authenticatedRpc: {
        rpc: async () => ({
          data: null,
          error: { message: "project_brief_generation_idempotency_conflict" },
        }),
      },
      actorUserId: "10000000-0000-4000-8000-000000000001",
    });
    await expect(stable.waitForOutcome(reservationId)).rejects.toThrow(
      "project_brief_generation_idempotency_conflict",
    );

    const privateFailure = new SupabaseProjectBriefGenerationPersistence({
      trustedRpc: { rpc: vi.fn() },
      authenticatedRpc: {
        rpc: async () => ({ data: null, error: { message: "raw private payload" } }),
      },
      actorUserId: "10000000-0000-4000-8000-000000000001",
    });
    await expect(privateFailure.waitForOutcome(reservationId)).rejects.toThrow(
      "project_brief_generation_storage_failed",
    );
  });
});
