import "server-only";
import { createHash } from "node:crypto";
import type { ProjectRepositoryMetadataReader } from "@/application/synchronization/project-sync-use-cases";
import type { GitHubAuthorizedRepositoryGateway } from "@/domain/github-repository/authorized-github-repository";
export const githubProjectRepositoryMetadataReaderContract = "github-project-repository-metadata-reader.v1" as const;
export class GitHubProjectRepositoryMetadataReader implements ProjectRepositoryMetadataReader {
  constructor(private readonly gateway: GitHubAuthorizedRepositoryGateway) {}
  async read(input: Parameters<ProjectRepositoryMetadataReader["read"]>[0]) {
    const result = await this.gateway.listAllForInstallation(input.context.installation.installationId);
    const repository = result.repositories.find((candidate) => candidate.id === Number(input.context.repository.githubObjectId) && candidate.fullName === input.context.repository.fullName && candidate.ownerLogin === input.context.repository.owner && candidate.name === input.context.repository.name);
    if (!repository) throw new Error("github_activity_not_found");
    const sourceVersion = createHash("sha256").update(JSON.stringify({ defaultBranch: repository.defaultBranch, fullName: repository.fullName, id: repository.id, isArchived: repository.isArchived, isDisabled: repository.isDisabled, isFork: repository.isFork, isPrivate: repository.isPrivate, visibility: repository.visibility })).digest("hex");
    return { githubObjectId: String(repository.id), repositoryFullName: repository.fullName, sourceUpdatedAt: result.loadedAt, sourceVersion, defaultBranch: repository.defaultBranch, visibility: repository.visibility, isPrivate: repository.isPrivate, isFork: repository.isFork, isArchived: repository.isArchived, isDisabled: repository.isDisabled };
  }
}
