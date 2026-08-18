import type {
  DurableCompletedProjectBriefGeneration,
  DurableFailedProjectBriefGeneration,
  DurableInProgressProjectBriefGeneration,
  DurableProjectBriefGenerationOutcome,
  FailProjectBriefGenerationInput,
  FinalizeProjectBriefGenerationInput,
  ProjectBriefGenerationPersistence,
} from "@/application/project-brief/project-brief-generation-ports";
import {
  projectBriefGenerationFailureCodes,
  projectBriefGenerationFailureStages,
} from "@/application/project-brief/generate-project-brief";
import { parseProjectBrief } from "@/domain/project-brief/project-brief-schema";
import { z } from "zod";

type RpcResult = { readonly data: unknown; readonly error: unknown };
type AuthenticatedGenerationRpcClient = {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
};

type WaitOptions = {
  readonly attempts: number;
  readonly intervalMs: number;
  readonly sleep: (milliseconds: number) => Promise<void>;
};

const completedSchema = z.object({
  status: z.literal("completed"),
  outcome: z.enum(["completed", "replayed"]),
  reservation_id: z.string().uuid(),
  brief_id: z.string().uuid(),
  invocation_id: z.string().uuid(),
  brief: z.record(z.string(), z.unknown()),
}).strict();

const failedSchema = z.object({
  status: z.literal("failed"),
  outcome: z.enum(["released", "replayed"]),
  reservation_id: z.string().uuid(),
  failure_stage: z.enum(projectBriefGenerationFailureStages),
  error_code: z.enum(projectBriefGenerationFailureCodes),
}).strict();

const inProgressSchema = z.object({
  status: z.literal("in_progress"),
  outcome: z.literal("reserved"),
  reservation_id: z.string().uuid(),
}).strict();

const outcomeSchema = z.discriminatedUnion("status", [
  completedSchema,
  failedSchema,
  inProgressSchema,
]);

const allowedErrors = new Set([
  "project_brief_generation_unauthenticated",
  "project_brief_generation_invalid_request",
  "project_brief_generation_reservation_not_found",
  "project_brief_generation_idempotency_conflict",
  "project_brief_generation_persistence_failed",
]);

function errorMessage(value: unknown): string | null {
  if (
    typeof value === "object"
    && value !== null
    && "message" in value
    && typeof value.message === "string"
  ) return value.message;
  return null;
}

function storageFailure(cause?: unknown): Error {
  return new Error("project_brief_generation_storage_failed", { cause });
}

function completed(
  value: z.infer<typeof completedSchema>,
): DurableCompletedProjectBriefGeneration {
  return {
    status: "completed",
    outcome: value.outcome,
    reservationId: value.reservation_id,
    briefId: value.brief_id,
    invocationId: value.invocation_id,
    brief: parseProjectBrief(value.brief),
  };
}

function failed(
  value: z.infer<typeof failedSchema>,
): DurableFailedProjectBriefGeneration {
  return {
    status: "failed",
    outcome: value.outcome,
    reservationId: value.reservation_id,
    failureStage: value.failure_stage,
    errorCode: value.error_code,
  };
}

function inProgress(
  value: z.infer<typeof inProgressSchema>,
): DurableInProgressProjectBriefGeneration {
  return {
    status: "in_progress",
    outcome: "reserved",
    reservationId: value.reservation_id,
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SupabaseProjectBriefGenerationPersistence
implements ProjectBriefGenerationPersistence {
  private readonly wait: WaitOptions;

  constructor(
    private readonly clients: {
      readonly trustedRpc: AuthenticatedGenerationRpcClient;
      readonly authenticatedRpc: AuthenticatedGenerationRpcClient;
      readonly actorUserId: string;
    },
    options: Partial<WaitOptions> = {},
  ) {
    this.wait = {
      attempts: options.attempts ?? 20,
      intervalMs: options.intervalMs ?? 250,
      sleep: options.sleep ?? defaultSleep,
    };
    if (
      !Number.isInteger(this.wait.attempts)
      || this.wait.attempts <= 0
      || this.wait.attempts > 100
      || !Number.isInteger(this.wait.intervalMs)
      || this.wait.intervalMs < 0
      || this.wait.intervalMs > 10_000
    ) {
      throw new Error("project_brief_generation_wait_invalid");
    }
  }

  async waitForOutcome(
    reservationId: string,
  ): Promise<DurableProjectBriefGenerationOutcome> {
    let outcome: DurableProjectBriefGenerationOutcome = {
      status: "in_progress",
      outcome: "reserved",
      reservationId,
    };
    for (let attempt = 0; attempt < this.wait.attempts; attempt += 1) {
      outcome = await this.readOutcome(reservationId);
      if (outcome.status !== "in_progress") return outcome;
      if (attempt + 1 < this.wait.attempts) {
        await this.wait.sleep(this.wait.intervalMs);
      }
    }
    return outcome;
  }

  async finalize(
    input: FinalizeProjectBriefGenerationInput,
  ): Promise<DurableCompletedProjectBriefGeneration> {
    const outcome = await this.execute(
      this.clients.trustedRpc,
      "finalize_project_brief_generation",
      {
      p_actor_user_id: this.clients.actorUserId,
      p_reservation_id: input.reservationId,
      p_range_start: input.rangeStart,
      p_range_end: input.rangeEnd,
      p_prompt_version: input.promptVersion,
      p_schema_version: input.schemaVersion,
      p_evidence_fingerprint: input.evidenceFingerprint,
      p_payload: input.brief,
      p_expires_at: input.expiresAt,
      p_provider: input.metadata.provider,
      p_model: input.metadata.model,
      p_request_id: input.metadata.requestId,
      p_input_tokens: input.metadata.inputTokens,
      p_output_tokens: input.metadata.outputTokens,
      p_latency_ms: input.metadata.latencyMs,
      },
    );
    if (outcome.status !== "completed") throw storageFailure();
    return outcome;
  }

  async fail(
    input: FailProjectBriefGenerationInput,
  ): Promise<DurableFailedProjectBriefGeneration> {
    const outcome = await this.execute(
      this.clients.trustedRpc,
      "fail_project_brief_generation",
      {
      p_actor_user_id: this.clients.actorUserId,
      p_reservation_id: input.reservationId,
      p_failure_stage: input.failureStage,
      p_error_code: input.errorCode,
      p_provider: input.metadata?.provider ?? null,
      p_model: input.metadata?.model ?? null,
      p_request_id: input.metadata?.requestId ?? null,
      p_input_tokens: input.metadata?.inputTokens ?? null,
      p_output_tokens: input.metadata?.outputTokens ?? null,
      p_latency_ms: input.metadata?.latencyMs ?? null,
      },
    );
    if (outcome.status !== "failed") throw storageFailure();
    return outcome;
  }

  private readOutcome(
    reservationId: string,
  ): Promise<DurableProjectBriefGenerationOutcome> {
    return this.execute(this.clients.authenticatedRpc, "get_project_brief_generation_outcome", {
      p_reservation_id: reservationId,
    });
  }

  private async execute(
    client: AuthenticatedGenerationRpcClient,
    name: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<DurableProjectBriefGenerationOutcome> {
    let result: RpcResult;
    try {
      result = await client.rpc(name, parameters);
    } catch (error) {
      throw storageFailure(error);
    }
    if (result.error) {
      const message = errorMessage(result.error);
      if (message && allowedErrors.has(message)) throw new Error(message);
      throw storageFailure(result.error);
    }
    const parsed = outcomeSchema.safeParse(result.data);
    if (!parsed.success) throw storageFailure(parsed.error);
    switch (parsed.data.status) {
      case "completed":
        try {
          return completed(parsed.data);
        } catch (error) {
          throw storageFailure(error);
        }
      case "failed":
        return failed(parsed.data);
      case "in_progress":
        return inProgress(parsed.data);
    }
  }
}
import "server-only";
