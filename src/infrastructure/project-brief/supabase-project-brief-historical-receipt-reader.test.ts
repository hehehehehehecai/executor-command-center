import { describe, expect, it } from "vitest";

import {
  syntheticBriefFingerprint,
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefUserId,
} from "@/testing/project-brief/project-brief-fixture";

import { SupabaseProjectBriefHistoricalReceiptReader } from "./supabase-project-brief-historical-receipt-reader";

function client(rows: Record<string, unknown>) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]>; limit: number }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select() {
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return query;
            },
            limit(limit: number) {
              calls.push({ table, filters, limit });
              return Promise.resolve({ data: rows[table] ?? [], error: null });
            },
            then(resolve: (value: unknown) => unknown) {
              return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

describe("SupabaseProjectBriefHistoricalReceiptReader", () => {
  it("reads only the owned generation receipt for the exact brief", async () => {
    const invocation = {
      id: "40000000-0000-4000-8000-000000000004",
      user_id: syntheticBriefUserId,
      project_id: syntheticBriefProjectId,
      brief_id: syntheticBriefId,
      status: "completed",
      cache_status: "miss",
      input_fingerprint: syntheticBriefFingerprint,
      prompt_version: "project-brief-v2",
      schema_version: "project-brief-schema-v1",
      reservation_id: "50000000-0000-4000-8000-000000000005",
      source_invocation_id: null,
    };
    const db = client({ ai_invocations: [invocation] });
    const reader = new SupabaseProjectBriefHistoricalReceiptReader(
      db as unknown as ConstructorParameters<typeof SupabaseProjectBriefHistoricalReceiptReader>[0],
    );

    await expect(reader.listForBrief({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      briefId: syntheticBriefId,
    })).resolves.toEqual([expect.objectContaining({
      id: invocation.id,
      inputFingerprint: syntheticBriefFingerprint,
      reservationId: invocation.reservation_id,
      sourceInvocationId: null,
    })]);
    expect(db.calls).toEqual([{
      table: "ai_invocations",
      filters: [
        ["user_id", syntheticBriefUserId],
        ["project_id", syntheticBriefProjectId],
        ["brief_id", syntheticBriefId],
      ],
      limit: 4,
    }]);
  });

  it("requires an owned project before reading the exact freshness run", async () => {
    const sourceId = "60000000-0000-4000-8000-000000000006";
    const db = client({
      projects: [{ id: syntheticBriefProjectId, user_id: syntheticBriefUserId }],
      sync_runs: [{
        id: sourceId,
        project_id: syntheticBriefProjectId,
        status: "completed",
        finished_at: "2026-08-18T08:30:00+08:00",
      }],
    });
    const reader = new SupabaseProjectBriefHistoricalReceiptReader(
      db as unknown as ConstructorParameters<typeof SupabaseProjectBriefHistoricalReceiptReader>[0],
    );
    await expect(reader.read({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      sourceId,
    })).resolves.toEqual({
      sourceId,
      projectId: syntheticBriefProjectId,
      status: "completed",
      finishedAt: "2026-08-18T00:30:00.000Z",
    });
    expect(db.calls.map(({ table }) => table)).toEqual(["projects", "sync_runs"]);
  });

  it("does not reveal whether a freshness run exists for an unowned project", async () => {
    const db = client({ projects: [] });
    const reader = new SupabaseProjectBriefHistoricalReceiptReader(
      db as unknown as ConstructorParameters<typeof SupabaseProjectBriefHistoricalReceiptReader>[0],
    );
    await expect(reader.read({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      sourceId: "60000000-0000-4000-8000-000000000006",
    })).resolves.toBeNull();
    expect(db.calls.map(({ table }) => table)).toEqual(["projects"]);
  });
});
