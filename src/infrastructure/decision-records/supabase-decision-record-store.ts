import "server-only";
import { z } from "zod";
import { decisionReferenceSchema, type ManualDecisionCommand, type PersistedDecisionRecord } from "@/application/decision-records/decision-record-input";
import type { DecisionArchiveReadPort, DecisionArchiveReadResult } from "@/features/decision-archive/decision-archive-read-port";
import type { ConnectedPanelSessionClient } from "@/infrastructure/connected-panels/supabase-connected-panel-reader";

export type DecisionRecordSessionClient = ConnectedPanelSessionClient & {
  rpc(name: string, args: Readonly<Record<string, unknown>>): PromiseLike<{ readonly data: unknown; readonly error: unknown }>;
};

const rowSchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(), project_id: z.string().uuid(),
  idempotency_key: z.string().uuid(), version: z.number().int().positive(),
  decision: z.string().min(1), confirmation_reason: z.string().min(1),
  alternatives: z.array(z.string()), references: z.array(decisionReferenceSchema),
  status: z.enum(["active", "revisit_due", "superseded"]),
  revisit_condition: z.string().nullable(), created_via: z.enum(["manual", "candidate_confirmation"]),
  confirmed_by: z.string().uuid(), confirmed_at: z.iso.datetime({ offset: true }),
  source_candidate_id: z.string().nullable(),
}).strict();

const columns = "id,user_id,project_id,idempotency_key,version,decision,confirmation_reason,alternatives,references,status,revisit_condition,created_via,confirmed_by,confirmed_at,source_candidate_id";

function errorDetails(error: unknown): { code?: string; message?: string } {
  return error !== null && typeof error === "object" ? error as { code?: string; message?: string } : {};
}

function record(value: unknown, owner: { userId: string; projectId: string }): PersistedDecisionRecord {
  const row = rowSchema.parse(value);
  if (row.user_id !== owner.userId || row.project_id !== owner.projectId || row.confirmed_by !== row.user_id) {
    throw new Error("decision_record_unavailable");
  }
  return {
    id: row.id, userId: row.user_id, projectId: row.project_id, idempotencyKey: row.idempotency_key,
    version: row.version, decision: row.decision, confirmationReason: row.confirmation_reason,
    alternatives: row.alternatives, references: row.references, status: row.status,
    revisitCondition: row.revisit_condition, createdVia: row.created_via,
    confirmedBy: row.confirmed_by, confirmedAt: row.confirmed_at, sourceCandidateId: row.source_candidate_id,
  };
}

export class SupabaseDecisionRecordStore implements DecisionArchiveReadPort {
  constructor(private readonly client: DecisionRecordSessionClient) {}

  async read(input: { userId: string; projectId: string }): Promise<DecisionArchiveReadResult> {
    const result = await this.client.from("decision_records").select(columns)
      .eq("user_id", input.userId).eq("project_id", input.projectId)
      .order("confirmed_at", { ascending: false }).limit(100);
    if (result.error) {
      if (["42P01", "PGRST205"].includes(errorDetails(result.error).code ?? "")) return { kind: "not_enabled", ...input };
      throw new Error("decision_record_unavailable");
    }
    if (!Array.isArray(result.data)) throw new Error("decision_record_unavailable");
    return { kind: "ready", ...input, records: result.data.map(value => ({ ...input, record: record(value, input) })) };
  }

  async create(input: { userId: string; projectId: string; command: ManualDecisionCommand }): Promise<PersistedDecisionRecord> {
    const result = await this.client.rpc("create_manual_decision_record", {
      p_actor_user_id: input.userId,
      p_project_id: input.projectId, p_idempotency_key: input.command.idempotencyKey,
      p_decision: input.command.decision, p_confirmation_reason: input.command.confirmationReason,
      p_alternatives: input.command.alternatives, p_references: input.command.references,
      p_revisit_condition: input.command.revisitCondition,
    });
    if (result.error) {
      const details = errorDetails(result.error);
      if (details.message === "decision_record_conflict") throw new Error("decision_record_conflict");
      if (["42501", "P0002"].includes(details.code ?? "")) throw new Error("decision_record_forbidden");
      throw new Error("decision_record_unavailable");
    }
    // This RPC returns one composite record; PostgREST returns that record as an object.
    const saved = record(result.data, input);
    if (saved.idempotencyKey !== input.command.idempotencyKey) throw new Error("decision_record_unavailable");
    return saved;
  }
}
