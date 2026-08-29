import "server-only";

import { projectStatuses, type ProjectStatus } from "@/domain/project-calibration/project-calibration";
import { z } from "zod";

export const connectedPanelReaderContract = "connected-panel-reader.v1" as const;

export type ConnectedActivityKind =
  | "github_commit"
  | "github_issue"
  | "github_pull_request"
  | "github_release"
  | "github_workflow_run";

export interface ConnectedPanelActivity {
  readonly sourceKind: ConnectedActivityKind;
  readonly sourceId: string;
  readonly occurredAt: string;
  readonly sourceUpdatedAt: string;
  readonly sourceVersion: string;
  readonly summary: string;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ConnectedPanelSyncRun {
  readonly id: string;
  readonly triggerSource: string;
  readonly status: string;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly errorCode: string | null;
}

export interface ConnectedPanelBrief {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly errorCode: string | null;
}

export interface ConnectedPanelData {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly repositoryFullName: string;
    readonly repositoryVisibility: "public" | "private" | "internal";
    readonly defaultBranch: string;
    readonly status: ProjectStatus;
    readonly coreGoal: string;
    readonly currentStageGoal: string;
    readonly currentBlocker: string | null;
    readonly updatedAt: string;
  };
  readonly activities: readonly ConnectedPanelActivity[];
  readonly syncRuns: readonly ConnectedPanelSyncRun[];
  readonly briefs: readonly ConnectedPanelBrief[];
}

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  neq(column: string, value: unknown): FilterQuery;
  order(column: string, options: { readonly ascending: boolean }): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;

export type ConnectedPanelSessionClient = {
  from(table: string): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const nonempty = z.string().trim().min(1);
const nullableText = z.string().nullable();

const projectRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  core_goal: nonempty,
  current_stage_goal: nonempty,
  status: z.enum(projectStatuses),
  current_blocker: nullableText,
  updated_at: timestamp,
  selected_repositories: z.object({
    id: uuid,
    user_id: uuid,
    full_name: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/),
    owner_login: nonempty,
    name: nonempty,
    visibility: z.enum(["public", "private", "internal"]),
    default_branch: nonempty,
    github_installations: z.object({
      id: uuid,
      user_id: uuid,
      installation_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      status: z.enum(["active", "suspended", "revoked"]),
    }).strict(),
  }).strict(),
}).strict()).max(1);

const activityBase = {
  project_id: uuid,
  github_object_id: nonempty,
  source_updated_at: timestamp,
  source_version: nonempty,
};
const commitRows = z.array(z.object({
  ...activityBase,
  message: nonempty,
  authored_at: nullableTimestamp,
  committed_at: timestamp,
  author_login: nullableText,
}).strict());
const issueRows = z.array(z.object({
  ...activityBase,
  issue_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: nonempty,
  state: nonempty,
  author_login: nullableText,
  closed_at: nullableTimestamp,
}).strict());
const pullRequestRows = z.array(z.object({
  ...activityBase,
  pull_request_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: nonempty,
  state: nonempty,
  is_draft: z.boolean(),
  head_sha: nonempty,
  base_ref: nonempty,
  merged_at: nullableTimestamp,
}).strict());
const releaseRows = z.array(z.object({
  ...activityBase,
  tag_name: nonempty,
  name: nullableText,
  is_draft: z.boolean(),
  is_prerelease: z.boolean(),
  published_at: nullableTimestamp,
}).strict());
const workflowRows = z.array(z.object({
  ...activityBase,
  workflow_id: nonempty,
  run_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: nonempty,
  conclusion: nullableText,
  event_name: nonempty,
  head_sha: nonempty,
}).strict());
const syncRows = z.array(z.object({
  id: uuid,
  project_id: uuid,
  trigger_source: nonempty,
  status: nonempty,
  queued_at: timestamp,
  started_at: nullableTimestamp,
  finished_at: nullableTimestamp,
  error_code: nullableText,
}).strict());
const briefRows = z.array(z.object({
  id: uuid,
  project_id: uuid,
  status: nonempty,
  created_at: timestamp,
  completed_at: nullableTimestamp,
  error_code: nullableText,
}).strict());

function safeFailure(cause?: unknown): Error {
  return new Error("connected_panel_read_failed", { cause });
}

async function execute(query: unknown): Promise<unknown> {
  let result: QueryResult;
  try {
    result = await (query as PromiseLike<QueryResult>);
  } catch (error) {
    throw safeFailure(error);
  }
  if (result.error) throw safeFailure(result.error);
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw safeFailure(parsed.error);
  return parsed.data;
}

function activity(
  sourceKind: ConnectedActivityKind,
  row: {
    readonly github_object_id: string;
    readonly source_updated_at: string;
    readonly source_version: string;
  },
  occurredAt: string,
  summary: string,
  facts: ConnectedPanelActivity["facts"],
): ConnectedPanelActivity {
  return {
    sourceKind,
    sourceId: row.github_object_id,
    occurredAt,
    sourceUpdatedAt: row.source_updated_at,
    sourceVersion: row.source_version,
    summary,
    facts,
  };
}

function projectQuery(
  client: ConnectedPanelSessionClient,
  userId: string,
  projectId: string | null,
) {
  let query = client.from("projects").select(
    "id,user_id,core_goal,current_stage_goal,status,current_blocker,updated_at,selected_repositories!inner(id,user_id,full_name,owner_login,name,visibility,default_branch,github_installations!inner(id,user_id,installation_id,status))",
  ).eq("user_id", userId).neq("status", "archived");
  if (projectId !== null) query = query.eq("id", projectId);
  return query.order("updated_at", { ascending: false }).limit(1);
}

function projectFacts(
  client: ConnectedPanelSessionClient,
  table: string,
  columns: string,
  projectId: string,
  order: string,
) {
  return client.from(table).select(columns)
    .eq("project_id", projectId)
    .order(order, { ascending: false })
    .limit(100);
}

export class SupabaseConnectedPanelReader {
  constructor(private readonly client: ConnectedPanelSessionClient) {}

  async read(input: {
    readonly userId: string;
    readonly projectId: string | null;
  }): Promise<ConnectedPanelData | null> {
    if (!uuid.safeParse(input.userId).success ||
        (input.projectId !== null && !uuid.safeParse(input.projectId).success)) {
      throw new Error("connected_panel_invalid_input");
    }

    const projects = parse(
      projectRows,
      await execute(projectQuery(this.client, input.userId, input.projectId)),
    );
    const project = projects[0];
    if (!project) return null;
    const repository = project.selected_repositories;
    const installation = repository.github_installations;
    if (project.user_id !== input.userId || repository.user_id !== input.userId ||
        installation.user_id !== input.userId || installation.status !== "active") {
      throw safeFailure();
    }

    const [commitData, issueData, pullRequestData, releaseData, workflowData, syncData, briefData] =
      await Promise.all([
        execute(projectFacts(this.client, "github_commits", "project_id,github_object_id,source_updated_at,source_version,message,authored_at,committed_at,author_login", project.id, "source_updated_at")),
        execute(projectFacts(this.client, "github_issues", "project_id,github_object_id,source_updated_at,source_version,issue_number,title,state,author_login,closed_at", project.id, "source_updated_at")),
        execute(projectFacts(this.client, "github_pull_requests", "project_id,github_object_id,source_updated_at,source_version,pull_request_number,title,state,is_draft,head_sha,base_ref,merged_at", project.id, "source_updated_at")),
        execute(projectFacts(this.client, "github_releases", "project_id,github_object_id,source_updated_at,source_version,tag_name,name,is_draft,is_prerelease,published_at", project.id, "source_updated_at")),
        execute(projectFacts(this.client, "github_workflow_runs", "project_id,github_object_id,source_updated_at,source_version,workflow_id,run_number,status,conclusion,event_name,head_sha", project.id, "source_updated_at")),
        execute(projectFacts(this.client, "sync_runs", "id,project_id,trigger_source,status,queued_at,started_at,finished_at,error_code", project.id, "queued_at")),
        execute(projectFacts(this.client, "project_briefs", "id,project_id,status,created_at,completed_at,error_code", project.id, "created_at")),
      ]);

    const commits = parse(commitRows, commitData);
    const issues = parse(issueRows, issueData);
    const pullRequests = parse(pullRequestRows, pullRequestData);
    const releases = parse(releaseRows, releaseData);
    const workflowRuns = parse(workflowRows, workflowData);
    const syncRuns = parse(syncRows, syncData);
    const briefs = parse(briefRows, briefData);

    return {
      project: {
        id: project.id,
        name: repository.name,
        repositoryFullName: repository.full_name,
        repositoryVisibility: repository.visibility,
        defaultBranch: repository.default_branch,
        status: project.status,
        coreGoal: project.core_goal,
        currentStageGoal: project.current_stage_goal,
        currentBlocker: project.current_blocker,
        updatedAt: project.updated_at,
      },
      activities: [
        ...commits.map((row) => activity("github_commit", row, row.committed_at, row.message, {
          authorLogin: row.author_login,
          authoredAt: row.authored_at,
        })),
        ...issues.map((row) => activity("github_issue", row, row.source_updated_at, row.title, {
          issueNumber: row.issue_number,
          state: row.state,
          authorLogin: row.author_login,
          closedAt: row.closed_at,
        })),
        ...pullRequests.map((row) => activity("github_pull_request", row, row.source_updated_at, row.title, {
          pullRequestNumber: row.pull_request_number,
          state: row.state,
          isDraft: row.is_draft,
          headSha: row.head_sha,
          baseRef: row.base_ref,
          mergedAt: row.merged_at,
        })),
        ...releases.map((row) => activity("github_release", row, row.published_at ?? row.source_updated_at, row.name ?? row.tag_name, {
          tagName: row.tag_name,
          isDraft: row.is_draft,
          isPrerelease: row.is_prerelease,
          publishedAt: row.published_at,
        })),
        ...workflowRuns.map((row) => activity("github_workflow_run", row, row.source_updated_at, `Workflow run ${row.run_number}`, {
          workflowId: row.workflow_id,
          runNumber: row.run_number,
          status: row.status,
          conclusion: row.conclusion,
          eventName: row.event_name,
          headSha: row.head_sha,
        })),
      ],
      syncRuns: syncRuns.map((row) => ({
        id: row.id,
        triggerSource: row.trigger_source,
        status: row.status,
        queuedAt: row.queued_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        errorCode: row.error_code,
      })),
      briefs: briefs.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        errorCode: row.error_code,
      })),
    };
  }
}
