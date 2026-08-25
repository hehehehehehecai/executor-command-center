import { describe, expect, it, vi } from "vitest";

import type { RepositoryRemovalResult } from "@/domain/repository-removal/repository-removal";
import { RemoveRepositoryData } from "./repository-removal-use-case";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

function completedResult(): RepositoryRemovalResult {
  return {
    operationId: "44444444-4444-4444-8444-444444444444",
    projectId,
    mode: "REMOVE_REPOSITORY_DATA",
    status: "completed",
    outcome: "executed",
    counts: {
      deleted: { github_commits: 2 },
      preserved: { projects: 1 },
      invalidated: { evidence_links: 3 },
    },
    safelyRetryable: true,
    completedAt: "2026-08-24T09:00:00.000Z",
  };
}

describe("RemoveRepositoryData", () => {
  it("uses the verified session actor and passes one parsed command to the port", async () => {
    const execute = vi.fn(async () => completedResult());
    const useCase = new RemoveRepositoryData({
      sessionReader: { getVerifiedUserId: async () => userId },
      repository: { execute },
    });

    await expect(
      useCase.execute({
        projectId,
        mode: "REMOVE_REPOSITORY_DATA",
        idempotencyKey: "phase6-removal:request-1",
        confirmation: { projectId, text: `REMOVE ${projectId}` },
      }),
    ).resolves.toEqual(completedResult());

    expect(execute).toHaveBeenCalledWith({
      actorUserId: userId,
      command: {
        projectId,
        mode: "REMOVE_REPOSITORY_DATA",
        idempotencyKey: "phase6-removal:request-1",
        confirmation: { projectId, text: `REMOVE ${projectId}` },
      },
    });
  });

  it("fails before storage when the session is not verified", async () => {
    const execute = vi.fn();
    const useCase = new RemoveRepositoryData({
      sessionReader: { getVerifiedUserId: async () => null },
      repository: { execute },
    });

    await expect(
      useCase.execute({
        projectId,
        mode: "REMOVE_REPOSITORY_DATA",
        idempotencyKey: "phase6-removal:request-2",
        confirmation: { projectId, text: `REMOVE ${projectId}` },
      }),
    ).rejects.toThrow("repository_removal_unauthenticated");
    expect(execute).not.toHaveBeenCalled();
  });
});
