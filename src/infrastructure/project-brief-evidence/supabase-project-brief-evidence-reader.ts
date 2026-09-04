import "server-only";

import type { ProjectBriefEvidenceSourceReader } from "@/application/project-brief-evidence/project-brief-evidence-ports";
import { projectCalibrationContract } from "@/domain/project-calibration/project-calibration";
import type {
  ProjectBriefEvidenceSourceData,
  RawGitHubActivitySource,
} from "@/domain/project-brief-evidence/evidence-snapshot";
import { z } from "zod";

export const projectBriefEvidenceReaderContract =
  "project-brief-evidence-reader.v1" as const;

type QueryResult = { readonly data: unknown; readonly error: unknown };
type FilterQuery = {
  eq(column: string, value: unknown): FilterQuery;
  limit(value: number): FilterQuery & PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;

type EvidenceTable =
  | "projects"
  | "selected_repositories"
  | "github_installations"
  | "github_commits"
  | "github_issues"
  | "github_pull_requests"
  | "github_releases"
  | "github_workflow_runs"
  | "github_document_snapshots";

export type ProjectBriefEvidenceSessionClient = {
  from(table: EvidenceTable): { select(columns: string): FilterQuery };
};

const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const nonempty = z.string().trim().min(1);
const optionalText = z.string().nullable();
const projectRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  selected_repository_id: uuid,
  core_goal: nonempty,
  current_stage_goal: nonempty,
  status: nonempty,
  current_blocker: optionalText,
  updated_at: timestamp,
}).strict()).max(1);
const selectedRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  github_installation_id: uuid,
}).strict()).max(1);
const installationRows = z.array(z.object({
  id: uuid,
  user_id: uuid,
  status: z.enum(["active", "suspended", "revoked"]),
}).strict()).max(1);

const snapshotBase = {
  project_id: uuid,
  github_object_id: nonempty,
  source_updated_at: timestamp,
  source_version: nonempty,
};
const commitRows = z.array(z.object({
  ...snapshotBase,
  message: nonempty,
  authored_at: nullableTimestamp,
  committed_at: timestamp,
  author_login: optionalText,
}).strict());
const issueRows = z.array(z.object({
  ...snapshotBase,
  issue_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: nonempty,
  state: nonempty,
  author_login: optionalText,
  closed_at: nullableTimestamp,
}).strict());
const pullRequestRows = z.array(z.object({
  ...snapshotBase,
  pull_request_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: nonempty,
  state: nonempty,
  is_draft: z.boolean(),
  head_sha: nonempty,
  base_ref: nonempty,
  merged_at: nullableTimestamp,
}).strict());
const releaseRows = z.array(z.object({
  ...snapshotBase,
  tag_name: nonempty,
  name: optionalText,
  is_draft: z.boolean(),
  is_prerelease: z.boolean(),
  published_at: nullableTimestamp,
}).strict());
const workflowRows = z.array(z.object({
  ...snapshotBase,
  workflow_id: nonempty,
  run_number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: nonempty,
  conclusion: optionalText,
  event_name: nonempty,
  head_sha: nonempty,
}).strict());
const documentRows = z.array(z.object({
  ...snapshotBase,
  document_path: nonempty,
  document_kind: nonempty,
  content_fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict());

type CommitRow = z.infer<typeof commitRows>[number];
type IssueRow = z.infer<typeof issueRows>[number];
type PullRequestRow = z.infer<typeof pullRequestRows>[number];
type ReleaseRow = z.infer<typeof releaseRows>[number];
type WorkflowRow = z.infer<typeof workflowRows>[number];

function safeFailure(): Error {
  return new Error("project_brief_evidence_read_failed");
}

async function execute(query: unknown): Promise<unknown> {
  let result: QueryResult;
  try {
    result = await (query as PromiseLike<QueryResult>);
  } catch {
    throw safeFailure();
  }
  if (result.error) throw safeFailure();
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw safeFailure();
  return result.data;
}

function ownedActivity(
  userId: string,
  projectId: string,
  row: CommitRow | IssueRow | PullRequestRow | ReleaseRow | WorkflowRow,
  sourceKind: RawGitHubActivitySource["sourceKind"],
  occurredAt: string,
  summary: string,
  facts: RawGitHubActivitySource["facts"],
): RawGitHubActivitySource {
  return {
    userId,
    projectId,
    sourceKind,
    sourceId: row.github_object_id,
    occurredAt,
    sourceUpdatedAt: row.source_updated_at,
    sourceVersion: row.source_version,
    summary,
    facts,
  };
}

export class SupabaseProjectBriefEvidenceReader
implements ProjectBriefEvidenceSourceReader {
  constructor(private readonly client: ProjectBriefEvidenceSessionClient) {}

  async read(input: { readonly userId: string; readonly projectId: string }):
  Promise<ProjectBriefEvidenceSourceData | null> {
    if (!uuid.safeParse(input.userId).success || !uuid.safeParse(input.projectId).success) {
      throw new Error("project_brief_evidence_invalid_input");
    }

    const projects = parse(projectRows, await execute(
      this.client.from("projects")
        .select("id,user_id,selected_repository_id,core_goal,current_stage_goal,status,current_blocker,updated_at")
        .eq("user_id", input.userId)
        .eq("id", input.projectId)
        .limit(1),
    ));
    const project = projects[0];
    if (!project) return null;

    const selections = parse(selectedRows, await execute(
      this.client.from("selected_repositories")
        .select("id,user_id,github_installation_id")
        .eq("user_id", input.userId)
        .eq("id", project.selected_repository_id)
        .limit(1),
    ));
    const selection = selections[0];
    const installations = selection
      ? parse(installationRows, await execute(
          this.client.from("github_installations")
            .select("id,user_id,status")
            .eq("user_id", input.userId)
            .eq("id", selection.github_installation_id)
            .limit(1),
        ))
      : [];
    const authorizationStatus = installations[0]?.status ?? "unavailable";

    const base: ProjectBriefEvidenceSourceData = {
      authorizationStatus,
      projectProfile: {
        userId: project.user_id,
        projectId: project.id,
        sourceId: project.id,
        sourceUpdatedAt: project.updated_at,
        sourceVersion: projectCalibrationContract,
        coreGoal: project.core_goal,
        currentStageGoal: project.current_stage_goal,
        status: project.status,
        currentBlocker: project.current_blocker,
      },
      githubActivities: [],
      authorizedDocuments: [],
      confirmedDecisionsSourceAvailable: false,
      confirmedDecisions: [],
    };
    if (authorizationStatus !== "active") return base;

    const [commitData, issueData, pullRequestData, releaseData, workflowData, documentData] =
      await Promise.all([
        execute(this.client.from("github_commits")
          .select("project_id,github_object_id,source_updated_at,source_version,message,authored_at,committed_at,author_login")
          .eq("project_id", project.id)),
        execute(this.client.from("github_issues")
          .select("project_id,github_object_id,source_updated_at,source_version,issue_number,title,state,author_login,closed_at")
          .eq("project_id", project.id)),
        execute(this.client.from("github_pull_requests")
          .select("project_id,github_object_id,source_updated_at,source_version,pull_request_number,title,state,is_draft,head_sha,base_ref,merged_at")
          .eq("project_id", project.id)),
        execute(this.client.from("github_releases")
          .select("project_id,github_object_id,source_updated_at,source_version,tag_name,name,is_draft,is_prerelease,published_at")
          .eq("project_id", project.id)),
        execute(this.client.from("github_workflow_runs")
          .select("project_id,github_object_id,source_updated_at,source_version,workflow_id,run_number,status,conclusion,event_name,head_sha")
          .eq("project_id", project.id)),
        execute(this.client.from("github_document_snapshots")
          .select("project_id,github_object_id,source_updated_at,source_version,document_path,document_kind,content_fingerprint")
          .eq("project_id", project.id)),
      ]);

    const commits = parse(commitRows, commitData);
    const issues = parse(issueRows, issueData);
    const pullRequests = parse(pullRequestRows, pullRequestData);
    const releases = parse(releaseRows, releaseData);
    const workflowRuns = parse(workflowRows, workflowData);
    const documents = parse(documentRows, documentData);

    return {
      ...base,
      githubActivities: [
        ...commits.map((row) => ownedActivity(
          input.userId,
          project.id,
          row,
          "github_commit",
          row.committed_at,
          row.message,
          { authorLogin: row.author_login, authoredAt: row.authored_at },
        )),
        ...issues.map((row) => ownedActivity(
          input.userId,
          project.id,
          row,
          "github_issue",
          row.source_updated_at,
          row.title,
          {
            issueNumber: row.issue_number,
            state: row.state,
            authorLogin: row.author_login,
            closedAt: row.closed_at,
          },
        )),
        ...pullRequests.map((row) => ownedActivity(
          input.userId,
          project.id,
          row,
          "github_pull_request",
          row.source_updated_at,
          row.title,
          {
            pullRequestNumber: row.pull_request_number,
            state: row.state,
            isDraft: row.is_draft,
            headSha: row.head_sha,
            baseRef: row.base_ref,
            mergedAt: row.merged_at,
          },
        )),
        ...releases.map((row) => ownedActivity(
          input.userId,
          project.id,
          row,
          "github_release",
          row.published_at ?? row.source_updated_at,
          row.name ?? row.tag_name,
          {
            tagName: row.tag_name,
            isDraft: row.is_draft,
            isPrerelease: row.is_prerelease,
            publishedAt: row.published_at,
          },
        )),
        ...workflowRuns.map((row) => ownedActivity(
          input.userId,
          project.id,
          row,
          "github_workflow_run",
          row.source_updated_at,
          `Workflow run ${row.run_number}`,
          {
            workflowId: row.workflow_id,
            runNumber: row.run_number,
            status: row.status,
            conclusion: row.conclusion,
            eventName: row.event_name,
            headSha: row.head_sha,
          },
        )),
      ],
      authorizedDocuments: documents.map((row) => ({
        userId: input.userId,
        projectId: project.id,
        sourceId: row.github_object_id,
        sourceUpdatedAt: row.source_updated_at,
        sourceVersion: row.source_version,
        sourceSha: row.content_fingerprint,
        path: row.document_path,
        documentKind: row.document_kind,
        authorized: true,
      })),
    };
  }
}
