export const githubMinimumPermissionsContract = "github-minimum-permissions.v1" as const;

export const githubAppMinimumPermissions = {
  actions: "read",
  checks: "read",
  contents: "read",
  issues: "read",
  metadata: "read",
  pull_requests: "read",
} as const;

export const githubMetadataOnlyPermissions = { metadata: "read" } as const;
export const githubActivityReadPermissions = githubAppMinimumPermissions;

export const githubOperationPermissionMatrix = [
  { operation: "get_installation", resource: "installation", permission: "metadata", level: "read" },
  { operation: "create_installation_token", resource: "installation", permission: "metadata", level: "read" },
  { operation: "list_installation_repositories", resource: "repository", permission: "metadata", level: "read" },
  { operation: "list_commits", resource: "commit", permission: "contents", level: "read" },
  { operation: "list_issues", resource: "issue", permission: "issues", level: "read" },
  { operation: "list_pull_requests", resource: "pull_request", permission: "pull_requests", level: "read" },
  { operation: "list_releases", resource: "release", permission: "contents", level: "read" },
  { operation: "list_workflow_runs", resource: "workflow_run", permission: "actions", level: "read" },
  { operation: "list_check_runs", resource: "check_run", permission: "checks", level: "read" },
  { operation: "revoke_installation_token", resource: "installation_token", permission: "metadata", level: "read" },
] as const;

export const githubWebhookPermissionMatrix = [
  { event: "installation", resource: "installation", permission: "metadata", level: "read" },
  { event: "issues", resource: "issue", permission: "issues", level: "read" },
  { event: "pull_request", resource: "pull_request", permission: "pull_requests", level: "read" },
  { event: "push", resource: "commit", permission: "contents", level: "read" },
  { event: "release", resource: "release", permission: "contents", level: "read" },
  { event: "repository", resource: "repository", permission: "metadata", level: "read" },
  { event: "workflow_run", resource: "workflow_run", permission: "actions", level: "read" },
] as const;
