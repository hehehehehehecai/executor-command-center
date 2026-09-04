import "server-only";

import type {
  ProjectBriefFreshnessReceiptReader,
  ProjectBriefGenerationReceipt,
  ProjectBriefGenerationReceiptReader,
} from "@/application/project-brief-evidence/validate-stored-project-brief-evidence";
import { z } from "zod";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;
type ReceiptTable = "ai_invocations" | "projects" | "sync_runs";
export type ProjectBriefHistoricalReceiptClient = {
  from(table: ReceiptTable): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const invocationRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  project_id: uuid,
  brief_id: uuid,
  status: z.enum(["completed", "failed"]),
  cache_status: z.enum(["hit", "miss", "bypass"]).nullable(),
  input_fingerprint: fingerprint.nullable(),
  prompt_version: z.string().trim().min(1).nullable(),
  schema_version: z.string().trim().min(1).nullable(),
  reservation_id: uuid.nullable(),
  source_invocation_id: uuid.nullable(),
}).strict()).max(4);
const projectRows = z.array(z.object({ id: uuid, user_id: uuid }).strict()).max(1);
const freshnessRows = z.array(z.object({
  id: uuid,
  project_id: uuid,
  status: z.string().trim().min(1),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
}).strict()).max(1);

function failure(): Error {
  return new Error("project_brief_historical_receipt_read_failed");
}

async function execute(query: unknown): Promise<unknown> {
  let result: QueryResult;
  try {
    result = await (query as PromiseLike<QueryResult>);
  } catch {
    throw failure();
  }
  if (result.error) throw failure();
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw failure();
  return parsed.data;
}

export class SupabaseProjectBriefHistoricalReceiptReader
implements ProjectBriefGenerationReceiptReader, ProjectBriefFreshnessReceiptReader {
  constructor(private readonly client: ProjectBriefHistoricalReceiptClient) {}

  async listForBrief(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly briefId: string;
  }): Promise<readonly ProjectBriefGenerationReceipt[]> {
    if (![input.userId, input.projectId, input.briefId].every((value) => uuid.safeParse(value).success)) {
      throw new Error("project_brief_historical_receipt_invalid_input");
    }
    const rows = parse(invocationRows, await execute(
      this.client.from("ai_invocations")
        .select("id,user_id,project_id,brief_id,status,cache_status,input_fingerprint,prompt_version,schema_version,reservation_id,source_invocation_id")
        .eq("user_id", input.userId)
        .eq("project_id", input.projectId)
        .eq("brief_id", input.briefId)
        .limit(4),
    ));
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      briefId: row.brief_id,
      status: row.status,
      cacheStatus: row.cache_status,
      inputFingerprint: row.input_fingerprint,
      promptVersion: row.prompt_version,
      schemaVersion: row.schema_version,
      reservationId: row.reservation_id,
      sourceInvocationId: row.source_invocation_id,
    }));
  }

  async read(input: {
    readonly userId: string;
    readonly projectId: string;
    readonly sourceId: string;
  }) {
    if (![input.userId, input.projectId, input.sourceId].every((value) => uuid.safeParse(value).success)) {
      throw new Error("project_brief_historical_receipt_invalid_input");
    }
    const projects = parse(projectRows, await execute(
      this.client.from("projects")
        .select("id,user_id")
        .eq("id", input.projectId)
        .eq("user_id", input.userId)
        .limit(1),
    ));
    if (!projects[0]) return null;
    const rows = parse(freshnessRows, await execute(
      this.client.from("sync_runs")
        .select("id,project_id,status,finished_at")
        .eq("id", input.sourceId)
        .eq("project_id", input.projectId)
        .limit(1),
    ));
    const row = rows[0];
    return row
      ? {
          sourceId: row.id,
          projectId: row.project_id,
          status: row.status,
          finishedAt: row.finished_at === null
            ? null
            : new Date(row.finished_at).toISOString(),
        }
      : null;
  }
}
