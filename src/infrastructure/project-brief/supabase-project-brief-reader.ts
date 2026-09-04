import type { ProjectBriefReader } from "@/application/project-brief/project-brief-persistence";
import {
  projectBriefStatuses,
  type ProjectBriefRecord,
} from "@/domain/project-brief/project-brief";
import { z } from "zod";

import {
  canonicalizeNullableProjectBriefDatabaseDatetime,
  canonicalizeProjectBriefDatabaseDatetime,
} from "./project-brief-database-datetime";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type ProjectBriefQuery = {
  eq(column: "project_id", value: string): PromiseLike<QueryResult>;
};
type AuthenticatedProjectBriefClient = {
  from(table: "project_briefs"): {
    select(columns: string): ProjectBriefQuery;
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
  status: z.enum(projectBriefStatuses),
  payload: z.record(z.string(), z.unknown()).nullable(),
  failure_stage: z.string().min(1).nullable(),
  error_code: z.string().min(1).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();

const rowsSchema = z.array(rowSchema);

function storageFailure(cause?: unknown): Error {
  return new Error("project_brief_storage_failed", { cause });
}

function record(row: z.infer<typeof rowSchema>): ProjectBriefRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    rangeStart: canonicalizeProjectBriefDatabaseDatetime(row.range_start),
    rangeEnd: canonicalizeProjectBriefDatabaseDatetime(row.range_end),
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    evidenceFingerprint: row.evidence_fingerprint,
    status: row.status,
    payload: row.payload,
    failureStage: row.failure_stage,
    errorCode: row.error_code,
    createdAt: canonicalizeProjectBriefDatabaseDatetime(row.created_at),
    completedAt: canonicalizeNullableProjectBriefDatabaseDatetime(row.completed_at),
    expiresAt: canonicalizeNullableProjectBriefDatabaseDatetime(row.expires_at),
  };
}

export class SupabaseProjectBriefReader implements ProjectBriefReader {
  constructor(private readonly client: AuthenticatedProjectBriefClient) {}

  async listForProject(projectId: string): Promise<readonly ProjectBriefRecord[]> {
    let result: QueryResult;
    try {
      result = await this.client.from("project_briefs").select(
        "id,user_id,project_id,range_start,range_end,prompt_version,schema_version,evidence_fingerprint,status,payload,failure_stage,error_code,created_at,completed_at,expires_at",
      ).eq("project_id", projectId);
    } catch (error) {
      throw storageFailure(error);
    }
    if (result.error) throw storageFailure(result.error);
    const parsed = rowsSchema.safeParse(result.data);
    if (!parsed.success) throw storageFailure(parsed.error);
    return parsed.data.map(record);
  }
}
