// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { GitHubRestActivityReader } from "@/infrastructure/github/github-activity-reader";

const request = {
  repository: {
    owner: "synthetic-owner",
    name: "synthetic-repository",
  },
  installationToken: "synthetic-installation-token",
  since: "2026-05-01T00:00:00.000Z",
  pagination: { maxPages: 2, maxObjects: 100 },
} as const;

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("github-activity-snapshots.v1 Reader compatibility", () => {
  it("provides every Phase 1 structured column without raw provider data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((rawUrl) => {
      const path = new URL(String(rawUrl)).pathname;

      if (path.endsWith("/commits")) {
        return Promise.resolve(json([{
          sha: "a".repeat(40),
          commit: {
            message: "Synthetic commit",
            author: { date: "2026-05-02T01:00:00Z" },
            committer: { date: "2026-05-02T02:00:00Z" },
          },
          author: { login: "synthetic-author" },
        }]));
      }
      if (path.endsWith("/issues")) {
        return Promise.resolve(json([{
          id: 101,
          number: 11,
          title: "Synthetic issue",
          state: "open",
          user: { login: "synthetic-author" },
          updated_at: "2026-05-03T03:00:00Z",
          closed_at: null,
        }]));
      }
      if (path.endsWith("/pulls")) {
        return Promise.resolve(json([{
          id: 201,
          number: 21,
          title: "Synthetic pull request",
          state: "closed",
          draft: false,
          updated_at: "2026-05-04T04:00:00Z",
          head: { sha: "b".repeat(40) },
          base: { ref: "main" },
          merged_at: "2026-05-04T05:00:00Z",
        }]));
      }
      if (path.endsWith("/releases")) {
        return Promise.resolve(json([{
          id: 301,
          tag_name: "v1.0.0",
          name: "Synthetic release",
          draft: false,
          prerelease: true,
          created_at: "2026-05-05T05:00:00Z",
          published_at: "2026-05-05T06:00:00Z",
        }]));
      }
      if (path.endsWith("/actions/runs")) {
        return Promise.resolve(json({
          total_count: 1,
          workflow_runs: [{
            id: 401,
            workflow_id: 9001,
            run_number: 31,
            status: "completed",
            conclusion: "success",
            event: "push",
            head_sha: "c".repeat(40),
            run_attempt: 2,
            updated_at: "2026-05-06T06:00:00Z",
          }],
        }));
      }

      return Promise.reject(new Error("unexpected_synthetic_endpoint"));
    });

    const reader = new GitHubRestActivityReader({
      restApiVersion: "2026-03-10",
      fetcher,
      timeoutMilliseconds: 100,
    });
    const [commit] = await reader.listCommits(request);
    const [issue] = await reader.listIssues(request);
    const [pullRequest] = await reader.listPullRequests(request);
    const [release] = await reader.listReleases(request);
    const [workflow] = await reader.listWorkflowRuns(request);

    expect({
      github_object_id: commit!.githubObjectId,
      source_updated_at: commit!.sourceUpdatedAt,
      source_version: commit!.sourceVersion,
      message: commit!.message,
      authored_at: commit!.authoredAt,
      committed_at: commit!.committedAt,
      author_login: commit!.authorLogin,
    }).toEqual({
      github_object_id: "a".repeat(40),
      source_updated_at: "2026-05-02T02:00:00.000Z",
      source_version: "a".repeat(40),
      message: "Synthetic commit",
      authored_at: "2026-05-02T01:00:00.000Z",
      committed_at: "2026-05-02T02:00:00.000Z",
      author_login: "synthetic-author",
    });
    expect({
      github_object_id: issue!.githubObjectId,
      source_updated_at: issue!.sourceUpdatedAt,
      source_version: issue!.sourceVersion,
      issue_number: issue!.number,
      title: issue!.title,
      state: issue!.state,
      author_login: issue!.authorLogin,
      closed_at: issue!.closedAt,
    }).toEqual({
      github_object_id: "101",
      source_updated_at: "2026-05-03T03:00:00.000Z",
      source_version: "2026-05-03T03:00:00.000Z",
      issue_number: 11,
      title: "Synthetic issue",
      state: "open",
      author_login: "synthetic-author",
      closed_at: null,
    });
    expect({
      github_object_id: pullRequest!.githubObjectId,
      source_updated_at: pullRequest!.sourceUpdatedAt,
      source_version: pullRequest!.sourceVersion,
      pull_request_number: pullRequest!.number,
      title: pullRequest!.title,
      state: pullRequest!.state,
      is_draft: pullRequest!.isDraft,
      head_sha: pullRequest!.headSha,
      base_ref: pullRequest!.baseRef,
      merged_at: pullRequest!.mergedAt,
    }).toEqual({
      github_object_id: "201",
      source_updated_at: "2026-05-04T04:00:00.000Z",
      source_version: "b".repeat(40),
      pull_request_number: 21,
      title: "Synthetic pull request",
      state: "closed",
      is_draft: false,
      head_sha: "b".repeat(40),
      base_ref: "main",
      merged_at: "2026-05-04T05:00:00.000Z",
    });
    expect({
      github_object_id: release!.githubObjectId,
      source_updated_at: release!.sourceUpdatedAt,
      source_version: release!.sourceVersion,
      tag_name: release!.tagName,
      name: release!.name,
      is_draft: release!.isDraft,
      is_prerelease: release!.isPrerelease,
      published_at: release!.publishedAt,
    }).toEqual({
      github_object_id: "301",
      source_updated_at: "2026-05-05T06:00:00.000Z",
      source_version: "2026-05-05T06:00:00.000Z",
      tag_name: "v1.0.0",
      name: "Synthetic release",
      is_draft: false,
      is_prerelease: true,
      published_at: "2026-05-05T06:00:00.000Z",
    });
    expect({
      github_object_id: workflow!.githubObjectId,
      source_updated_at: workflow!.sourceUpdatedAt,
      source_version: workflow!.sourceVersion,
      workflow_id: workflow!.workflowId,
      run_number: workflow!.runNumber,
      status: workflow!.status,
      conclusion: workflow!.conclusion,
      event_name: workflow!.eventName,
      head_sha: workflow!.headSha,
    }).toEqual({
      github_object_id: "401",
      source_updated_at: "2026-05-06T06:00:00.000Z",
      source_version: `${"c".repeat(40)}:2:2026-05-06T06:00:00.000Z`,
      workflow_id: "9001",
      run_number: 31,
      status: "completed",
      conclusion: "success",
      event_name: "push",
      head_sha: "c".repeat(40),
    });
    expect(JSON.stringify([commit, issue, pullRequest, release, workflow])).not.toMatch(
      /token|authorization|rawResponse|sourceCode|diff/i,
    );
  });
});
