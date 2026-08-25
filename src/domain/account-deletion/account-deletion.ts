import { z } from "zod";

export const accountDeletionContract = "account-deletion.v1" as const;

const requestSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/),
  confirmation: z.string().max(128),
}).strict();

const operationIdSchema = z.object({ operationId: z.string().uuid() }).strict();

export type AccountDeletionRequest = z.infer<typeof requestSchema>;
export type AccountDeletionOperation = {
  readonly operationId?: string;
  readonly status: "active" | "deletion_pending" | "deleting" | "deleted" | "deletion_failed";
  readonly outcome: string;
  readonly requestedAt?: string;
  readonly dueAt?: string;
  readonly claimedAt?: string;
  readonly completedAt?: string;
  readonly failureCode?: string;
  readonly safelyRetryable: boolean;
};

export function parseAccountDeletionRequest(value: unknown): AccountDeletionRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) throw new Error("account_deletion_invalid_request");
  return parsed.data;
}
export function parseAccountDeletionCancellation(value: unknown) {
  const parsed = operationIdSchema.safeParse(value);
  if (!parsed.success) throw new Error("account_deletion_invalid_request");
  return parsed.data;
}
