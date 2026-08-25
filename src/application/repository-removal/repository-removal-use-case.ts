import type {
  RepositoryRemovalCommand,
  RepositoryRemovalResult,
} from "@/domain/repository-removal/repository-removal";
import { parseRepositoryRemovalCommand } from "@/domain/repository-removal/repository-removal";

export interface RepositoryRemovalSessionReader {
  getVerifiedUserId(): Promise<string | null>;
}

export interface RepositoryRemovalRepository {
  execute(input: {
    actorUserId: string;
    command: RepositoryRemovalCommand;
  }): Promise<RepositoryRemovalResult>;
}

export class RemoveRepositoryData {
  constructor(
    private readonly dependencies: {
      sessionReader: RepositoryRemovalSessionReader;
      repository: RepositoryRemovalRepository;
    },
  ) {}

  async execute(input: unknown): Promise<RepositoryRemovalResult> {
    const actorUserId = await this.dependencies.sessionReader.getVerifiedUserId();
    if (!actorUserId) {
      throw new Error("repository_removal_unauthenticated");
    }

    return this.dependencies.repository.execute({
      actorUserId,
      command: parseRepositoryRemovalCommand(input),
    });
  }
}
