import { describe, expect, it, vi } from "vitest";

import type { JobDispatcher } from "@/application/jobs/job-dispatcher";
import { IngestGitHubWebhook } from "@/application/webhooks/ingest-github-webhook";
import type { RepositoryVersionFacts } from "@/domain/synchronization/reconciliation";

import {
  ManualRepositoryResync,
  ProjectSyncRequestCoordinator,
  RunDailyRepositoryReconciliation,
  type ReconciliationProject,
  type ReconciliationProjectReader,
  type RepositoryReconciliationReader,
  type SyncRequestReceipt,
  type SyncRequestStore,
} from "./reconciliation-use-cases";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectA = "11111111-1111-4111-8111-111111111111";
const projectB = "22222222-2222-4222-8222-222222222222";
const runA = "33333333-3333-4333-8333-333333333333";
const scheduledAt = "2026-08-06T03:00:00.000Z";
const digest = (value: string) => value.repeat(64);
const facts: RepositoryVersionFacts = {
  repository: digest("a"),
  commit: digest("b"),
  issue: digest("c"),
  pull_request: digest("d"),
  release: digest("e"),
  workflow_run: digest("f"),
};

function project(input: Partial<ReconciliationProject> = {}): ReconciliationProject {
  return {
    projectId: projectA,
    selectedRepositoryId: "44444444-4444-4444-8444-444444444444",
    installationId: 81_001,
    installationStatus: "active",
    repositoryId: 91_001,
    repositoryOwner: "synthetic-owner",
    repositoryName: "synthetic-repository",
    repositoryFullName: "synthetic-owner/synthetic-repository",
    mappingComplete: true,
    localFacts: facts,
    ...input,
  };
}

function setup(input: {
  projects?: ReconciliationProject[];
  remote?: RepositoryVersionFacts;
  requestOutcome?: "new" | "coalesced" | "duplicate" | "authorization_revoked" | "suspended" | "forbidden" | "not_found";
  dispatchState?: "pending" | "dispatching" | "dispatched" | null;
  authenticatedUserId?: string | null;
} = {}) {
  const projects: ReconciliationProjectReader = {
    listEligible: vi.fn(async () => input.projects ?? [project()]),
  };
  const reader: RepositoryReconciliationReader = {
    readMinimalFacts: vi.fn(async () => input.remote ?? facts),
  };
  const store: SyncRequestStore = {
    request: vi.fn(async (): Promise<SyncRequestReceipt> => ({
      outcome: input.requestOutcome ?? "new",
      projectId: projectA,
      syncRunId: ["authorization_revoked", "suspended", "forbidden", "not_found"].includes(input.requestOutcome ?? "") ? null : runA,
      syncRunStatus: input.requestOutcome === "coalesced" ? "running" : "queued",
      dispatchState: input.dispatchState === undefined ? "pending" : input.dispatchState,
      dispatchVersion: input.dispatchState === null ? null : 1,
    })),
    claimDispatch: vi.fn(async () => ({ claimed: true, version: 2 })),
    completeDispatch: vi.fn(async () => undefined),
  };
  const dispatcher: JobDispatcher = {
    dispatch: vi.fn(async () => ({ providerJobId: "provider-phase7-001" })),
  };
  const coordinator = new ProjectSyncRequestCoordinator({ store, dispatcher });
  const daily = new RunDailyRepositoryReconciliation({ projects, reader, coordinator });
  const manual = new ManualRepositoryResync({
    session: { getVerifiedUserId: vi.fn(async () => input.authenticatedUserId === undefined ? userA : input.authenticatedUserId) },
    coordinator,
  });
  return { projects, reader, store, dispatcher, coordinator, daily, manual };
}

describe("RunDailyRepositoryReconciliation", () => {
  it("returns no_difference without creating a SyncRun or job", async () => {
    const fixture = setup();
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      window: { requestIdentity: "reconciliation:2026-08-06" },
      projects: [{ projectId: projectA, decision: "no_difference", changedGroups: [] }],
    });
    expect(fixture.store.request).not.toHaveBeenCalled();
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches one stable project sync for repository metadata difference", async () => {
    const fixture = setup({ remote: { ...facts, repository: digest("0") } });
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [{ decision: "difference", changedGroups: ["repository"], syncResult: "accepted", syncRunId: runA }],
    });
    expect(fixture.store.request).toHaveBeenCalledWith({
      projectId: projectA,
      triggerSource: "reconciliation",
      requestIdentity: "reconciliation:2026-08-06",
      actorUserId: null,
      requestedAt: scheduledAt,
    });
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledWith({
      version: "background-job.v1",
      jobType: "project.sync.requested.v1",
      jobId: runA,
      projectId: projectA,
      syncRunId: runA,
      idempotencyKey: "sync-request:reconciliation:2026-08-06",
      correlationId: `sync:${runA}`,
      requestedAt: scheduledAt,
    });
  });

  it("detects a missed issue webhook and requests repair", async () => {
    const fixture = setup({ remote: { ...facts, issue: digest("1") } });
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [{ decision: "difference", changedGroups: ["issue"], syncResult: "accepted" }],
    });
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(["queued", "running"] as const)("coalesces an existing %s run", async (status) => {
    const fixture = setup({
      remote: { ...facts, commit: digest("0") },
      requestOutcome: "coalesced",
      dispatchState: null,
    });
    vi.mocked(fixture.store.request).mockResolvedValue({
      outcome: "coalesced", projectId: projectA, syncRunId: runA,
      syncRunStatus: status, dispatchState: null, dispatchVersion: null,
    });
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [{ decision: "difference", syncResult: "coalesced", syncRunId: runA }],
    });
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked", "authorization_revoked"],
    ["suspended", "blocked"],
  ] as const)("blocks %s installation before reader and dispatch", async (installationStatus, decision) => {
    const fixture = setup({ projects: [project({ installationStatus })] });
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [{ decision }],
    });
    expect(fixture.reader.readMinimalFacts).not.toHaveBeenCalled();
    expect(fixture.store.request).not.toHaveBeenCalled();
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("isolates remote read failure from sync mutation", async () => {
    const fixture = setup();
    vi.mocked(fixture.reader.readMinimalFacts).mockRejectedValue(new Error("github_activity_unavailable"));
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [{ decision: "failed", code: "github_activity_unavailable" }],
    });
    expect(fixture.store.request).not.toHaveBeenCalled();
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("keeps the same GitHub object digest isolated across Projects", async () => {
    const fixture = setup({ projects: [project(), project({ projectId: projectB })] });
    await expect(fixture.daily.execute({ scheduledAt })).resolves.toMatchObject({
      projects: [
        { projectId: projectA, decision: "no_difference" },
        { projectId: projectB, decision: "no_difference" },
      ],
    });
    expect(fixture.reader.readMinimalFacts).toHaveBeenCalledTimes(2);
  });
});

describe("ManualRepositoryResync", () => {
  it("dispatches one stable sync for an authenticated owner", async () => {
    const fixture = setup();
    await expect(fixture.manual.execute({
      projectId: projectA,
      requestId: "manual-request-001",
      requestedAt: scheduledAt,
    })).resolves.toEqual({
      result: "accepted",
      code: "manual_resync_accepted",
      syncRunId: runA,
      providerJobId: "provider-phase7-001",
    });
    expect(fixture.store.request).toHaveBeenCalledWith({
      projectId: projectA,
      triggerSource: "manual",
      requestIdentity: "manual:manual-request-001",
      actorUserId: userA,
      requestedAt: scheduledAt,
    });
  });

  it("rejects a missing session before database mutation", async () => {
    const fixture = setup({ authenticatedUserId: null });
    await expect(fixture.manual.execute({
      projectId: projectA,
      requestId: "manual-request-001",
      requestedAt: scheduledAt,
    })).resolves.toEqual({ result: "rejected", code: "manual_resync_unauthenticated", syncRunId: null, providerJobId: null });
    expect(fixture.store.request).not.toHaveBeenCalled();
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("returns forbidden for another user's Project with zero dispatch", async () => {
    const fixture = setup({ requestOutcome: "forbidden", dispatchState: null });
    await expect(fixture.manual.execute({
      projectId: projectB,
      requestId: "manual-request-002",
      requestedAt: scheduledAt,
    })).resolves.toEqual({ result: "forbidden", code: "manual_resync_forbidden", syncRunId: null, providerJobId: null });
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("rejects malformed input before session, database and dispatch", async () => {
    const fixture = setup();
    await expect(fixture.manual.execute({
      projectId: "not-a-uuid",
      requestId: " bad ",
      requestedAt: scheduledAt,
    })).resolves.toEqual({ result: "rejected", code: "manual_resync_invalid_request", syncRunId: null, providerJobId: null });
    expect(fixture.store.request).not.toHaveBeenCalled();
    expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it("coalesces manual and reconciliation on the same active run", async () => {
    const fixture = setup({ remote: { ...facts, release: digest("0") } });
    await fixture.daily.execute({ scheduledAt });
    vi.mocked(fixture.store.request).mockResolvedValue({
      outcome: "coalesced", projectId: projectA, syncRunId: runA,
      syncRunStatus: "queued", dispatchState: "dispatched", dispatchVersion: 3,
    });
    await expect(fixture.manual.execute({
      projectId: projectA,
      requestId: "manual-request-003",
      requestedAt: scheduledAt,
    })).resolves.toMatchObject({ result: "coalesced", syncRunId: runA });
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
  });

  it("recovers a missing dispatch receipt with the same stable BackgroundJob", async () => {
    const fixture = setup();
    vi.mocked(fixture.dispatcher.dispatch)
      .mockRejectedValueOnce(new Error("transport"))
      .mockResolvedValueOnce({ providerJobId: "provider-phase7-recovered" });
    const input = {
      projectId: projectA,
      triggerSource: "manual" as const,
      requestIdentity: "manual:crash-replay-001",
      actorUserId: userA,
      requestedAt: scheduledAt,
    };
    await expect(fixture.coordinator.execute(input)).rejects.toThrow("sync_dispatch_failed");
    vi.mocked(fixture.store.request).mockResolvedValue({
      outcome: "duplicate", projectId: projectA, syncRunId: runA,
      syncRunStatus: "queued", dispatchState: "dispatching", dispatchVersion: 2,
    });
    vi.mocked(fixture.store.claimDispatch).mockResolvedValue({ claimed: true, version: 3 });
    await expect(fixture.coordinator.execute(input)).resolves.toMatchObject({
      result: "accepted", syncRunId: runA, providerJobId: "provider-phase7-recovered",
    });
    const [firstJob, recoveredJob] = vi.mocked(fixture.dispatcher.dispatch).mock.calls.map(([job]) => job);
    expect(recoveredJob).toEqual(firstJob);
  });

  it("keeps a concurrent object Webhook distinct from the single Project SyncRun", async () => {
    const fixture = setup();
    const webhookDispatcher = { dispatch: vi.fn(async () => ({ providerReceiptId: "provider-webhook-001" })) };
    const webhook = new IngestGitHubWebhook({
      cryptography: { verify: () => ({ valid: true, bodySha256: "a".repeat(64) }) },
      repository: {
        register: vi.fn(async () => ({ outcome: "new" as const, status: "pending" as const, version: 1, projectId: projectA })),
        claimDispatch: vi.fn(async () => ({ claimed: true, version: 2 })),
        completeDispatch: vi.fn(async () => undefined),
        completeInstallation: vi.fn(async () => undefined),
      },
      dispatcher: webhookDispatcher,
    });
    const webhookDelivery = "55555555-5555-4555-8555-555555555555";
    const [manualResult, webhookResult] = await Promise.all([
      fixture.manual.execute({ projectId: projectA, requestId: "manual-request-004", requestedAt: scheduledAt }),
      webhook.execute({
        body: new TextEncoder().encode(JSON.stringify({
          action: "opened",
          installation: { id: 81_001 },
          repository: { id: 91_001, full_name: "synthetic-owner/synthetic-repository" },
          issue: { id: 101 },
        })),
        signature: `sha256=${"b".repeat(64)}`,
        deliveryId: webhookDelivery,
        eventName: "issues",
        receivedAt: scheduledAt,
      }),
    ]);
    expect(manualResult).toMatchObject({ result: "accepted", syncRunId: runA });
    expect(webhookResult).toMatchObject({ result: "accepted" });
    expect(fixture.store.request).toHaveBeenCalledTimes(1);
    expect(fixture.dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      eventId: `github-webhook:${webhookDelivery}`,
      projectId: projectA,
    }));
  });
});
