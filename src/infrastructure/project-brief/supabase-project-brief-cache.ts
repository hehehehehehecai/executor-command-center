import "server-only";

import { createHash } from "node:crypto";
import type {
  ProjectBriefCache,
  ProjectBriefCacheKey,
  ProjectBriefCacheRecord,
} from "@/application/project-brief/project-brief-generation-ports";
import { projectBriefStatuses } from "@/domain/project-brief/project-brief";
import { canonicalizeEvidenceValue } from "@/domain/project-brief-evidence/canonicalization";
import { z } from "zod";

import {
  canonicalizeNullableProjectBriefDatabaseDatetime,
  canonicalizeProjectBriefDatabaseDatetime,
} from "./project-brief-database-datetime";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type CacheQuery = {
  match(values: Readonly<Record<string, unknown>>): CacheQuery;
  gt(column: "expires_at", value: string): CacheQuery;
  order(column: "expires_at", options: { readonly ascending: false }): CacheQuery;
  limit(count: 1): CacheQuery;
  maybeSingle(): PromiseLike<QueryResult>;
};
type AuthenticatedProjectBriefCacheClient = {
  from(table: "project_briefs"): {
    select(columns: string): CacheQuery;
  };
};

const rowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  project_id: z.string().uuid(),
  range_start: z.iso.datetime({ offset: true }),
  range_end: z.iso.datetime({ offset: true }),
  prompt_version: z.string().min(1).nullable(),
  schema_version: z.string().min(1).nullable(),
  evidence_fingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  cache_equivalence_fingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  payload_fingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  status: z.enum(projectBriefStatuses),
  payload: z.record(z.string(), z.unknown()).nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();

function storageFailure(cause?: unknown): Error {
  return new Error("project_brief_cache_storage_failed", { cause });
}

function record(row: z.infer<typeof rowSchema>): ProjectBriefCacheRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    rangeStart: canonicalizeProjectBriefDatabaseDatetime(row.range_start),
    rangeEnd: canonicalizeProjectBriefDatabaseDatetime(row.range_end),
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    evidenceFingerprint: row.evidence_fingerprint,
    cacheEquivalenceFingerprint: row.cache_equivalence_fingerprint,
    payloadFingerprint: row.payload_fingerprint,
    status: row.status,
    payload: row.payload,
    expiresAt: canonicalizeNullableProjectBriefDatabaseDatetime(row.expires_at),
  };
}

export class SupabaseProjectBriefCache implements ProjectBriefCache {
  constructor(private readonly client: AuthenticatedProjectBriefCacheClient) {}

  async find(key: ProjectBriefCacheKey): Promise<ProjectBriefCacheRecord | null> {
    let result: QueryResult;
    try {
      result = await this.client.from("project_briefs").select(
        "id,user_id,project_id,range_start,range_end,prompt_version,schema_version,evidence_fingerprint,cache_equivalence_fingerprint,payload_fingerprint,status,payload,expires_at",
      ).match({
        user_id: key.userId,
        project_id: key.projectId,
        range_start: key.rangeStart,
        range_end: key.rangeEnd,
        prompt_version: key.promptVersion,
        schema_version: key.schemaVersion,
        cache_equivalence_fingerprint: key.cacheEquivalenceFingerprint,
        status: "completed",
      }).gt("expires_at", key.now)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    } catch (error) {
      throw storageFailure(error);
    }
    if (result.error) throw storageFailure(result.error);
    if (result.data === null) return null;
    const parsed = rowSchema.safeParse(result.data);
    if (!parsed.success) throw storageFailure(parsed.error);
    if (
      parsed.data.payload === null
      || parsed.data.payload_fingerprint === null
      || createHash("sha256")
        .update(canonicalizeEvidenceValue(parsed.data.payload))
        .digest("hex") !== parsed.data.payload_fingerprint
    ) return null;
    return record(parsed.data);
  }
}
