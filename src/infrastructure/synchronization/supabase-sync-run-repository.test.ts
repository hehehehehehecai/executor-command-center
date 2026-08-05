// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

type AdapterModule = {
  syncRunsPersistenceContract: string;
  SupabaseSyncRunRepository: new (options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetcher?: typeof fetch;
  }) => {
    createQueued(input: Record<string, unknown>): Promise<unknown>;
    getLatest(projectId: string): Promise<unknown>;
    transition(input: Record<string, unknown>): Promise<unknown>;
  };
};

let adapter: Partial<AdapterModule> = {};

beforeAll(async () => {
  const modulePath = "./supabase-sync-run-repository";
  adapter = await import(modulePath).catch(() => ({}));
});

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const row = {
  id: runId,
  project_id: projectId,
  idempotency_key: "first-sync:fixture-001",
  trigger_source: "first_sync",
  status: "queued",
  version: 1,
  queued_at: "2026-08-05T12:00:00.000Z",
  started_at: null,
  finished_at: null,
  last_progress_at: null,
  progress_cursor: null,
  error_code: null,
  error_summary: null,
  created_at: "2026-08-05T12:00:00.000Z",
  updated_at: "2026-08-05T12:00:00.000Z",
};

function repository(fetcher: typeof fetch) {
  const Repository = adapter.SupabaseSyncRunRepository;
  expect(Repository).toBeTypeOf("function");
  return new Repository!({
    supabaseUrl: "https://fixture-project.supabase.co",
    serviceRoleKey: "fixture-service-role-key",
    fetcher,
  });
}

describe("sync-runs.v1 Supabase adapter", () => {
  it("maps a created row without leaking the database row shape", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 }));
    const result = await repository(fetcher).createQueued({
      projectId,
      idempotencyKey: row.idempotency_key,
      triggerSource: row.trigger_source,
    });
    expect(adapter.syncRunsPersistenceContract).toBe("sync-runs.v1");
    expect(result).toEqual({
      id: runId,
      projectId,
      idempotencyKey: row.idempotency_key,
      triggerSource: row.trigger_source,
      status: "queued",
      version: 1,
      queuedAt: row.queued_at,
      startedAt: null,
      finishedAt: null,
      lastProgressAt: null,
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://fixture-project.supabase.co/rest/v1/rpc/create_sync_run",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      p_project_id: projectId,
      p_idempotency_key: row.idempotency_key,
      p_trigger_source: row.trigger_source,
    });
  });

  it("reads the latest project run through a controlled RPC", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    await expect(repository(fetcher).getLatest(projectId)).resolves.toBeNull();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://fixture-project.supabase.co/rest/v1/rpc/get_latest_sync_run",
    );
  });

  it("sends expected status/version and only safe transition fields", async () => {
    const runningRow = { ...row, status: "running", version: 2, started_at: row.queued_at };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(runningRow), { status: 200 }),
    );
    await repository(fetcher).transition({
      projectId,
      runId,
      expectedStatus: "queued",
      expectedVersion: 1,
      targetStatus: "running",
      transitionedAt: row.queued_at,
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      p_project_id: projectId,
      p_run_id: runId,
      p_expected_status: "queued",
      p_expected_version: 1,
      p_target_status: "running",
      p_transitioned_at: row.queued_at,
      p_progress_cursor: null,
      p_error_code: null,
      p_error_summary: null,
    });
    expect(Object.keys(body).join(" ")).not.toMatch(/token|secret|authorization|raw|payload/i);
  });

  it.each([
    "sync_run_project_not_found",
    "sync_run_not_found",
    "sync_run_invalid_transition",
    "sync_run_concurrency_conflict",
    "sync_run_invalid_request",
  ])("preserves allow-listed safe RPC failure %s", async (message) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message }), { status: 400 }),
    );
    await expect(repository(fetcher).getLatest(projectId)).rejects.toThrow(message);
  });

  it("redacts unexpected storage failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "secret database detail" }), { status: 500 }),
    );
    await expect(repository(fetcher).getLatest(projectId)).rejects.toThrow(
      "sync_run_storage_failed",
    );
  });
});
