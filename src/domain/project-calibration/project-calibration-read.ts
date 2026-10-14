import { z } from "zod";
import { projectStatuses } from "./project-calibration";

export const projectCalibrationReadContract = "project-calibration-read.v2" as const;

// Null records a missing user confirmation; absent and blank fields are invalid.
export const confirmedProjectGoalSchema = z.string().min(1).max(2000)
  .refine(value => value.trim().length > 0);
export const projectBackgroundSchema = z.object({
  coreGoal: confirmedProjectGoalSchema.nullable(),
  currentStageGoal: confirmedProjectGoalSchema.nullable(),
  status: z.enum(projectStatuses).nullable(),
}).strict();
export const projectCalibrationReadSchema = projectBackgroundSchema.extend({
  id: z.string().uuid(),
  selectedRepositoryId: z.string().uuid(),
  currentBlocker: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();
export const projectCalibrationSavedSchema = projectCalibrationReadSchema.extend({
  coreGoal: confirmedProjectGoalSchema,
  currentStageGoal: confirmedProjectGoalSchema,
  status: z.enum(projectStatuses),
}).strict();

export function hasUnconfirmedProjectBackground(background: z.infer<typeof projectBackgroundSchema>): boolean {
  return background.coreGoal === null || background.currentStageGoal === null || background.status === null;
}
