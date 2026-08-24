import {
  projectBriefPromptVersion,
  projectBriefSchemaVersion,
} from "@/domain/project-brief/project-brief-contract";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { SupabaseProjectBriefCache } from "./supabase-project-brief-cache";

const key = {
  userId: "10000000-0000-4000-8000-000000000001",
  projectId: "20000000-0000-4000-8000-000000000002",
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-18T00:00:00.000Z",
  promptVersion: projectBriefPromptVersion,
  schemaVersion: projectBriefSchemaVersion,
  evidenceFingerprint: "a".repeat(64),
  cacheEquivalenceFingerprint: "b".repeat(64),
  now: "2026-08-18T06:00:00.000Z",
} as const;
const payload = { synthetic: true };
const payloadFingerprint = createHash("sha256")
  .update(JSON.stringify(payload)).digest("hex");

type QueryResult = { readonly data: unknown; readonly error: unknown };

function query(result: QueryResult) {
  const chain = {
    match: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(async (): Promise<QueryResult> => result),
  };
  chain.match.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe("SupabaseProjectBriefCache", () => {
  it("queries the exact owner/range/version/fingerprint completed cache key", async () => {
    const q = query({
      data: {
        id: "40000000-0000-4000-8000-000000000004",
        user_id: key.userId,
        project_id: key.projectId,
        range_start: key.rangeStart,
        range_end: key.rangeEnd,
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        evidence_fingerprint: key.evidenceFingerprint,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        payload_fingerprint: payloadFingerprint,
        status: "completed",
        payload,
        expires_at: "2026-08-19T06:00:00.000Z",
      },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({ select: vi.fn(() => q) })),
    };
    const cache = new SupabaseProjectBriefCache(client);
    await expect(cache.find(key)).resolves.toMatchObject({
      id: "40000000-0000-4000-8000-000000000004",
      userId: key.userId,
      status: "completed",
    });
    expect(q.match).toHaveBeenCalledWith({
      user_id: key.userId,
      project_id: key.projectId,
      range_start: key.rangeStart,
      range_end: key.rangeEnd,
      prompt_version: key.promptVersion,
      schema_version: key.schemaVersion,
      cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
      status: "completed",
    });
    expect(q.gt).toHaveBeenCalledWith("expires_at", key.now);
    expect(q.order).toHaveBeenCalledWith("expires_at", { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(1);
  });

  it("rejects a cache payload whose persisted integrity fingerprint was tampered", async () => {
    const q = query({
      data: {
        id: "40000000-0000-4000-8000-000000000004",
        user_id: key.userId,
        project_id: key.projectId,
        range_start: key.rangeStart,
        range_end: key.rangeEnd,
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        evidence_fingerprint: key.evidenceFingerprint,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        payload_fingerprint: payloadFingerprint,
        status: "completed",
        payload: { synthetic: false },
        expires_at: "2026-08-19T06:00:00.000Z",
      },
      error: null,
    });
    const cache = new SupabaseProjectBriefCache({
      from: () => ({ select: () => q }),
    });
    await expect(cache.find(key)).resolves.toBeNull();
  });

  it("normalizes database datetime offsets before returning the cache record", async () => {
    const q = query({
      data: {
        id: "40000000-0000-4000-8000-000000000004",
        user_id: key.userId,
        project_id: key.projectId,
        range_start: "2026-08-01T08:00:00+08:00",
        range_end: "2026-08-18T00:00:00+00:00",
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        evidence_fingerprint: key.evidenceFingerprint,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        payload_fingerprint: payloadFingerprint,
        status: "completed",
        payload,
        expires_at: "2026-08-19T06:00:00+00:00",
      },
      error: null,
    });
    const cache = new SupabaseProjectBriefCache({
      from: () => ({ select: () => q }),
    });

    await expect(cache.find(key)).resolves.toMatchObject({
      rangeStart: "2026-08-01T00:00:00.000Z",
      rangeEnd: "2026-08-18T00:00:00.000Z",
      expiresAt: "2026-08-19T06:00:00.000Z",
    });
  });

  it("preserves distinct instants and rejects invalid database datetimes", async () => {
    const distinct = query({
      data: {
        id: "40000000-0000-4000-8000-000000000004",
        user_id: key.userId,
        project_id: key.projectId,
        range_start: "2026-08-01T08:00:01+08:00",
        range_end: "2026-08-18T00:00:00+00:00",
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        evidence_fingerprint: key.evidenceFingerprint,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        payload_fingerprint: payloadFingerprint,
        status: "completed",
        payload,
        expires_at: "2026-08-19T06:00:00+00:00",
      },
      error: null,
    });
    await expect(new SupabaseProjectBriefCache({
      from: () => ({ select: () => distinct }),
    }).find(key)).resolves.toMatchObject({
      rangeStart: "2026-08-01T00:00:01.000Z",
    });

    const invalid = query({
      data: {
        id: "40000000-0000-4000-8000-000000000004",
        user_id: key.userId,
        project_id: key.projectId,
        range_start: "not-a-datetime",
        range_end: key.rangeEnd,
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        evidence_fingerprint: key.evidenceFingerprint,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        payload_fingerprint: payloadFingerprint,
        status: "completed",
        payload,
        expires_at: "2026-08-19T06:00:00.000Z",
      },
      error: null,
    });
    await expect(new SupabaseProjectBriefCache({
      from: () => ({ select: () => invalid }),
    }).find(key)).rejects.toThrow("project_brief_cache_storage_failed");
  });

  it("returns null for no row and fails closed on storage or malformed rows", async () => {
    const empty = query({ data: null, error: null });
    const cache = new SupabaseProjectBriefCache({
      from: () => ({ select: () => empty }),
    });
    await expect(cache.find(key)).resolves.toBeNull();

    const failed = query({ data: null, error: { message: "private detail" } });
    await expect(new SupabaseProjectBriefCache({
      from: () => ({ select: () => failed }),
    }).find(key)).rejects.toThrow("project_brief_cache_storage_failed");

    const malformed = query({ data: { id: "not-a-uuid" }, error: null });
    await expect(new SupabaseProjectBriefCache({
      from: () => ({ select: () => malformed }),
    }).find(key)).rejects.toThrow("project_brief_cache_storage_failed");
  });
});
