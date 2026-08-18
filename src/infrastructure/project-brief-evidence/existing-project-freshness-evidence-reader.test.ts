import { describe, expect, it } from "vitest";
import { freshnessStatusContract } from "@/domain/synchronization/synchronization-state";
import { ExistingProjectFreshnessEvidenceReader } from "./existing-project-freshness-evidence-reader";

const userId = "e3000000-0000-4000-8000-000000000005";
const projectId = "e3100000-0000-4000-8000-000000000005";
const now = "2026-08-08T12:00:00.000Z";

describe("ExistingProjectFreshnessEvidenceReader", () => {
  it("reuses the existing real freshness input and binds a stable source reference", async () => {
    const reader = new ExistingProjectFreshnessEvidenceReader({
      read: async () => ({
        projectId,
        input: {
          provenance: "real",
          authorizationRevoked: false,
          latestRun: {
            id: "e3200000-0000-4000-8000-000000000005",
            status: "completed",
            finishedAt: "2026-08-08T11:00:00.000Z",
            errorCode: null,
          },
          lastSuccessfulAt: "2026-08-08T11:00:00.000Z",
          coverageComplete: true,
          now,
        },
      }),
    });

    await expect(reader.read({ userId, projectId, now })).resolves.toEqual({
      userId,
      projectId,
      sourceId: "e3200000-0000-4000-8000-000000000005",
      sourceUpdatedAt: "2026-08-08T11:00:00.000Z",
      sourceVersion: freshnessStatusContract,
      input: expect.objectContaining({ provenance: "real", now }),
    });
  });

  it("returns null without inventing freshness when the existing reader has no project", async () => {
    const reader = new ExistingProjectFreshnessEvidenceReader({ read: async () => null });
    await expect(reader.read({ userId, projectId, now })).resolves.toBeNull();
  });
});
