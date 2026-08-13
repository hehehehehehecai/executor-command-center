import "server-only";

import { isSyncStatus, type SyncStatus } from "@/domain/synchronization/synchronization-state";
import type { ProjectFreshnessPresentationInput } from "@/features/project-galaxy/freshness-presentation";
import { z } from "zod";

export const projectFreshnessReaderContract = "project-freshness-reader.v1" as const;

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  neq(column: string, value: unknown): FilterQuery;
  in(column: string, value: readonly unknown[]): FilterQuery;
  order(column: string, options: { readonly ascending: boolean }): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
};
export type ProjectFreshnessSessionClient = {
  from(table: "projects" | "sync_runs"): { select(columns: string): FilterQuery };
};

export interface ProjectFreshnessView {
  readonly projectId: string;
  readonly input: ProjectFreshnessPresentationInput;
}

const uuid = z.string().uuid();
const canonicalTime = z.iso.datetime({ offset: true });
const projectRows = z.array(z.object({ id: uuid, updated_at: canonicalTime }).strict()).max(1);
const runRows = z.array(z.object({
  id: uuid,
  status: z.string().refine(isSyncStatus),
  finished_at: canonicalTime.nullable(),
  error_code: z.string().max(64).nullable(),
}).strict()).max(1);

type RunRow = z.infer<typeof runRows>[number];

function failure(): Error {
  return new Error("project_freshness_read_failed");
}

async function result(query: unknown): Promise<QueryResult> {
  try {
    return await (query as PromiseLike<QueryResult>);
  } catch {
    throw failure();
  }
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const outcome = schema.safeParse(value);
  if (!outcome.success) throw failure();
  return outcome.data;
}

function mapRun(row: RunRow | undefined): ProjectFreshnessPresentationInput["latestRun"] {
  return row
    ? { id: row.id, status: row.status as SyncStatus, finishedAt: row.finished_at, errorCode: row.error_code }
    : null;
}

export class SupabaseProjectFreshnessReader {
  constructor(private readonly client: ProjectFreshnessSessionClient) {}

  async read(input: {
    readonly userId: string;
    readonly projectId: string | null;
    readonly now: string;
  }): Promise<ProjectFreshnessView | null> {
    if (!uuid.safeParse(input.userId).success ||
        (input.projectId !== null && !uuid.safeParse(input.projectId).success) ||
        !canonicalTime.safeParse(input.now).success) {
      throw new Error("project_freshness_invalid_input");
    }

    let projects = this.client.from("projects").select("id,updated_at");
    projects = projects.eq("user_id", input.userId).neq("status", "archived");
    if (input.projectId !== null) projects = projects.eq("id", input.projectId);
    const projectResult = await result(projects.order("updated_at", { ascending: false }).limit(1));
    if (projectResult.error) throw failure();
    const project = parsed(projectRows, projectResult.data)[0];
    if (!project) return null;

    const latestResult = await result(
      this.client.from("sync_runs").select("id,status,finished_at,error_code")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(1),
    );
    if (latestResult.error) throw failure();
    const latest = parsed(runRows, latestResult.data)[0];

    const successfulResult = await result(
      this.client.from("sync_runs").select("id,status,finished_at,error_code")
        .eq("project_id", project.id)
        .in("status", ["completed", "partial"])
        .order("finished_at", { ascending: false })
        .limit(1),
    );
    if (successfulResult.error) throw failure();
    const successful = parsed(runRows, successfulResult.data)[0];

    return {
      projectId: project.id,
      input: {
        provenance: "real",
        authorizationRevoked: latest?.error_code === "github_activity_authorization_revoked",
        latestRun: mapRun(latest),
        lastSuccessfulAt: successful?.finished_at ?? null,
        coverageComplete: latest?.status !== "partial",
        now: input.now,
      },
    };
  }
}
