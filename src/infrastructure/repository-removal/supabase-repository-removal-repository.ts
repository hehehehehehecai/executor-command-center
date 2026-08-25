import "server-only";

import type { RepositoryRemovalRepository } from "@/application/repository-removal/repository-removal-use-case";
import { repositoryRemovalModes } from "@/domain/repository-removal/repository-removal";
import { z } from "zod";

type Options = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

export class SupabaseRepositoryRemovalRepository
  implements RepositoryRemovalRepository
{
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: Options) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
  }

  async execute(
    input: Parameters<RepositoryRemovalRepository["execute"]>[0],
  ): ReturnType<RepositoryRemovalRepository["execute"]> {
    let response: Response;
    try {
      response = await this.fetcher(
        new URL("rpc/execute_repository_removal", this.baseUrl).toString(),
        {
          method: "POST",
          headers: {
            apikey: this.options.serviceRoleKey,
            authorization: `Bearer ${this.options.serviceRoleKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p_actor_user_id: input.actorUserId,
            p_project_id: input.command.projectId,
            p_mode: input.command.mode,
            p_idempotency_key: input.command.idempotencyKey,
            p_confirmation_project_id: input.command.confirmation.projectId,
            p_confirmation_text: input.command.confirmation.text,
          }),
        },
      );
    } catch (error) {
      throw storageFailure(error);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw storageFailure(error);
    }
    if (!response.ok) throw storageFailure();

    const parsed = removalResponseSchema.safeParse(payload);
    if (!parsed.success) throw storageFailure(parsed.error);
    if (parsed.data.status === "failed") {
      throw new Error(parsed.data.error.code);
    }
    return parsed.data;
  }
}

const stableFailureCodes = [
  "repository_removal_confirmation_mismatch",
  "repository_removal_not_found",
  "repository_removal_conflict",
  "repository_removal_precondition_failed",
  "repository_removal_retryable_job_conflict",
  "repository_removal_storage_failed",
] as const;

const countMapSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);
const completedResponseSchema = z.object({
  operationId: z.string().uuid(),
  projectId: z.string().uuid(),
  mode: z.enum(repositoryRemovalModes),
  status: z.literal("completed"),
  outcome: z.enum(["executed", "replayed"]),
  counts: z.object({
    deleted: countMapSchema,
    preserved: countMapSchema,
    invalidated: countMapSchema,
  }).strict(),
  safelyRetryable: z.literal(true),
  completedAt: z.iso.datetime({ offset: true }),
}).strict();
const failedResponseSchema = z.object({
  operationId: z.string().uuid().optional(),
  status: z.literal("failed"),
  safelyRetryable: z.boolean(),
  error: z.object({ code: z.enum(stableFailureCodes) }).strict(),
}).strict();
const removalResponseSchema = z.discriminatedUnion("status", [
  completedResponseSchema,
  failedResponseSchema,
]);

function storageFailure(cause?: unknown) {
  return new Error("repository_removal_storage_failed", { cause });
}
