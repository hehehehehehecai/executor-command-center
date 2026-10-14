import { z } from "zod";
import { normalizeManualDecisionInput, type ManualDecisionInput } from "@/features/decision-archive/decision-actions";
import { safeDecisionReferenceUrl, type DecisionRecord } from "@/features/decision-archive/decision-archive-view-model";

export interface ManualDecisionCommand extends ManualDecisionInput {
  readonly idempotencyKey: string;
}

export interface PersistedDecisionRecord extends DecisionRecord {
  readonly userId: string;
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly version: number;
}

export const decisionReferenceSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["commit", "pull_request", "issue", "document"]),
  label: z.string().trim().min(1),
  originalUrl: z.string().nullable().transform(safeDecisionReferenceUrl),
}).strict();

const commandSchema = z.object({
  idempotencyKey: z.string().uuid(),
  decision: z.string(),
  confirmationReason: z.string(),
  alternatives: z.array(z.string()),
  references: z.array(decisionReferenceSchema),
  revisitCondition: z.string().nullable(),
}).strict();

export function parseManualDecisionCommand(value: unknown): ManualDecisionCommand {
  try {
    const command = commandSchema.parse(value);
    return { ...normalizeManualDecisionInput(command), idempotencyKey: command.idempotencyKey };
  } catch {
    throw new Error("decision_record_invalid_request");
  }
}

export function parseDecisionProjectId(value: unknown): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) throw new Error("decision_record_invalid_request");
  return result.data;
}
