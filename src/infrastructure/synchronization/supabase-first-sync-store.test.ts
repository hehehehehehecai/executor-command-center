import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  FirstSyncCheckpointInput,
  FirstSyncProjectContext,
  FirstSyncRunStore,
  GitHubActivitySnapshotWriter,
} from "@/application/synchronization/first-sync-use-cases";

vi.mock("server-only", () => ({}));

type AdapterModule = {
  SupabaseFirstSyncStore: new (options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetcher?: typeof fetch;
  }) => FirstSyncRunStore & GitHubActivitySnapshotWriter & {
    getByProjectId(projectId: string): Promise<FirstSyncProjectContext | null>;
  };
  firstSyncPersistenceContract: string;
};

let adapter: AdapterModule;

beforeAll(async () => {
  adapter = await import("./supabase-first-sync-store");
});

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const serviceRoleKey = "synthetic-service-role-placeholder";
const cursor = JSON.stringify({ version: "first-sync-cursor.v1" });

const runRow = {
  id: runId,
  project_id: projectId,
  idempotency_key: "first-sync:request-001",
  trigger_source: "first_sync",
  status: "running",
  version: 3,
  queued_at: "2026-08-06T02:00:00.000Z",
  started_at: "2026-08-06T02:01:00.000Z",
  finished_at: null,
  last_progress_at: "2026-08-06T02:02:00.000Z",
  progress_cursor: cursor,
  error_code: null,
  error_summary: null,
  created_at: "2026-08-06T02:00:00.000Z",
  updated_at: "2026-08-06T02:02:00.000Z",
};

function store(fetcher: typeof fetch) {
  return new adapter.SupabaseFirstSyncStore({
    supabaseUrl: "https://synthetic.supabase.invalid/",
    serviceRoleKey,
    fetcher,
  });
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SupabaseFirstSyncStore", () => {
  it("binds the persistence contract and reads exact project-owned context", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      project_id: projectId,
      github_repository_id: 81_001,
      owner_login: "synthetic-owner",
      repository_name: "synthetic-repository",
      repository_full_name: "synthetic-owner/synthetic-repository",
      visibility: "private",
      is_private: true,
      is_fork: false,
      is_archived: false,
      is_disabled: false,
      default_branch: "main",
      repository_updated_at: "2026-08-05T00:00:00.000Z",
      installation_id: 91_001,
      installation_status: "active",
    }));

    expect(adapter.firstSyncPersistenceContract).toBe("first-sync-persistence.v1");
    await expect(store(fetcher).getByProjectId(projectId)).resolves.toMatchObject({
      projectId,
      repository: {
        githubObjectId: "81001",
        fullName: "synthetic-owner/synthetic-repository",
      },
      installation: { installationId: 91_001, status: "active" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://synthetic.supabase.invalid/rest/v1/rpc/read_first_sync_context",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_project_id: projectId }),
      }),
    );
  });

  it("returns null context and never exposes the service role key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(null));
    await expect(store(fetcher).getByProjectId(projectId)).resolves.toBeNull();
    const request = fetcher.mock.calls[0]![1]!;
    expect(String(request.body)).not.toContain(serviceRoleKey);
  });

  it("gets one explicit project/run and maps the existing SyncRun shape", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(runRow));
    await expect(store(fetcher).getById(projectId, runId)).resolves.toMatchObject({
      id: runId,
      projectId,
      status: "running",
      version: 3,
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({
      p_project_id: projectId,
      p_run_id: runId,
    });
  });

  it("checkpoints only with expected project/status/version and a bounded cursor", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(runRow));
    const input: FirstSyncCheckpointInput = {
      projectId,
      runId,
      expectedStatus: "running",
      expectedVersion: 2,
      checkpointedAt: "2026-08-06T02:02:00.000Z",
      progressCursor: cursor,
    };
    await expect(store(fetcher).checkpoint(input)).resolves.toMatchObject({ version: 3 });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]!.body))).toEqual({
      p_project_id: projectId,
      p_run_id: runId,
      p_expected_status: "running",
      p_expected_version: 2,
      p_checkpointed_at: "2026-08-06T02:02:00.000Z",
      p_progress_cursor: cursor,
    });
  });

  it("upserts only an exact typed group and keeps projectId out of item payloads", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      group_name: "commit",
      attempted: 1,
      accepted: 1,
      rejected: 0,
    }));
    await expect(store(fetcher).upsertGroup({
      projectId,
      groupName: "commit",
      items: [{
        repositoryFullName: "synthetic-owner/synthetic-repository",
        githubObjectId: "a".repeat(40),
        objectType: "commit",
        sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
        sourceVersion: "a".repeat(40),
        message: "Synthetic commit",
        authoredAt: null,
        committedAt: "2026-06-01T00:00:00.000Z",
        authorLogin: null,
      }],
    })).resolves.toEqual({ groupName: "commit", attempted: 1, accepted: 1, rejected: 0 });

    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
    expect(body.p_project_id).toBe(projectId);
    expect(body.p_group_name).toBe("commit");
    expect(body.p_items[0]).not.toHaveProperty("projectId");
    expect(body.p_items[0]).not.toHaveProperty("objectType");
    expect(body.p_items[0]).toEqual({
      githubObjectId: "a".repeat(40),
      sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
      sourceVersion: "a".repeat(40),
      message: "Synthetic commit",
      authoredAt: null,
      committedAt: "2026-06-01T00:00:00.000Z",
      authorLogin: null,
    });
  });

  it("rejects unknown fields, unknown enums and Check before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const writer = store(fetcher);
    await expect(writer.upsertGroup({
      projectId,
      groupName: "issue",
      items: [{
        repositoryFullName: "synthetic-owner/synthetic-repository",
        githubObjectId: "91001",
        objectType: "issue",
        sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
        sourceVersion: "2026-06-01T00:00:00.000Z",
        number: 1,
        title: "Synthetic issue",
        state: "unknown",
        authorLogin: null,
        closedAt: null,
      }],
    })).rejects.toThrow("github_activity_snapshot_write_invalid");
    await expect(writer.upsertGroup({
      projectId,
      groupName: "check",
      items: [],
    } as never)).rejects.toThrow("github_activity_snapshot_write_invalid");
    await expect(writer.upsertGroup({
      projectId,
      groupName: "commit",
      items: [{ githubObjectId: "a".repeat(40), token: "synthetic-forbidden" }],
    } as never)).rejects.toThrow("github_activity_snapshot_write_invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes RPC failures without leaking provider body or credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      message: `provider body ${serviceRoleKey}`,
    }, 500));
    const error = await store(fetcher).getByProjectId(projectId).catch((caught) => caught);
    expect(error).toEqual(new Error("first_sync_storage_failed"));
    expect(error.message).not.toContain(serviceRoleKey);
  });

  it("preserves the frozen safe concurrency and not-found errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ message: "sync_run_concurrency_conflict" }, 400),
    );
    await expect(store(fetcher).checkpoint({
      projectId,
      runId,
      expectedStatus: "running",
      expectedVersion: 2,
      checkpointedAt: "2026-08-06T02:02:00.000Z",
      progressCursor: cursor,
    })).rejects.toThrow("sync_run_concurrency_conflict");
  });
});
