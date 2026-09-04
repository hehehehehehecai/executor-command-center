import type {
  GitHubCheckReadModel,
  GitHubCommitReadModel,
  GitHubIssueReadModel,
  GitHubPullRequestReadModel,
  GitHubReleaseReadModel,
  GitHubWorkflowRunReadModel,
} from "@/domain/github-activity/github-activity-read-models";

export const githubActivityReaderContract = "github-activity-reader.v1" as const;

export type GitHubActivityReadRequest = {
  readonly repository: {
    readonly owner: string;
    readonly name: string;
  };
  readonly installationToken: string;
  readonly since: string;
  readonly pagination: {
    readonly maxPages: number;
    readonly maxObjects: number;
  };
  readonly signal?: AbortSignal;
};

export type GitHubCheckReadRequest = GitHubActivityReadRequest & {
  readonly ref: string;
};

export type GitHubCommitReadRequest = GitHubActivityReadRequest & {
  readonly targetSha?: string;
};

export interface GitHubActivityReader {
  listCommits(input: GitHubCommitReadRequest): Promise<GitHubCommitReadModel[]>;
  listIssues(input: GitHubActivityReadRequest): Promise<GitHubIssueReadModel[]>;
  listPullRequests(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubPullRequestReadModel[]>;
  listReleases(input: GitHubActivityReadRequest): Promise<GitHubReleaseReadModel[]>;
  listWorkflowRuns(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubWorkflowRunReadModel[]>;
  listChecks(input: GitHubCheckReadRequest): Promise<GitHubCheckReadModel[]>;
}
