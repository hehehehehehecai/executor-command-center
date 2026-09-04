import { describe, expect, it, vi } from "vitest";

import { RunStagingVerification } from "./run-staging-verification";

const projectId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const target = {
  projectId,
  installationId: 157171025,
  repositoryId: 1348250652,
  repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
};

function fixture() {
  const webhook = vi.fn()
    .mockResolvedValueOnce({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 })
    .mockResolvedValueOnce({ result: "duplicate", code: "github_webhook_duplicate", httpStatus: 200 })
    .mockResolvedValueOnce({ result: "accepted", code: "github_webhook_accepted", httpStatus: 202 });
  const reconcile = vi.fn().mockResolvedValue({
    window: { requestIdentity: "reconciliation:2026-08-31", snapshotSince: "2026-08-30T00:00:00.000Z" },
    projects: [{ projectId, decision: "equal", changedGroups: [] }],
  });
  const generate = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error("provider private"), { code: "project_brief_provider_failure" }))
    .mockRejectedValueOnce(Object.assign(new Error("provider private"), { code: "project_brief_provider_failure" }))
    .mockResolvedValueOnce({
      status: "generated",
      energyCharged: 3,
      briefId: "33333333-3333-4333-8333-333333333333",
      invocationId: "44444444-4444-4444-8444-444444444444",
      evidenceFingerprint: "a".repeat(64),
    });
  const subject = new RunStagingVerification({
    target,
    webhook: { execute: webhook },
    signWebhook: vi.fn(() => `sha256=${"a".repeat(64)}`),
    reconciliation: { execute: reconcile },
    generate,
    clock: { now: () => new Date("2026-08-31T08:00:00.000Z") },
    ids: {
      deliveryId: vi.fn()
        .mockReturnValueOnce("55555555-5555-4555-8555-555555555555")
        .mockReturnValueOnce("66666666-6666-4666-8666-666666666666"),
    },
  });
  return { subject, webhook, reconcile, generate };
}

describe("RunStagingVerification", () => {
  it("uses the production webhook seam for accepted, same-delivery duplicate, and different-delivery accepted", async () => {
    const f = fixture();
    const result = await f.subject.execute({
      operation: "webhook-replay",
      caseId: "phase8-13-replay-001",
      projectId,
      userId,
    });
    expect(result).toMatchObject({
      first: { result: "accepted", httpStatus: 202 },
      replay: { result: "duplicate", httpStatus: 200 },
      differentDelivery: { result: "accepted", httpStatus: 202 },
      duplicateSideEffectsExpected: 0,
    });
    expect(f.webhook).toHaveBeenCalledTimes(3);
    expect(f.webhook.mock.calls[0]?.[0].deliveryId).toBe(f.webhook.mock.calls[1]?.[0].deliveryId);
    expect(f.webhook.mock.calls[2]?.[0].deliveryId).not.toBe(f.webhook.mock.calls[0]?.[0].deliveryId);
    expect(f.webhook.mock.calls[0]?.[0].eventName).toBe("repository");
  });

  it("runs only the frozen target through the production reconciliation use case", async () => {
    const f = fixture();
    await expect(f.subject.execute({
      operation: "reconciliation",
      caseId: "phase8-13-reconcile-001",
      projectId,
      userId,
    })).resolves.toMatchObject({
      requestIdentity: "reconciliation:2026-08-31",
      project: { projectId, decision: "equal" },
    });
    expect(f.reconcile).toHaveBeenCalledWith({ scheduledAt: "2026-08-31T08:00:00.000Z" });
  });

  it("fails once, replays the same failed request without double-refund, then retries with the real provider", async () => {
    const f = fixture();
    const result = await f.subject.execute({
      operation: "provider-failure-retry",
      caseId: "phase8-13-provider-001",
      projectId,
      userId,
    });
    expect(result).toMatchObject({
      firstFailureCode: "project_brief_provider_failure",
      replayFailureCode: "project_brief_provider_failure",
      success: { status: "generated", energyCharged: 3 },
    });
    expect(f.generate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mode: "controlled_failure",
      requestKey: "phase8.13:phase8-13-provider-001:failure",
    }));
    expect(f.generate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mode: "controlled_failure",
      requestKey: "phase8.13:phase8-13-provider-001:failure",
    }));
    expect(f.generate).toHaveBeenNthCalledWith(3, expect.objectContaining({
      mode: "real_provider",
      requestKey: "phase8.13:phase8-13-provider-001:retry",
    }));
  });

  it("rejects a wrong project before every production seam", async () => {
    const f = fixture();
    await expect(f.subject.execute({
      operation: "reconciliation",
      caseId: "phase8-13-reconcile-002",
      projectId: "77777777-7777-4777-8777-777777777777",
      userId,
    })).rejects.toThrow("staging_verification_forbidden");
    expect(f.reconcile).not.toHaveBeenCalled();
    expect(f.webhook).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });
});
