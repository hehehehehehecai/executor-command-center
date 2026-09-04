import { describe, expect, it, vi } from "vitest";

import type { GitHubActivityReader } from "@/application/github-activity/github-activity-reader";
import type { FirstSyncInstallationTokenProvider } from "@/application/synchronization/first-sync-use-cases";

import { GitHubReconciliationReader } from "./github-reconciliation-reader";

const project = {
  projectId: "11111111-1111-4111-8111-111111111111",
  selectedRepositoryId: "22222222-2222-4222-8222-222222222222",
  installationId: 81_001,
  installationStatus: "active" as const,
  repositoryId: 91_001,
  repositoryOwner: "owner",
  repositoryName: "repo",
  repositoryFullName: "owner/repo",
  mappingComplete: true,
  localFacts: {
    repository: "a".repeat(64), commit: "b".repeat(64), issue: "c".repeat(64),
    pull_request: "d".repeat(64), release: "e".repeat(64), workflow_run: "f".repeat(64),
  },
};
const common = { repositoryFullName: "owner/repo", sourceUpdatedAt: "2026-08-05T00:00:00.000Z" };

function setup() {
  const tokens: FirstSyncInstallationTokenProvider = {
    issue: vi.fn(async () => ({ token: "synthetic-ephemeral", expiresAt: "2026-08-06T04:00:00.000Z" })),
  };
  const repositoryGateway = {
    listAllForInstallation: vi.fn(async () => ({
      repositorySelection: "selected" as const,
      totalCount: 1,
      repositories: [{
        id: 91_001, name: "repo", fullName: "owner/repo", ownerLogin: "owner",
        isPrivate: true, isFork: false, isArchived: false, isDisabled: false,
        visibility: "private" as const, defaultBranch: "main",
      }],
      loadedAt: "2026-08-06T03:00:00.000Z",
    })),
  };
  const activityReader: GitHubActivityReader = {
    listCommits: vi.fn(async () => [{ ...common, objectType: "commit" as const, githubObjectId: "c1", sourceVersion: "v1", message: "m", authoredAt: null, committedAt: common.sourceUpdatedAt, authorLogin: null }]),
    listIssues: vi.fn(async () => [{ ...common, objectType: "issue" as const, githubObjectId: "i1", sourceVersion: "v2", number: 1, title: "i", state: "open" as const, authorLogin: null, closedAt: null }]),
    listPullRequests: vi.fn(async () => [{ ...common, objectType: "pull_request" as const, githubObjectId: "p1", sourceVersion: "v3", number: 1, title: "p", state: "open" as const, isDraft: false, headSha: "a".repeat(40), baseRef: "main", mergedAt: null }]),
    listReleases: vi.fn(async () => [{ ...common, objectType: "release" as const, githubObjectId: "r1", sourceVersion: "v4", tagName: "v1", name: null, isDraft: false, isPrerelease: false, publishedAt: common.sourceUpdatedAt }]),
    listWorkflowRuns: vi.fn(async () => [{ ...common, objectType: "workflow_run" as const, githubObjectId: "w1", sourceVersion: "v5", workflowId: "1", runNumber: 1, status: "completed" as const, conclusion: "success" as const, eventName: "push", headSha: "b".repeat(40), runAttempt: 1 }]),
    listChecks: vi.fn(async () => []),
  };
  return {
    tokens, repositoryGateway, activityReader,
    reader: new GitHubReconciliationReader({ tokens, repositoryGateway, activityReader }),
  };
}

describe("repository-reconciliation.v1 GitHub adapter", () => {
  it("reads repository metadata and five typed activity groups into deterministic digests", async () => {
    const fixture = setup();
    await expect(fixture.reader.readMinimalFacts(project, {
      snapshotSince: "2026-05-09T00:00:00.000Z",
    })).resolves.toEqual({
      repository: "68652e3c885841ae9b5a8046bcc4efebcc8850de1fb552efbfd58dd921a99578",
      commit: "0ffadfe1c4b8349a86d810699e30719a252ac88b00324f3511448740599a8e3d",
      issue: "ce90b2aa27d29be01968671a8b5869f7adbaddb93d3a9c2a7bde4a7c8157b158",
      pull_request: "66e68c7ae5b530db3301eade714e5c18eac4519e5fd8609fb6120affc6647291",
      release: "b5fa57759fde303a0332020d853702a874d4d702b6414b3cb80ba6a35215ebd7",
      workflow_run: "9942a395fbaf32f1af5f6a375e3fa1993602292dc9ed3a32abb57981a6b36748",
    });
    expect(fixture.repositoryGateway.listAllForInstallation).toHaveBeenCalledTimes(1);
    expect(fixture.tokens.issue).toHaveBeenCalledTimes(1);
    expect(fixture.activityReader.listCommits).toHaveBeenCalledWith(expect.objectContaining({
      since: "2026-05-09T00:00:00.000Z",
      pagination: { maxPages: 100, maxObjects: 10_000 },
    }));
    expect(fixture.activityReader.listChecks).not.toHaveBeenCalled();
  });

  it("rejects repository identity mismatch before activity reads", async () => {
    const fixture = setup();
    vi.mocked(fixture.repositoryGateway.listAllForInstallation).mockResolvedValue({
      repositorySelection: "selected", totalCount: 0, repositories: [], loadedAt: "2026-08-06T03:00:00.000Z",
    });
    await expect(fixture.reader.readMinimalFacts(project, {
      snapshotSince: "2026-05-09T00:00:00.000Z",
    })).rejects.toThrow("reconciliation_repository_not_found");
    expect(fixture.tokens.issue).not.toHaveBeenCalled();
    expect(fixture.activityReader.listCommits).not.toHaveBeenCalled();
  });
});
