import { describe, expect, it, vi } from "vitest";
import { ReadAuthenticatedProjectSyncStatus } from "./first-sync-production-entry";
import type { SyncRun } from "@/domain/synchronization/synchronization-state";
const projectId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222", runId = "33333333-3333-4333-8333-333333333333";
const at = "2026-09-30T08:00:00.000Z";
function fixture(run: Partial<SyncRun> | null = null) {
  const dependencies = {
    session: { getVerifiedUserId: vi.fn(async () => userId as string | null) },
    ownership: { isOwnedBy: vi.fn(async () => true) },
    contexts: { getByProjectId: vi.fn(async () => ({ projectId, installation: { status: "active" as "active" | "suspended" | "revoked" } })) },
    runs: { getLatest: vi.fn(async (): Promise<SyncRun | null> => run && ({ id: runId, projectId, idempotencyKey: "sync-request:first-onboarding", triggerSource: "first_sync", status: "queued", version: 1, queuedAt: at, startedAt: null, finishedAt: null, lastProgressAt: null, progressCursor: null, errorCode: null, errorSummary: null, createdAt: at, updatedAt: at, ...run })) },
  };
  return { dependencies, read: new ReadAuthenticatedProjectSyncStatus(dependencies) };
}
describe("T04 authoritative sync status", () => {
  it("reports no run without pretending the selected project has synchronized", async () => {
    const f = fixture();
    await expect(f.read.execute(projectId)).resolves.toEqual({ contractVersion: "project-onboarding-sync.v1", projectId, state: "not_started", syncRunId: null, queuedAt: null, finishedAt: null, retryRequestId: "onboarding" });
  });
  it.each(["queued", "running", "partial", "completed", "failed", "cancelled"] as const)("uses persisted %s, not the browser receipt", async status => {
    const f = fixture({ status, progressCursor: "retained-server-cursor", finishedAt: ["completed", "failed", "cancelled"].includes(status) ? at : null });
    const value = await f.read.execute(projectId);
    expect(value.state).toBe(status); expect(value.syncRunId).toBe(runId);
    expect(value).not.toHaveProperty("progressCursor"); expect(value).not.toHaveProperty("errorSummary");
    expect(value.retryRequestId).toBe(["partial", "failed", "cancelled"].includes(status) ? `retry-${runId}` : status === "queued" ? "onboarding" : null);
  });
  it("distinguishes a queued run without a durable provider cursor and keeps its request identity", async () => {
    const f = fixture({ idempotencyKey: "sync-request:first-recovery" });
    await expect(f.read.execute(projectId)).resolves.toMatchObject({ state: "dispatch_pending", retryRequestId: "recovery" });
  });
  it.each(["suspended", "revoked"] as const)("reports %s without exposing a run or starting work", async status => {
    const f = fixture({}); f.dependencies.contexts.getByProjectId.mockResolvedValue({ projectId, installation: { status } });
    await expect(f.read.execute(projectId)).resolves.toMatchObject({ state: status, syncRunId: null, retryRequestId: null }); expect(f.dependencies.runs.getLatest).not.toHaveBeenCalled();
  });
  it("rejects a foreign or archived project before service-level reads", async () => {
    const f = fixture({}); f.dependencies.ownership.isOwnedBy.mockResolvedValue(false);
    await expect(f.read.execute(projectId)).rejects.toThrow("first_sync_project_not_found"); expect(f.dependencies.runs.getLatest).not.toHaveBeenCalled();
  });
  it("requires verified identity", async () => {
    const f = fixture(); f.dependencies.session.getVerifiedUserId.mockResolvedValue(null);
    await expect(f.read.execute(projectId)).rejects.toThrow("first_sync_unauthenticated"); expect(f.dependencies.runs.getLatest).not.toHaveBeenCalled();
  });
  it("drops run facts when authorization is revoked during the read", async () => {
    const f = fixture({ status: "completed" });
    f.dependencies.contexts.getByProjectId.mockResolvedValueOnce({ projectId, installation: { status: "active" } }).mockResolvedValue({ projectId, installation: { status: "revoked" } });
    await expect(f.read.execute(projectId)).resolves.toMatchObject({ state: "revoked", syncRunId: null });
  });
  it("does not return a stale result when project ownership vanishes during the read", async () => {
    const f = fixture({}); f.dependencies.ownership.isOwnedBy.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.read.execute(projectId)).rejects.toThrow("first_sync_project_not_found");
  });
});
