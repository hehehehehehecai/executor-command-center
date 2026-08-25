// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { SupabaseRepositoryRemovalRepository } from "./supabase-repository-removal-repository";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const command = {
  projectId,
  mode: "REMOVE_REPOSITORY_DATA" as const,
  idempotencyKey: "phase6-remove:request-1",
  confirmation: { projectId, text: `REMOVE ${projectId}` },
};
const completedPayload = {
  operationId,
  projectId,
  mode: "REMOVE_REPOSITORY_DATA",
  status: "completed",
  outcome: "executed",
  counts: {
    deleted: { github_commits: 1 },
    preserved: { projects: 1, energy_ledger_entries: 2 },
    invalidated: { evidence_links: 1 },
  },
  safelyRetryable: true,
  completedAt: "2026-08-24T09:00:00.000Z",
} as const;

describe("SupabaseRepositoryRemovalRepository", () => {
  it("calls the one service-role RPC with verified actor and bound confirmation", async () => {
    const fetcher = vi.fn(async () => Response.json(completedPayload));
    const repository = new SupabaseRepositoryRemovalRepository({
      supabaseUrl: "https://synthetic.supabase.test/",
      serviceRoleKey: "synthetic-service-role-key",
      fetcher,
    });

    await expect(repository.execute({ actorUserId, command })).resolves.toEqual(
      completedPayload,
    );
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://synthetic.supabase.test/rest/v1/rpc/execute_repository_removal",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      apikey: "synthetic-service-role-key",
      authorization: "Bearer synthetic-service-role-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      p_actor_user_id: actorUserId,
      p_project_id: projectId,
      p_mode: "REMOVE_REPOSITORY_DATA",
      p_idempotency_key: "phase6-remove:request-1",
      p_confirmation_project_id: projectId,
      p_confirmation_text: `REMOVE ${projectId}`,
    });
  });

  it.each([
    "repository_removal_confirmation_mismatch",
    "repository_removal_not_found",
    "repository_removal_conflict",
    "repository_removal_precondition_failed",
    "repository_removal_retryable_job_conflict",
    "repository_removal_storage_failed",
  ])("surfaces the stable failure code %s", async (code) => {
    const repository = new SupabaseRepositoryRemovalRepository({
      supabaseUrl: "https://synthetic.supabase.test",
      serviceRoleKey: "synthetic-service-role-key",
      fetcher: async () => Response.json({
        operationId,
        status: "failed",
        safelyRetryable: code.endsWith("conflict") || code.endsWith("failed"),
        error: { code },
      }),
    });

    await expect(repository.execute({ actorUserId, command })).rejects.toThrow(code);
  });

  it.each([
    async () => new Response("not-json", { status: 200 }),
    async () => Response.json({ ...completedPayload, secret: "leak" }),
    async () => Response.json({ message: "postgres-secret" }, { status: 500 }),
  ])("fails closed for malformed or unknown storage responses", async (fetcher) => {
    const repository = new SupabaseRepositoryRemovalRepository({
      supabaseUrl: "https://synthetic.supabase.test",
      serviceRoleKey: "synthetic-service-role-key",
      fetcher,
    });

    await expect(repository.execute({ actorUserId, command })).rejects.toThrow(
      "repository_removal_storage_failed",
    );
  });
});
