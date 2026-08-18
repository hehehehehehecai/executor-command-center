import { describe, expect, it, vi } from "vitest";

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
});
