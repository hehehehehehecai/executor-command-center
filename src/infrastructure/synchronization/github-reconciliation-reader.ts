import "server-only";

import { createHash } from "node:crypto";

import type { GitHubActivityReader } from "@/application/github-activity/github-activity-reader";
import type {
  FirstSyncInstallationTokenProvider,
} from "@/application/synchronization/first-sync-use-cases";
import type {
  ReconciliationProject,
  RepositoryReconciliationReader,
} from "@/application/synchronization/reconciliation-use-cases";
import type {
  GitHubAuthorizedRepositoryGateway,
} from "@/domain/github-repository/authorized-github-repository";
import type { RepositoryVersionFacts } from "@/domain/synchronization/reconciliation";

const unitSeparator = String.fromCharCode(31);
const recordSeparator = String.fromCharCode(30);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function collectionDigest(items: readonly {
  readonly githubObjectId: string;
  readonly sourceVersion: string;
}[]): string {
  const versions = new Map<string, string>();
  for (const item of items) {
    const existing = versions.get(item.githubObjectId);
    if (existing !== undefined && existing !== item.sourceVersion) {
      throw new Error("github_activity_invalid_response");
    }
    versions.set(item.githubObjectId, item.sourceVersion);
  }
  return sha256([...versions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, version]) => `${id}${unitSeparator}${version}`)
    .join(recordSeparator));
}

export class GitHubReconciliationReader implements RepositoryReconciliationReader {
  constructor(private readonly dependencies: {
    readonly tokens: FirstSyncInstallationTokenProvider;
    readonly repositoryGateway: GitHubAuthorizedRepositoryGateway;
    readonly activityReader: GitHubActivityReader;
  }) {}

  async readMinimalFacts(
    project: ReconciliationProject,
    input: { readonly snapshotSince: string; readonly signal?: AbortSignal },
  ): Promise<RepositoryVersionFacts> {
    if (
      !project.mappingComplete || project.installationStatus !== "active"
      || project.installationId === null || project.repositoryId === null
      || project.repositoryOwner === null || project.repositoryName === null
      || project.repositoryFullName === null
    ) {
      throw new Error("reconciliation_project_invalid");
    }
    const repositories = await this.dependencies.repositoryGateway
      .listAllForInstallation(project.installationId);
    const repository = repositories.repositories.find((candidate) =>
      candidate.id === project.repositoryId
      && candidate.fullName === project.repositoryFullName
      && candidate.ownerLogin === project.repositoryOwner
      && candidate.name === project.repositoryName
    );
    if (!repository) throw new Error("reconciliation_repository_not_found");

    const token = await this.dependencies.tokens.issue({
      installationId: project.installationId,
      signal: input.signal,
    });
    const request = {
      repository: { owner: project.repositoryOwner, name: project.repositoryName },
      installationToken: token.token,
      since: input.snapshotSince,
      pagination: { maxPages: 100, maxObjects: 10_000 },
      signal: input.signal,
    };
    const [commits, issues, pullRequests, releases, workflowRuns] = await Promise.all([
      this.dependencies.activityReader.listCommits(request),
      this.dependencies.activityReader.listIssues(request),
      this.dependencies.activityReader.listPullRequests(request),
      this.dependencies.activityReader.listReleases(request),
      this.dependencies.activityReader.listWorkflowRuns(request),
    ]);
    const repositoryFact = [
      repository.id,
      repository.fullName,
      repository.defaultBranch,
      repository.visibility,
      repository.isPrivate,
      repository.isFork,
      repository.isArchived,
      repository.isDisabled,
    ].join(unitSeparator);
    return {
      repository: sha256(repositoryFact),
      commit: collectionDigest(commits),
      issue: collectionDigest(issues),
      pull_request: collectionDigest(pullRequests),
      release: collectionDigest(releases),
      workflow_run: collectionDigest(workflowRuns),
    };
  }
}
