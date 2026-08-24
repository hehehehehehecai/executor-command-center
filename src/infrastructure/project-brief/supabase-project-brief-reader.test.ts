import { describe, expect, it, vi } from "vitest";

import { LoadValidatedProjectBriefUseCase } from "@/application/project-brief/load-validated-project-brief";
import {
  syntheticBriefEvaluatedAt,
  syntheticBriefFingerprint,
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefRangeEnd,
  syntheticBriefRangeStart,
  syntheticBriefUserId,
  syntheticProjectBrief,
} from "@/testing/project-brief/project-brief-fixture";

import { SupabaseProjectBriefReader } from "./supabase-project-brief-reader";

describe("SupabaseProjectBriefReader", () => {
  it("reads project briefs only through the authenticated RLS client", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "33333333-3333-4333-8333-333333333333",
      project_id: projectId,
      range_start: "2026-08-01T00:00:00.000Z",
      range_end: "2026-08-18T00:00:00.000Z",
      prompt_version: null,
      schema_version: null,
      evidence_fingerprint: null,
      status: "pending",
      payload: null,
      failure_stage: null,
      error_code: null,
      created_at: "2026-08-18T01:00:00.000Z",
      completed_at: null,
      expires_at: null,
    };
    const eq = vi.fn().mockResolvedValue({ data: [row], error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const reader = new SupabaseProjectBriefReader({ from });

    await expect(reader.listForProject(projectId)).resolves.toEqual([{
      id: row.id,
      projectId,
      rangeStart: row.range_start,
      rangeEnd: row.range_end,
      promptVersion: null,
      schemaVersion: null,
      evidenceFingerprint: null,
      status: "pending",
      payload: null,
      failureStage: null,
      errorCode: null,
      createdAt: row.created_at,
      completedAt: null,
      expiresAt: null,
    }]);
    expect(from).toHaveBeenCalledWith("project_briefs");
    expect(eq).toHaveBeenCalledWith("project_id", projectId);
  });

  it("normalizes every database datetime before returning domain records", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "33333333-3333-4333-8333-333333333333",
      project_id: projectId,
      range_start: "2026-08-01T08:00:00+08:00",
      range_end: "2026-08-18T00:00:00+00:00",
      prompt_version: "project-brief-v2",
      schema_version: "project-brief-schema-v1",
      evidence_fingerprint: "a".repeat(64),
      status: "completed",
      payload: { synthetic: true },
      failure_stage: null,
      error_code: null,
      created_at: "2026-08-18T09:00:00+08:00",
      completed_at: "2026-08-18T01:01:00+00:00",
      expires_at: "2026-08-19T09:00:00+08:00",
    };
    const reader = new SupabaseProjectBriefReader({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [row], error: null }),
        }),
      }),
    });

    await expect(reader.listForProject(projectId)).resolves.toEqual([
      expect.objectContaining({
        rangeStart: "2026-08-01T00:00:00.000Z",
        rangeEnd: "2026-08-18T00:00:00.000Z",
        createdAt: "2026-08-18T01:00:00.000Z",
        completedAt: "2026-08-18T01:01:00.000Z",
        expiresAt: "2026-08-19T01:00:00.000Z",
      }),
    ]);
  });

  it("preserves nullable datetimes and fails closed on invalid database datetime", async () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "33333333-3333-4333-8333-333333333333",
      project_id: projectId,
      range_start: "2026-08-01T00:00:00.000Z",
      range_end: "2026-08-18T00:00:00.000Z",
      prompt_version: null,
      schema_version: null,
      evidence_fingerprint: null,
      status: "pending",
      payload: null,
      failure_stage: null,
      error_code: null,
      created_at: "2026-08-18T01:00:00.000Z",
      completed_at: null,
      expires_at: null,
    };
    const validReader = new SupabaseProjectBriefReader({
      from: () => ({ select: () => ({ eq: async () => ({ data: [row], error: null }) }) }),
    });
    await expect(validReader.listForProject(projectId)).resolves.toEqual([
      expect.objectContaining({ completedAt: null, expiresAt: null }),
    ]);

    const invalidReader = new SupabaseProjectBriefReader({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [{ ...row, created_at: "not-a-datetime" }], error: null }),
        }),
      }),
    });
    await expect(invalidReader.listForProject(projectId)).rejects.toThrow(
      "project_brief_storage_failed",
    );
  });

  it("keeps an equivalent offset row valid through the real display path", async () => {
    const row = {
      id: syntheticBriefId,
      user_id: syntheticBriefUserId,
      project_id: syntheticBriefProjectId,
      range_start: "2026-08-01T08:00:00+08:00",
      range_end: "2026-08-18T00:00:00+00:00",
      prompt_version: "project-brief-v1",
      schema_version: "project-brief-schema-v1",
      evidence_fingerprint: syntheticBriefFingerprint,
      status: "completed",
      payload: syntheticProjectBrief(),
      failure_stage: null,
      error_code: null,
      created_at: "2026-08-18T09:00:00+08:00",
      completed_at: "2026-08-18T01:01:00+00:00",
      expires_at: "2026-08-19T09:00:00+08:00",
    };
    const reader = new SupabaseProjectBriefReader({
      from: () => ({ select: () => ({ eq: async () => ({ data: [row], error: null }) }) }),
    });
    const artifact = {
      snapshot: {},
      canonicalPayload: "{}",
      fingerprint: syntheticBriefFingerprint,
      cacheEquivalenceFingerprint: "b".repeat(64),
    };
    const build = vi.fn().mockResolvedValue(artifact);
    const useCase = new LoadValidatedProjectBriefUseCase({
      reader,
      evidenceBuilder: { execute: build },
      evidenceValidator: { execute: vi.fn(async () => ({ status: "valid" })) },
    });

    await expect(useCase.execute({
      actorUserId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      now: syntheticBriefEvaluatedAt,
    })).resolves.toMatchObject({
      briefId: syntheticBriefId,
      brief: {
        rangeStart: syntheticBriefRangeStart,
        rangeEnd: syntheticBriefRangeEnd,
      },
    });
  });
});
