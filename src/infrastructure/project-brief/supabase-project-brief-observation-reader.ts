import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  createProjectBriefAiObservation,
  type ProjectBriefAiObservation,
} from "@/domain/ai-usage/project-brief-ai-observation";

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  maybeSingle(): PromiseLike<QueryResult>;
};
type ObservationClient = {
  from(table: string): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const invocationSchema = z.object({
  id: uuid,
  user_id: uuid,
  project_id: uuid,
  feature: z.literal("project_brief"),
  provider: z.string().trim().min(1).max(128).nullable(),
  model: z.string().trim().min(1).max(255).nullable(),
  prompt_version: z.string().trim().min(1).max(128).nullable(),
  schema_version: z.string().trim().min(1).max(128).nullable(),
  input_fingerprint: sha256.nullable(),
  status: z.enum(["completed", "failed"]),
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  latency_ms: z.number().nonnegative().finite().nullable(),
  cost_microunits: z.number().int().nonnegative().nullable(),
  cache_status: z.enum(["hit", "miss", "bypass"]).nullable(),
  failure_stage: z.string().trim().min(1).max(128).nullable(),
  error_code: z.string().trim().min(1).max(128).nullable(),
  reservation_id: uuid.nullable(),
  brief_id: uuid.nullable(),
  provider_request_id: z.string().trim().min(1).max(255).nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
}).strict();
const reservationSchema = z.object({
  amount: z.number().int().positive(),
  status: z.enum(["consumed", "released"]),
}).strict();
const briefSchema = z.object({
  range_start: z.string(),
  range_end: z.string(),
}).strict();

const invocationColumns = [
  "id", "user_id", "project_id", "feature", "provider", "model",
  "prompt_version", "schema_version", "input_fingerprint", "status",
  "input_tokens", "output_tokens", "latency_ms", "cost_microunits",
  "cache_status", "failure_stage", "error_code", "reservation_id", "brief_id",
  "provider_request_id", "created_at", "started_at", "completed_at",
].join(",");

function storageFailure(cause?: unknown): Error {
  return new Error("project_brief_ai_observation_storage_failed", { cause });
}

async function execute(query: FilterQuery): Promise<unknown> {
  let result: QueryResult;
  try {
    result = await query.maybeSingle();
  } catch (error) {
    throw storageFailure(error);
  }
  if (result.error) throw storageFailure(result.error);
  return result.data;
}

function cacheKeyFingerprint(input: {
  readonly userId: string;
  readonly projectId: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly evidenceFingerprint: string;
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.userId, input.projectId, input.rangeStart, input.rangeEnd,
    input.promptVersion, input.schemaVersion, input.evidenceFingerprint,
  ])).digest("hex");
}

export class SupabaseProjectBriefObservationReader {
  constructor(private readonly client: ObservationClient) {}

  async read(input: {
    readonly invocationId: string;
    readonly userId: string;
    readonly projectId: string;
  }): Promise<ProjectBriefAiObservation | null> {
    const invocationData = await execute(this.client.from("ai_invocations")
      .select(invocationColumns)
      .eq("id", input.invocationId)
      .eq("user_id", input.userId)
      .eq("project_id", input.projectId));
    if (invocationData === null) return null;
    const parsedInvocation = invocationSchema.safeParse(invocationData);
    if (!parsedInvocation.success) throw new Error("project_brief_ai_observation_invalid");
    const row = parsedInvocation.data;
    if (row.reservation_id === null) throw new Error("project_brief_ai_observation_invalid");

    const reservationData = await execute(this.client.from("energy_reservations")
      .select("amount,status")
      .eq("id", row.reservation_id)
      .eq("user_id", input.userId)
      .eq("project_id", input.projectId));
    const reservation = reservationSchema.safeParse(reservationData);
    if (!reservation.success) throw new Error("project_brief_ai_observation_invalid");

    let brief: z.infer<typeof briefSchema> | null = null;
    if (row.brief_id !== null) {
      const briefData = await execute(this.client.from("project_briefs")
        .select("range_start,range_end")
        .eq("id", row.brief_id)
        .eq("user_id", input.userId)
        .eq("project_id", input.projectId));
      const parsedBrief = briefSchema.safeParse(briefData);
      if (!parsedBrief.success) throw new Error("project_brief_ai_observation_invalid");
      brief = parsedBrief.data;
    }

    const fingerprint = brief !== null
      && row.prompt_version !== null
      && row.schema_version !== null
      && row.input_fingerprint !== null
      ? cacheKeyFingerprint({
          userId: row.user_id,
          projectId: row.project_id,
          rangeStart: brief.range_start,
          rangeEnd: brief.range_end,
          promptVersion: row.prompt_version,
          schemaVersion: row.schema_version,
          evidenceFingerprint: row.input_fingerprint,
        })
      : null;

    return createProjectBriefAiObservation({
      invocation: {
        id: row.id,
        userId: row.user_id,
        projectId: row.project_id,
        feature: row.feature,
        provider: row.provider,
        model: row.model,
        promptVersion: row.prompt_version,
        schemaVersion: row.schema_version,
        inputFingerprint: row.input_fingerprint,
        status: row.status,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        latencyMs: row.latency_ms,
        costMicrounits: row.cost_microunits,
        cacheStatus: row.cache_status,
        failureStage: row.failure_stage,
        errorCode: row.error_code,
        reservationId: row.reservation_id,
        briefId: row.brief_id,
        providerRequestId: row.provider_request_id,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      },
      reservation: reservation.data,
      brief: brief === null ? null : {
        rangeStart: brief.range_start,
        rangeEnd: brief.range_end,
      },
      cacheKeyFingerprint: fingerprint,
    });
  }
}
