import { describe, expect, it } from "vitest";

import {
  githubAppMinimumPermissions,
  githubOperationPermissionMatrix,
  githubWebhookPermissionMatrix,
} from "./github-minimum-permissions";

describe("github-minimum-permissions.v1", () => {
  it("binds every implemented GitHub operation to read-only minimum permissions", () => {
    expect(githubAppMinimumPermissions).toEqual({
      actions: "read",
      checks: "read",
      contents: "read",
      issues: "read",
      metadata: "read",
      pull_requests: "read",
    });
    expect(githubOperationPermissionMatrix.map((entry) => entry.operation)).toEqual([
      "get_installation",
      "create_installation_token",
      "list_installation_repositories",
      "list_commits",
      "list_issues",
      "list_pull_requests",
      "list_releases",
      "list_workflow_runs",
      "list_check_runs",
      "revoke_installation_token",
    ]);
    expect(githubOperationPermissionMatrix.every((entry) => entry.level === "read")).toBe(true);
    expect(JSON.stringify(githubOperationPermissionMatrix)).not.toMatch(/write|admin/i);
  });

  it("maps every accepted webhook event without granting write or admin", () => {
    expect(githubWebhookPermissionMatrix.map((entry) => entry.event)).toEqual([
      "installation",
      "issues",
      "pull_request",
      "push",
      "release",
      "repository",
      "workflow_run",
    ]);
    expect(JSON.stringify(githubWebhookPermissionMatrix)).not.toMatch(/write|admin/i);
  });
});
