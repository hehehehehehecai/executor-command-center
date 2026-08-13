import { describe, expect, it, vi } from "vitest";

import { SupabaseProjectFreshnessReader } from "./supabase-project-freshness-reader";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const otherProjectId = "33333333-3333-4333-8333-333333333333";

type Result = { readonly data: unknown; readonly error: unknown };

class Query implements PromiseLike<Result> {
  readonly calls: Array<readonly unknown[]> = [];
  constructor(private readonly result: Result) {}
  from() { return this; }
  select(value: string) { this.calls.push(["select", value]); return this; }
  eq(column: string, value: unknown) { this.calls.push(["eq", column, value]); return this; }
  neq(column: string, value: unknown) { this.calls.push(["neq", column, value]); return this; }
  in(column: string, value: readonly unknown[]) { this.calls.push(["in", column, value]); return this; }
  order(column: string, options: unknown) { this.calls.push(["order", column, options]); return this; }
  limit(value: number) { this.calls.push(["limit", value]); return this; }
  maybeSingle() { this.calls.push(["maybeSingle"]); return Promise.resolve(this.result); }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) { return Promise.resolve(this.result).then(onfulfilled, onrejected); }
}

function setup(results: readonly Result[]) {
  const queries: Query[] = [];
  const from = vi.fn(() => {
    const query = new Query(results[queries.length] ?? { data: null, error: null });
    queries.push(query);
    return query;
  });
  return { reader: new SupabaseProjectFreshnessReader({ from }), from, queries };
}

const completedRun = {
  id: "44444444-4444-4444-8444-444444444444",
  status: "completed",
  finished_at: "2026-08-12T12:00:00.000Z",
  error_code: null,
};

describe("SupabaseProjectFreshnessReader", () => {
  it("selects the most recently updated active project owned by the verified user", async () => {
    const f = setup([
      { data: [{ id: projectId, updated_at: "2026-08-12T12:00:00.000Z" }], error: null },
      { data: [completedRun], error: null },
      { data: [completedRun], error: null },
    ]);

    await expect(f.reader.read({ userId, projectId: null, now: "2026-08-12T13:00:00.000Z" }))
      .resolves.toMatchObject({ projectId, input: { provenance: "real" } });
    expect(f.queries[0]?.calls).toEqual(expect.arrayContaining([
      ["eq", "user_id", userId],
      ["neq", "status", "archived"],
      ["order", "updated_at", { ascending: false }],
      ["limit", 1],
    ]));
  });

  it("applies project id and user id together for an explicit project", async () => {
    const f = setup([{ data: [{ id: projectId, updated_at: "2026-08-12T12:00:00.000Z" }], error: null }, { data: [], error: null }, { data: [], error: null }]);
    await f.reader.read({ userId, projectId, now: "2026-08-12T13:00:00.000Z" });
    expect(f.queries[0]?.calls).toEqual(expect.arrayContaining([
      ["eq", "user_id", userId], ["eq", "id", projectId],
    ]));
  });

  it("returns null when RLS/ownership yields no visible project", async () => {
    const f = setup([{ data: [], error: null }]);
    await expect(f.reader.read({ userId, projectId: otherProjectId, now: "2026-08-12T13:00:00.000Z" }))
      .resolves.toBeNull();
    expect(f.from).toHaveBeenCalledTimes(1);
  });

  it("maps the latest run and latest successful completion to real presentation input", async () => {
    const running = { id: "55555555-5555-4555-8555-555555555555", status: "running", finished_at: null, error_code: null };
    const f = setup([{ data: [{ id: projectId, updated_at: "2026-08-12T12:00:00.000Z" }], error: null }, { data: [running], error: null }, { data: [completedRun], error: null }]);
    await expect(f.reader.read({ userId, projectId, now: "2026-08-12T13:00:00.000Z" })).resolves.toEqual({
      projectId,
      input: {
        provenance: "real",
        authorizationRevoked: false,
        latestRun: { id: running.id, status: "running", finishedAt: null, errorCode: null },
        lastSuccessfulAt: completedRun.finished_at,
        coverageComplete: true,
        now: "2026-08-12T13:00:00.000Z",
      },
    });
  });

  it("maps a partial latest successful run to incomplete coverage", async () => {
    const partial = { ...completedRun, status: "partial" };
    const f = setup([{ data: [{ id: projectId, updated_at: "2026-08-12T12:00:00.000Z" }], error: null }, { data: [partial], error: null }, { data: [partial], error: null }]);
    await expect(f.reader.read({ userId, projectId, now: "2026-08-12T13:00:00.000Z" }))
      .resolves.toMatchObject({ input: { coverageComplete: false } });
  });

  it("maps the authorization revoked safe code without reading error_summary", async () => {
    const revoked = { ...completedRun, status: "failed", error_code: "github_activity_authorization_revoked" };
    const f = setup([{ data: [{ id: projectId, updated_at: "2026-08-12T12:00:00.000Z" }], error: null }, { data: [revoked], error: null }, { data: [], error: null }]);
    await expect(f.reader.read({ userId, projectId, now: "2026-08-12T13:00:00.000Z" }))
      .resolves.toMatchObject({ input: { authorizationRevoked: true, lastSuccessfulAt: null } });
    expect(f.queries[1]?.calls[0]).toEqual(["select", "id,status,finished_at,error_code"]);
  });

  it("rejects invalid identities before querying", async () => {
    const f = setup([]);
    await expect(f.reader.read({ userId: "bad", projectId: null, now: "2026-08-12T13:00:00.000Z" }))
      .rejects.toThrow("project_freshness_invalid_input");
    expect(f.from).not.toHaveBeenCalled();
  });

  it("fails closed on query errors or malformed rows", async () => {
    const failed = setup([{ data: null, error: { message: "private database detail" } }]);
    await expect(failed.reader.read({ userId, projectId, now: "2026-08-12T13:00:00.000Z" }))
      .rejects.toThrow("project_freshness_read_failed");
    const malformed = setup([{ data: [{ id: "not-a-uuid", updated_at: "bad" }], error: null }]);
    await expect(malformed.reader.read({ userId, projectId: null, now: "2026-08-12T13:00:00.000Z" }))
      .rejects.toThrow("project_freshness_read_failed");
  });
});
