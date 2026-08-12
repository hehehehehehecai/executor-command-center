import { describe, expect, it, vi } from "vitest";
import { WebhookSynchronizationRuntime, webhookSynchronizationRuntimeContract } from "./webhook-sync-use-cases";
import type { ProjectSynchronizationResult } from "./project-sync-use-cases";
import type { SyncRequestReceipt } from "./reconciliation-use-cases";
const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const deliveryId = "33333333-3333-4333-8333-333333333333";
const at = "2026-08-07T02:00:00.000Z";
const event = { version: "github-webhook-event.v1", eventId: `github-webhook:${deliveryId}`, idempotencyKey: `github-webhook:${deliveryId}`, deliveryId, bodySha256: "a".repeat(64), eventName: "issues", kind: "github.issue.v1", action: "opened", projectId, installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", githubObjectId: "101", receivedAt: at, processingVersion: 2 } as const;
const pushEvent = { ...event, eventName: "push", kind: "github.push.v1", action: null, githubObjectId: "c".repeat(40) } as const;
const completed: ProjectSynchronizationResult = { syncRunId: runId, status: "completed", groups: [], errorCode: null, retryable: false, authorizationRevoked: false, replayed: false };
function fixture(status: "dispatched" | "processing" | "completed" = "dispatched") {
  const deliveries = { register: vi.fn(async () => ({ outcome: "duplicate" as const, status, version: status === "dispatched" ? 3 : 4, projectId })), claimDispatch: vi.fn(), completeDispatch: vi.fn(), completeInstallation: vi.fn(), claimProcessing: vi.fn(async () => ({ claimed: true, status: "processing" as const, version: 4 })), completeProcessing: vi.fn(async () => ({ outcome: "completed" as const, status: "completed" as const, version: 5 })), failProcessing: vi.fn(async () => ({ outcome: "failed" as const, status: "failed" as const, version: 5 })) };
  const requests = { request: vi.fn(async (): Promise<SyncRequestReceipt> => ({ outcome: "new", projectId, syncRunId: runId, syncRunStatus: "queued", dispatchState: "pending", dispatchVersion: 1 })), claimDispatch: vi.fn(async () => ({ claimed: true, version: 2 })), completeDispatch: vi.fn(async () => undefined) };
  const dispatcher = { dispatch: vi.fn(async () => ({ providerJobId: "provider-job-001" })) };
  const executor = { execute: vi.fn(async () => completed) };
  return { runtime: new WebhookSynchronizationRuntime({ requests, deliveries, dispatcher, executor, clock: { now: () => new Date(at) } }), deliveries, requests, dispatcher, executor };
}
describe("github-webhook-synchronization-runtime.v1", () => {
  it("creates a durable webhook run, claims delivery and dispatches stable project job", async () => { const f = fixture(); await expect(f.runtime.request(event)).resolves.toEqual({ outcome: "accepted", syncRunId: runId, providerJobId: "provider-job-001" }); expect(webhookSynchronizationRuntimeContract).toBe("github-webhook-synchronization-runtime.v1"); expect(f.requests.request).toHaveBeenCalledWith(expect.objectContaining({ triggerSource: "webhook", requestIdentity: `webhook:${deliveryId}` })); expect(f.deliveries.claimProcessing).toHaveBeenCalledWith(expect.objectContaining({ deliveryId, syncRunId: runId, expectedVersion: 3 })); expect(f.dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ triggerSource: "webhook", webhookDelivery: expect.objectContaining({ deliveryId, processingVersion: 4 }) })); });
  it("dispatches the trusted Push after SHA and emits null for non-Push lineage", async () => {
    const push = fixture();
    await push.runtime.request(pushEvent);
    expect(push.dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ webhookDelivery: expect.objectContaining({ kind: "github.push.v1", eventName: "push", pushAfterSha: "c".repeat(40) }) }));
    const issue = fixture();
    await issue.runtime.request(event);
    expect(issue.dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ webhookDelivery: expect.objectContaining({ kind: "github.issue.v1", eventName: "issues", pushAfterSha: null }) }));
  });
  it("rejects inconsistent eventName and kind before creating a durable sync request", async () => {
    const f = fixture();
    await expect(f.runtime.request({ ...event, kind: "github.push.v1" })).rejects.toThrow("github_webhook_event_invalid");
    expect(f.requests.request).not.toHaveBeenCalled();
    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("makes completed delivery replay a no-op", async () => { const f = fixture("completed"); await expect(f.runtime.request(event)).resolves.toMatchObject({ outcome: "duplicate" }); expect(f.requests.request).not.toHaveBeenCalled(); expect(f.dispatcher.dispatch).not.toHaveBeenCalled(); });
  it("keeps a coalesced dispatched delivery retryable instead of silently completing its Inngest step", async () => {
    const f = fixture();
    f.requests.request.mockResolvedValue({
      outcome: "coalesced",
      projectId,
      syncRunId: runId,
      syncRunStatus: "running",
      dispatchState: "dispatched",
      dispatchVersion: 3,
    });

    await expect(f.runtime.request({
      ...event,
      eventName: "release",
      kind: "github.release.v1",
      action: "published",
      githubObjectId: "369085554",
    })).rejects.toThrow("github_webhook_sync_coalesced");
    expect(f.deliveries.claimProcessing).not.toHaveBeenCalled();
    expect(f.dispatcher.dispatch).not.toHaveBeenCalled();
  });
  it("claims and dispatches exactly once when a coalesced delivery is retried after the active run finishes", async () => {
    const f = fixture();
    f.requests.request
      .mockResolvedValueOnce({
        outcome: "coalesced",
        projectId,
        syncRunId: "44444444-4444-4444-8444-444444444444",
        syncRunStatus: "running",
        dispatchState: "dispatched",
        dispatchVersion: 3,
      })
      .mockResolvedValueOnce({
        outcome: "new",
        projectId,
        syncRunId: runId,
        syncRunStatus: "queued",
        dispatchState: "pending",
        dispatchVersion: 1,
      });
    const release = {
      ...event,
      eventName: "release",
      kind: "github.release.v1",
      action: "published",
      githubObjectId: "369085554",
    } as const;

    await expect(f.runtime.request(release)).rejects.toThrow("github_webhook_sync_coalesced");
    await expect(f.runtime.request(release)).resolves.toEqual({
      outcome: "accepted",
      syncRunId: runId,
      providerJobId: "provider-job-001",
    });
    expect(f.requests.request).toHaveBeenCalledTimes(2);
    expect(f.deliveries.claimProcessing).toHaveBeenCalledTimes(1);
    expect(f.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });
  it("completes delivery only after project SyncRun succeeds", async () => { const f = fixture("processing"); const job = { version: "background-job.v1", jobType: "project.sync.requested.v1", jobId: runId, projectId, syncRunId: runId, idempotencyKey: `sync-request:webhook:${deliveryId}`, correlationId: `sync:${runId}`, requestedAt: at, triggerSource: "webhook", webhookDelivery: { deliveryId, bodySha256: "a".repeat(64), eventName: "issues", action: "opened", installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", internalEventId: `github-webhook:${deliveryId}`, processingVersion: 4 } }; await expect(f.runtime.execute({ job })).resolves.toEqual(completed); expect(f.deliveries.completeProcessing).toHaveBeenCalledWith(expect.objectContaining({ deliveryId, syncRunId: runId, expectedVersion: 4 })); });
  it("records allowlisted retryable failure and rethrows safe code", async () => { const f = fixture("processing"); f.executor.execute.mockResolvedValue({ ...completed, status: "partial", errorCode: "github_activity_timeout", retryable: true }); const job = { version: "background-job.v1", jobType: "project.sync.requested.v1", jobId: runId, projectId, syncRunId: runId, idempotencyKey: `sync-request:webhook:${deliveryId}`, correlationId: `sync:${runId}`, requestedAt: at, triggerSource: "webhook", webhookDelivery: { deliveryId, bodySha256: "a".repeat(64), eventName: "issues", action: "opened", installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", internalEventId: `github-webhook:${deliveryId}`, processingVersion: 4 } }; await expect(f.runtime.execute({ job })).rejects.toThrow("github_activity_timeout"); expect(f.deliveries.failProcessing).toHaveBeenCalledWith(expect.objectContaining({ safeErrorCode: "github_activity_timeout" })); });
  it("does not complete a Push delivery when the target commit is missing", async () => {
    const f = fixture("processing");
    f.executor.execute.mockResolvedValue({ ...completed, status: "partial", errorCode: "github_activity_not_found", retryable: false });
    const job = { version: "background-job.v1", jobType: "project.sync.requested.v1", jobId: runId, projectId, syncRunId: runId, idempotencyKey: `sync-request:webhook:${deliveryId}`, correlationId: `sync:${runId}`, requestedAt: at, triggerSource: "webhook", webhookDelivery: { deliveryId, bodySha256: "a".repeat(64), eventName: "push", action: null, installationId: 81_001, repositoryId: 91_001, repositoryFullName: "synthetic/repository", internalEventId: `github-webhook:${deliveryId}`, processingVersion: 4, kind: "github.push.v1", pushAfterSha: "c".repeat(40) } };
    await expect(f.runtime.execute({ job })).resolves.toMatchObject({ status: "partial", errorCode: "github_activity_not_found" });
    expect(f.deliveries.completeProcessing).not.toHaveBeenCalled();
    expect(f.deliveries.failProcessing).toHaveBeenCalledWith(expect.objectContaining({ safeErrorCode: "github_webhook_processing_failed" }));
  });
});
