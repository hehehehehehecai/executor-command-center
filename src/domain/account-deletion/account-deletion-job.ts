import { z } from "zod";

export const accountDeletionJobContract = "account-deletion-job.v1" as const;

const schema = z.object({
  version: z.literal(accountDeletionJobContract),
  jobType: z.literal("account.deletion.due.v1"),
  jobId: z.string().regex(/^[0-9a-f-]{36}:[0-9]+$/),
  operationId: z.string().uuid(),
  generation: z.number().int().nonnegative(),
  dueAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((job, context) => {
  if (job.jobId !== `${job.operationId}:${job.generation}`) {
    context.addIssue({ code: "custom", message: "job identity mismatch" });
  }
});

export type AccountDeletionJob = z.infer<typeof schema>;

export function parseAccountDeletionJob(value: unknown): AccountDeletionJob {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("account_deletion_job_invalid");
  return parsed.data;
}
