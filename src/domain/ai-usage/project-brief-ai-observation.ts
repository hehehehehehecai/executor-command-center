import { z } from "zod";

export const projectBriefAiObservationContractVersion =
  "project-brief-ai-observation.v1" as const;
export const projectBriefAiFailureStages = [
  "provider", "parse", "schema", "evidence", "persistence",
] as const;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const safeLabel = z.string().trim().min(1).max(255);
const canonicalUtc = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
});

export const projectBriefAiObservationSchema = z.object({
  contractVersion: z.literal(projectBriefAiObservationContractVersion),
  observationId: z.string().uuid(),
  correlationId: z.string().uuid(),
  providerRequestId: safeLabel.nullable(),
  briefId: z.string().uuid().nullable(),
  userId: z.string().uuid(),
  feature: z.literal("project_brief"),
  projectId: z.string().uuid(),
  provider: safeLabel.nullable(),
  model: safeLabel.nullable(),
  promptVersion: safeLabel,
  schemaVersion: safeLabel,
  evidenceFingerprint: sha256,
  cacheKeyFingerprint: sha256.nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  latencyMs: z.number().nonnegative().finite().nullable(),
  cost: z.object({
    amountMicrounits: z.number().int().nonnegative().nullable(),
    basis: z.enum(["persisted_microunits", "unavailable"]),
  }).strict(),
  cacheStatus: z.enum(["hit", "miss", "bypass"]),
  providerAttempted: z.boolean(),
  quotaCharge: z.number().int().nonnegative(),
  terminalStatus: z.enum(["completed", "failed"]),
  failureStage: z.enum(projectBriefAiFailureStages).nullable(),
  failureCode: safeLabel.nullable(),
  createdAt: canonicalUtc,
  startedAt: canonicalUtc,
  finishedAt: canonicalUtc,
}).strict().superRefine((value, context) => {
  const completed = value.terminalStatus === "completed";
  if (completed !== (value.failureStage === null && value.failureCode === null)) {
    context.addIssue({ code: "custom", message: "project_brief_ai_observation_terminal_invalid" });
  }
  if ((value.cost.amountMicrounits === null) !== (value.cost.basis === "unavailable")) {
    context.addIssue({ code: "custom", message: "project_brief_ai_observation_cost_invalid" });
  }
  if (value.finishedAt < value.startedAt || value.startedAt < value.createdAt) {
    context.addIssue({ code: "custom", message: "project_brief_ai_observation_time_invalid" });
  }
});

export type ProjectBriefAiObservation = z.infer<typeof projectBriefAiObservationSchema>;

export interface ProjectBriefAiInvocationObservationSource {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly feature: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly promptVersion: string | null;
  readonly schemaVersion: string | null;
  readonly inputFingerprint: string | null;
  readonly cacheEquivalenceFingerprint: string | null;
  readonly status: "completed" | "failed";
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number | null;
  readonly costMicrounits: number | null;
  readonly cacheStatus: "hit" | "miss" | "bypass" | null;
  readonly failureStage: string | null;
  readonly errorCode: string | null;
  readonly reservationId: string | null;
  readonly sourceInvocationId: string | null;
  readonly briefId: string | null;
  readonly providerRequestId: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

function canonicalFailureStage(errorCode: string | null) {
  if (errorCode === "project_brief_parse_failure") return "parse" as const;
  if (errorCode === "project_brief_schema_validation_failed") return "schema" as const;
  if (errorCode === "project_brief_evidence_validation_failed") return "evidence" as const;
  if (
    errorCode === "project_brief_persistence_failed"
    || errorCode === "project_brief_energy_consume_failed"
    || errorCode === "project_brief_idempotency_conflict"
  ) return "persistence" as const;
  return "provider" as const;
}

function normalizeUtc(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

export function parseProjectBriefAiObservation(input: unknown): ProjectBriefAiObservation {
  const parsed = projectBriefAiObservationSchema.safeParse(input);
  if (!parsed.success) throw new Error("project_brief_ai_observation_invalid");
  return parsed.data;
}

export function createProjectBriefAiObservation(input: {
  readonly invocation: ProjectBriefAiInvocationObservationSource;
  readonly reservation: { readonly amount: number; readonly status: "consumed" | "released" } | null;
  readonly brief: {
    readonly rangeStart: string;
    readonly rangeEnd: string;
    readonly evidenceFingerprint: string;
  } | null;
  readonly cacheKeyFingerprint: string | null;
}): ProjectBriefAiObservation {
  const { invocation } = input;
  const completed = invocation.status === "completed";
  const output = {
    contractVersion: projectBriefAiObservationContractVersion,
    observationId: invocation.id,
    correlationId: invocation.reservationId ?? invocation.sourceInvocationId,
    providerRequestId: invocation.providerRequestId,
    briefId: invocation.briefId,
    userId: invocation.userId,
    feature: invocation.feature,
    projectId: invocation.projectId,
    provider: invocation.provider,
    model: invocation.model,
    promptVersion: invocation.promptVersion,
    schemaVersion: invocation.schemaVersion,
    evidenceFingerprint: input.brief?.evidenceFingerprint ?? invocation.inputFingerprint,
    cacheKeyFingerprint: input.brief === null ? null : input.cacheKeyFingerprint,
    inputTokens: invocation.inputTokens,
    outputTokens: invocation.outputTokens,
    latencyMs: invocation.latencyMs,
    cost: {
      amountMicrounits: invocation.costMicrounits,
      basis: invocation.costMicrounits === null ? "unavailable" as const
        : "persisted_microunits" as const,
    },
    cacheStatus: invocation.cacheStatus,
    providerAttempted: invocation.cacheStatus !== "hit",
    quotaCharge: completed && input.reservation?.status === "consumed"
      ? input.reservation.amount
      : 0,
    terminalStatus: invocation.status,
    failureStage: completed ? null : canonicalFailureStage(invocation.errorCode),
    failureCode: completed ? null : invocation.errorCode,
    createdAt: normalizeUtc(invocation.createdAt),
    startedAt: normalizeUtc(invocation.startedAt),
    finishedAt: normalizeUtc(invocation.completedAt),
  };
  return parseProjectBriefAiObservation(output);
}
