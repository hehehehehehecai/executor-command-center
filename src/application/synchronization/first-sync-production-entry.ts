import type { FirstSyncDispatchReceipt } from "@/application/synchronization/first-sync-use-cases";

export const firstSyncProductionEntryContract =
  "first-sync-production-entry.v1" as const;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface FirstSyncVerifiedSessionReader {
  getVerifiedUserId(): Promise<string | null>;
}

export interface FirstSyncProjectOwnershipReader {
  isOwnedBy(input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<boolean>;
}

export interface FirstSyncLaunchContextReader {
  getByProjectId(projectId: string): Promise<{
    readonly projectId: string;
    readonly installation: {
      readonly status: "active" | "suspended" | "revoked";
    };
  } | null>;
}

export interface FirstSyncStarter {
  execute(input: {
    readonly projectId: string;
    readonly requestId: string;
  }): Promise<FirstSyncDispatchReceipt>;
}

function parseInput(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("first_sync_invalid_request");
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2
    || typeof value.projectId !== "string"
    || !uuid.test(value.projectId)
    || typeof value.requestId !== "string"
    || !requestId.test(value.requestId)
  ) {
    throw new Error("first_sync_invalid_request");
  }
  return { projectId: value.projectId, requestId: value.requestId };
}

export class StartAuthenticatedFirstRepositorySync {
  constructor(private readonly dependencies: {
    readonly session: FirstSyncVerifiedSessionReader;
    readonly ownership: FirstSyncProjectOwnershipReader;
    readonly contexts: FirstSyncLaunchContextReader;
    readonly start: FirstSyncStarter;
  }) {}

  async execute(input: unknown): Promise<FirstSyncDispatchReceipt> {
    const command = parseInput(input);
    const userId = await this.dependencies.session.getVerifiedUserId();
    if (userId === null || !uuid.test(userId)) {
      throw new Error("first_sync_unauthenticated");
    }
    const owned = await this.dependencies.ownership.isOwnedBy({
      projectId: command.projectId,
      userId,
    });
    if (!owned) throw new Error("first_sync_project_not_found");
    const context = await this.dependencies.contexts.getByProjectId(command.projectId);
    if (context === null || context.projectId !== command.projectId) {
      throw new Error("first_sync_project_not_found");
    }
    if (context.installation.status !== "active") {
      throw new Error("first_sync_authorization_revoked");
    }
    return this.dependencies.start.execute(command);
  }
}
