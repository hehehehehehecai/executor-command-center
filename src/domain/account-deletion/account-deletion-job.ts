import { z } from "zod";

export const accountDeletionJobContract = "account-deletion-job.v1" as const;

const schema = z.object({
  version: z.literal(accountDeletionJobContract),
  jobType: z.literal("account.deletion.due.v1"),
  jobId: z.string().uuid(),
  operationId: z.string().uuid(),
  dueAt: z.iso.datetime({ offset: true }),
}).strict();

export type AccountDeletionJob = z.infer<typeof schema>;

export function parseAccountDeletionJob(value: unknown): AccountDeletionJob {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("account_deletion_job_invalid");
  return parsed.data;
}
