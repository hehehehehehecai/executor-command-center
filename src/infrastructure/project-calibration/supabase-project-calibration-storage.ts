import "server-only";

import type {
  ProjectCalibrationReader,
  ProjectCalibrationWriter,
} from "@/application/project-calibration/project-calibration-use-cases";
import {
  projectStatuses,
  type ProjectCalibration,
  type ProjectCalibrationView,
  type ProjectRepositoryFacts,
} from "@/domain/project-calibration/project-calibration";
import { z } from "zod";

export const projectCalibrationStorageContract =
  "project-calibration-storage.v1" as const;

type QueryResult = { readonly data: unknown; readonly error: unknown };
type SessionClient = {
  from(table: "selected_repositories"): {
    select(columns: string): PromiseLike<QueryResult>;
  };
};
type WriterOptions = {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetcher?: typeof fetch;
};

const projectRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  selected_repository_id: z.string().uuid(),
  core_goal: z.string().min(1).max(2000),
  current_stage_goal: z.string().min(1).max(2000),
  status: z.enum(projectStatuses),
  current_blocker: z.string().min(1).max(2000).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).strict();

const repositoryFactsSchema = z.object({
  id: z.string().uuid(),
  github_repository_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  full_name: z.string().min(1),
  visibility: z.enum(["public", "private", "internal"]),
  default_branch: z.string().min(1),
}).strict();

const readRowSchema = repositoryFactsSchema.extend({
  projects: z.array(projectRowSchema),
}).strict();
const writeRowSchema = projectRowSchema.extend({
  selected_repositories: readRowSchema,
}).strict();
const readRowsSchema = z.array(readRowSchema);

function repositoryFacts(row: z.infer<typeof repositoryFactsSchema>): ProjectRepositoryFacts {
  return {
    id: row.id,
    repositoryId: row.github_repository_id,
    fullName: row.full_name,
    visibility: row.visibility,
    defaultBranch: row.default_branch,
  };
}

function calibration(row: z.infer<typeof projectRowSchema>): ProjectCalibration {
  return {
    id: row.id,
    selectedRepositoryId: row.selected_repository_id,
    coreGoal: row.core_goal,
    currentStageGoal: row.current_stage_goal,
    status: row.status,
    currentBlocker: row.current_blocker,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function storageFailure(cause?: unknown) {
  return new Error("project_calibration_storage_failed", { cause });
}

export class SupabaseProjectCalibrationReader implements ProjectCalibrationReader {
  constructor(private readonly client: SessionClient) {}

  async listOwn(): Promise<readonly ProjectCalibrationView[]> {
    let result: QueryResult;
    try {
      result = await this.client.from("selected_repositories").select(
        "id,github_repository_id,full_name,visibility,default_branch,projects(id,user_id,selected_repository_id,core_goal,current_stage_goal,status,current_blocker,created_at,updated_at)",
      );
    } catch (error) {
      throw storageFailure(error);
    }
    if (result.error) throw storageFailure(result.error);
    const parsed = readRowsSchema.safeParse(result.data);
    if (!parsed.success) throw storageFailure(parsed.error);

    return parsed.data.map((row) => {
      const active = row.projects.filter((project) => project.status !== "archived");
      if (active.length > 1) throw storageFailure();
      return {
        repository: repositoryFacts(row),
        calibration: active[0] ? calibration(active[0]) : null,
      };
    });
  }
}

const allowedFailures = new Set([
  "project_calibration_selected_repository_not_found",
  "project_calibration_selected_repository_wrong_user",
  "project_calibration_conflict",
]);

function responseMessage(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }
  return null;
}

export class SupabaseProjectCalibrationWriter implements ProjectCalibrationWriter {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: WriterOptions) {
    this.baseUrl = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
    this.fetcher = options.fetcher ?? fetch;
  }

  async save(input: Parameters<ProjectCalibrationWriter["save"]>[0]) {
    let response: Response;
    try {
      response = await this.fetcher(
        new URL("rpc/save_project_calibration", this.baseUrl).toString(),
        {
          method: "POST",
          headers: {
            apikey: this.options.serviceRoleKey,
            authorization: `Bearer ${this.options.serviceRoleKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p_user_id: input.userId,
            p_selected_repository_id: input.command.selectedRepositoryId,
            p_core_goal: input.command.coreGoal,
            p_current_stage_goal: input.command.currentStageGoal,
            p_status: input.command.status,
            p_current_blocker: input.command.currentBlocker,
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
    if (!response.ok) {
      const message = responseMessage(payload);
      if (message && allowedFailures.has(message)) throw new Error(message);
      throw storageFailure();
    }
    const parsed = writeRowSchema.safeParse(payload);
    if (!parsed.success) throw storageFailure(parsed.error);
    return {
      repository: repositoryFacts(parsed.data.selected_repositories),
      calibration: calibration(parsed.data),
    };
  }
}
