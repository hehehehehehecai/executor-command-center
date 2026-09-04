import { describe, expect, it } from "vitest";

import { SupabaseProjectBriefObservationReader } from "./supabase-project-brief-observation-reader";

const userId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000002";
const reservationId = "30000000-0000-4000-8000-000000000003";
const briefId = "40000000-0000-4000-8000-000000000004";
const invocationId = "50000000-0000-4000-8000-000000000005";
const evidenceFingerprint = "a".repeat(64);

function client(rows: Record<string, unknown>) {
  const calls: Array<{ table: string; select: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select(select: string) {
          const call = { table, select, filters: [] as Array<[string, unknown]> };
          calls.push(call);
          const query = {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return query;
            },
            async maybeSingle() {
              const value = rows[table];
              if (value instanceof Error) return { data: null, error: value };
              return { data: value ?? null, error: null };
            },
          };
          return query;
        },
      };
    },
  };
}

const invocationRow = {
  id: invocationId,
  user_id: userId,
  project_id: projectId,
  feature: "project_brief",
  provider: "deepseek",
  model: "deepseek-chat",
  prompt_version: "project-brief-v1",
  schema_version: "project-brief-schema-v1",
  input_fingerprint: evidenceFingerprint,
  cache_equivalence_fingerprint: "c".repeat(64),
  status: "completed",
  input_tokens: 120,
  output_tokens: 80,
  latency_ms: 450,
  cost_microunits: null,
  cache_status: "miss",
  failure_stage: null,
  error_code: null,
  reservation_id: reservationId,
  source_invocation_id: null,
  brief_id: briefId,
  provider_request_id: "provider-request-safe",
  created_at: "2026-08-21T01:00:00+00:00",
  started_at: "2026-08-21T01:00:00+00:00",
  completed_at: "2026-08-21T01:00:00.450+00:00",
};

describe("SupabaseProjectBriefObservationReader", () => {
  it("reads only owner-scoped safe columns and returns a complete observation", async () => {
    const db = client({
      ai_invocations: invocationRow,
      energy_reservations: { amount: 3, status: "consumed" },
      project_briefs: {
        range_start: "2026-08-01T00:00:00.000Z",
        range_end: "2026-08-21T00:00:00.000Z",
        evidence_fingerprint: evidenceFingerprint,
        cache_equivalence_fingerprint: "c".repeat(64),
      },
    });
    const reader = new SupabaseProjectBriefObservationReader(db);
    const result = await reader.read({ invocationId, userId, projectId });
    expect(result).toMatchObject({
      observationId: invocationId,
      userId,
      projectId,
      evidenceFingerprint,
      quotaCharge: 3,
      cost: { amountMicrounits: null, basis: "unavailable" },
      terminalStatus: "completed",
      createdAt: "2026-08-21T01:00:00.000Z",
      finishedAt: "2026-08-21T01:00:00.450Z",
    });
    expect(result?.cacheKeyFingerprint).toBe("c".repeat(64));
    expect(db.calls.map(({ table }) => table)).toEqual([
      "ai_invocations", "energy_reservations", "project_briefs",
    ]);
    expect(db.calls[0]?.filters).toEqual([
      ["id", invocationId], ["user_id", userId], ["project_id", projectId],
    ]);
    expect(db.calls.every(({ select }) => !/prompt|payload|document|response|secret/i.test(
      select.replace(/prompt_version/g, "version"),
    ))).toBe(true);
  });

  it("reads a cache-hit observation without a reservation and preserves original Brief fingerprint", async () => {
    const sourceInvocationId = invocationId;
    const cacheInvocationId = "70000000-0000-4000-8000-000000000007";
    const db = client({
      ai_invocations: {
        ...invocationRow,
        id: cacheInvocationId,
        input_fingerprint: "d".repeat(64),
        cache_status: "hit",
        reservation_id: null,
        source_invocation_id: sourceInvocationId,
        input_tokens: null,
        output_tokens: null,
        latency_ms: null,
        provider_request_id: null,
      },
      project_briefs: {
        range_start: "2026-08-01T00:00:00.000Z",
        range_end: "2026-08-21T00:00:00.000Z",
        evidence_fingerprint: evidenceFingerprint,
        cache_equivalence_fingerprint: "c".repeat(64),
      },
    });
    const result = await new SupabaseProjectBriefObservationReader(db).read({
      invocationId: cacheInvocationId, userId, projectId,
    });
    expect(result).toMatchObject({
      correlationId: sourceInvocationId,
      evidenceFingerprint,
      cacheStatus: "hit",
      providerAttempted: false,
      quotaCharge: 0,
    });
    expect(db.calls.map(({ table }) => table)).toEqual(["ai_invocations", "project_briefs"]);
  });

  it("returns null for an invisible invocation and sanitizes storage errors", async () => {
    await expect(new SupabaseProjectBriefObservationReader(client({})).read({
      invocationId, userId, projectId,
    })).resolves.toBeNull();
    await expect(new SupabaseProjectBriefObservationReader(client({
      ai_invocations: new Error("PRIVATE_DATABASE_PAYLOAD"),
    })).read({ invocationId, userId, projectId })).rejects.toThrow(
      "project_brief_ai_observation_storage_failed",
    );
  });

  it("fails closed when a failed Provider invocation lacks its evidence fingerprint", async () => {
    const db = client({
      ai_invocations: {
        ...invocationRow,
        status: "failed",
        input_fingerprint: null,
        brief_id: null,
        failure_stage: "provider",
        error_code: "project_brief_parse_failure",
      },
      energy_reservations: { amount: 3, status: "released" },
    });
    await expect(new SupabaseProjectBriefObservationReader(db).read({
      invocationId, userId, projectId,
    })).rejects.toThrow("project_brief_ai_observation_invalid");
  });
});
