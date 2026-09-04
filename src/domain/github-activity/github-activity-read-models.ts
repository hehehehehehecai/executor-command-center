export const githubActivityReadModelContracts = {
  commit: "github-commit-read-model.v1",
  issue: "github-issue-read-model.v1",
  pullRequest: "github-pull-request-read-model.v1",
  release: "github-release-read-model.v1",
  workflowCheck: "github-workflow-check-read-model.v1",
} as const;

type CommonReadModel = {
  readonly repositoryFullName: string;
  readonly githubObjectId: string;
  readonly sourceUpdatedAt: string;
  readonly sourceVersion: string;
};

export type GitHubCommitReadModel = CommonReadModel & {
  readonly objectType: "commit";
  readonly message: string;
  readonly authoredAt: string | null;
  readonly committedAt: string;
  readonly authorLogin: string | null;
};

export type GitHubIssueReadModel = CommonReadModel & {
  readonly objectType: "issue";
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed" | "unknown";
  readonly authorLogin: string | null;
  readonly closedAt: string | null;
};

export type GitHubPullRequestReadModel = CommonReadModel & {
  readonly objectType: "pull_request";
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed" | "unknown";
  readonly isDraft: boolean;
  readonly headSha: string;
  readonly baseRef: string;
  readonly mergedAt: string | null;
};

export type GitHubReleaseReadModel = CommonReadModel & {
  readonly objectType: "release";
  readonly tagName: string;
  readonly name: string | null;
  readonly isDraft: boolean;
  readonly isPrerelease: boolean;
  readonly publishedAt: string | null;
};

export type GitHubWorkflowStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending"
  | "unknown";

export type GitHubCheckStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "unknown";

export type GitHubActivityConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | "startup_failure"
  | "unknown"
  | null;

export type GitHubWorkflowRunReadModel = CommonReadModel & {
  readonly objectType: "workflow_run";
  readonly workflowId: string;
  readonly runNumber: number;
  readonly status: GitHubWorkflowStatus;
  readonly conclusion: GitHubActivityConclusion;
  readonly eventName: string;
  readonly headSha: string;
  readonly runAttempt: number;
};

export type GitHubCheckReadModel = CommonReadModel & {
  readonly objectType: "check";
  readonly name: string;
  readonly status: GitHubCheckStatus;
  readonly conclusion: GitHubActivityConclusion;
  readonly headSha: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
};
