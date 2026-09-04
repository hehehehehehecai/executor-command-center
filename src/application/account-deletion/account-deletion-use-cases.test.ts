import { describe, expect, it, vi } from "vitest";

import {
  CancelAccountDeletion,
  ExecuteDueAccountDeletion,
  GetAccountDeletionStatus,
  RecoverExhaustedAccountDeletions,
  RequestAccountDeletion,
} from "./account-deletion-use-cases";

const actorUserId = "b3000000-0000-4000-8000-000000000001";
const operationId = "b3800000-0000-4000-8000-000000000001";
const leaseToken = "b3900000-0000-4000-8000-000000000001";
const requestedAt = "2026-08-25T06:00:00.000Z";
const dueAt = "2026-09-01T06:00:00.000Z";

const pending = {
  operationId,
  status: "deletion_pending" as const,
  outcome: "executed" as const,
  requestedAt,
  dueAt,
  safelyRetryable: true as const,
};

describe("account deletion application lifecycle", () => {
  it("binds the verified session actor and schedules the durable operation", async () => {
    const request = vi.fn().mockResolvedValue(pending);
    const dispatch = vi.fn().mockResolvedValue({ providerJobId: "fixture-job" });
    const useCase = new RequestAccountDeletion({
      sessionReader: { getVerifiedUserId: vi.fn().mockResolvedValue(actorUserId) },
      repository: { request },
      dispatcher: { dispatch },
    });

    await expect(useCase.execute({
      idempotencyKey: "phase3:request:one",
      confirmation: `DELETE ACCOUNT ${actorUserId}`,
    })).resolves.toEqual(pending);
    expect(request).toHaveBeenCalledWith({
      actorUserId,
      idempotencyKey: "phase3:request:one",
      confirmation: `DELETE ACCOUNT ${actorUserId}`,
    });
    expect(dispatch).toHaveBeenCalledWith({
      version: "account-deletion-job.v1",
      jobType: "account.deletion.due.v1",
      jobId: `${operationId}:0`,
      operationId,
      generation: 0,
      dueAt,
    });
  });

  it("never trusts a client actor and fails unauthenticated before persistence", async () => {
    const request = vi.fn();
    const useCase = new RequestAccountDeletion({
      sessionReader: { getVerifiedUserId: vi.fn().mockResolvedValue(null) },
      repository: { request },
      dispatcher: { dispatch: vi.fn() },
    });
    await expect(useCase.execute({
      actorUserId: "b3000000-0000-4000-8000-000000000099",
      idempotencyKey: "phase3:forged",
      confirmation: `DELETE ACCOUNT ${actorUserId}`,
    })).rejects.toThrow("account_deletion_unauthenticated");
    expect(request).not.toHaveBeenCalled();
  });

  it("queries and cancels only through the verified session boundary", async () => {
    const sessionReader = { getVerifiedUserId: vi.fn().mockResolvedValue(actorUserId) };
    const getStatus = vi.fn().mockResolvedValue(pending);
    const cancel = vi.fn().mockResolvedValue({ ...pending, status: "active", outcome: "cancelled" });
    await expect(new GetAccountDeletionStatus({ sessionReader, repository: { getStatus } }).execute())
      .resolves.toEqual(pending);
    await expect(new CancelAccountDeletion({ sessionReader, repository: { cancel } }).execute({ operationId }))
      .resolves.toMatchObject({ status: "active" });
    expect(getStatus).toHaveBeenCalledWith({ actorUserId });
    expect(cancel).toHaveBeenCalledWith({ actorUserId, operationId });
  });

  it("retries safely from business-complete/Auth-failed and treats absent Auth as success", async () => {
    const complete = vi.fn().mockResolvedValue({ status: "deleted", outcome: "completed" });
    const repository = {
      claim: vi.fn().mockResolvedValue({
        outcome: "claimed",
        status: "deleting",
        operationId,
        userId: actorUserId,
        leaseToken,
      }),
      cleanupBusinessData: vi.fn().mockResolvedValue({ outcome: "already_absent" }),
      complete,
    };
    const authAdmin = {
      deleteIdentity: vi.fn().mockResolvedValue({
        outcome: "already_absent",
        receiptFingerprint: "a".repeat(64),
      }),
    };
    const result = await new ExecuteDueAccountDeletion({ repository, authAdmin }).execute({ operationId });
    expect(result).toEqual({ status: "deleted", outcome: "completed" });
    expect(complete).toHaveBeenCalledWith({
      operationId,
      leaseToken,
      outcome: "auth_already_absent",
      receiptFingerprint: "a".repeat(64),
      errorCode: null,
    });
  });

  it("records business and Auth partial failures at their stable retry point", async () => {
    const complete = vi.fn().mockResolvedValue({ status: "deletion_failed", outcome: "failed" });
    const baseRepository = {
      claim: vi.fn().mockResolvedValue({ outcome: "claimed", status: "deleting", operationId, userId: actorUserId, leaseToken }),
      complete,
    };
    const business = new ExecuteDueAccountDeletion({
      repository: { ...baseRepository, cleanupBusinessData: vi.fn().mockRejectedValue(new Error("db down")) },
      authAdmin: { deleteIdentity: vi.fn() },
    });
    await expect(business.execute({ operationId })).resolves.toMatchObject({ status: "deletion_failed" });
    expect(complete).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "business_failed", errorCode: "account_deletion_business_cleanup_failed" }));

    complete.mockClear();
    const auth = new ExecuteDueAccountDeletion({
      repository: { ...baseRepository, cleanupBusinessData: vi.fn().mockResolvedValue({ outcome: "deleted" }) },
      authAdmin: { deleteIdentity: vi.fn().mockRejectedValue(new Error("provider down")) },
    });
    await expect(auth.execute({ operationId })).resolves.toMatchObject({ status: "deletion_failed" });
    expect(complete).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "auth_failed", errorCode: "account_deletion_auth_identity_delete_failed" }));
  });

  it("leases only durable recovery candidates and records dispatch failure for a later scan", async () => {
    const claimRecoveries = vi.fn().mockResolvedValue({
      outcome: "claimed",
      operations: [{ operationId, generation: 1, dispatchToken: leaseToken, dueAt }],
    });
    const completeRecoveryDispatch = vi.fn().mockResolvedValue({ outcome: "retry_scheduled" });
    const dispatch = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const result = await new RecoverExhaustedAccountDeletions({
      repository: { claimRecoveries, completeRecoveryDispatch },
      dispatcher: { dispatch },
    }).execute();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      jobId: `${operationId}:1`, operationId, generation: 1,
    }));
    expect(completeRecoveryDispatch).toHaveBeenCalledWith({
      operationId, generation: 1, dispatchToken: leaseToken,
      outcome: "dispatch_failed", errorCode: "account_deletion_recovery_dispatch_failed",
    });
    expect(result).toEqual({ eligible: 1, dispatched: 0, failed: 1 });
  });

  it("marks a successful durable recovery dispatch without executing deletion inline", async () => {
    const claimRecoveries = vi.fn().mockResolvedValue({
      outcome: "claimed",
      operations: [{ operationId, generation: 2, dispatchToken: leaseToken, dueAt }],
    });
    const completeRecoveryDispatch = vi.fn().mockResolvedValue({ outcome: "retry_scheduled" });
    const dispatch = vi.fn().mockResolvedValue({ providerJobId: "recovery-provider-job" });
    const result = await new RecoverExhaustedAccountDeletions({
      repository: { claimRecoveries, completeRecoveryDispatch }, dispatcher: { dispatch },
    }).execute();
    expect(completeRecoveryDispatch).toHaveBeenCalledWith({
      operationId, generation: 2, dispatchToken: leaseToken,
      outcome: "dispatched", errorCode: null,
    });
    expect(result).toEqual({ eligible: 1, dispatched: 1, failed: 0 });
  });
});
