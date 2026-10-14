import { projectStatuses, type ProjectStatus } from "./project-calibration";
export const projectContextContract = "project-context.v1" as const;
export type ProjectContext = { readonly coreGoal: string | null; readonly currentStageGoal: string | null; readonly status: ProjectStatus | null; readonly currentBlocker: string | null };
export type ProjectContextPatch = Partial<ProjectContext>;
export interface ProjectContextView {
  readonly contractVersion: typeof projectContextContract;
  readonly id: string;
  readonly selectedRepositoryId: string;
  readonly context: ProjectContext;
  readonly completeness: { readonly complete: boolean; readonly missingFields: readonly string[] };
  readonly syncPreparation: { readonly state: "ready" | "blocked"; readonly requested: false };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = ["coreGoal", "currentStageGoal", "status", "currentBlocker"] as const;
const invalid = () => new Error("project_context_invalid_request");
function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw invalid();
  const record = value as Record<string, unknown>;
  if (Reflect.ownKeys(record).some(key => typeof key !== "string" || !keys.includes(key))) throw invalid();
  return record;
}
export function parseProjectContextId(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value)) throw invalid();
  return value.toLowerCase();
}
export function parseProjectCreation(value: unknown): { selectedRepositoryId: string } {
  return { selectedRepositoryId: parseProjectContextId(object(value, ["selectedRepositoryId"]).selectedRepositoryId) };
}
export function parseProjectContextPatch(value: unknown): ProjectContextPatch {
  const record = object(value, fields);
  if (Object.keys(record).length === 0) throw invalid();
  for (const [key, value] of Object.entries(record)) {
    if (value === null) continue;
    if (key === "status") {
      if (typeof value !== "string" || !new Set<string>(projectStatuses).has(value)) throw invalid();
    } else if (typeof value !== "string" || !value.length || value.length > 2000 || value.trim() !== value) throw invalid();
  }
  return { ...record } as ProjectContextPatch;
}
export function contextCompleteness(context: Pick<ProjectContext, "coreGoal" | "currentStageGoal" | "status">) {
  const missingFields = (["coreGoal", "currentStageGoal", "status"] as const).filter(key => context[key] === null);
  return { complete: missingFields.length === 0, missingFields };
}
