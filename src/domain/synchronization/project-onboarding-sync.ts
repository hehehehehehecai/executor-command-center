import { z } from "zod";

export const projectOnboardingSyncContract = "project-onboarding-sync.v1" as const;
export const projectSyncStatusSchema = z.object({
  contractVersion: z.literal(projectOnboardingSyncContract),
  projectId: z.string().uuid(),
  state: z.enum(["not_started", "dispatch_pending", "queued", "running", "partial", "completed", "failed", "cancelled", "suspended", "revoked"]),
  syncRunId: z.string().uuid().nullable(),
  queuedAt: z.iso.datetime({ offset: true }).nullable(),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  retryRequestId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).nullable(),
}).strict();
export type ProjectSyncStatusView = z.infer<typeof projectSyncStatusSchema>;
