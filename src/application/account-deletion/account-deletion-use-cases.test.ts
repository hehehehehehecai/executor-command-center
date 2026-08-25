import { describe, expect, it, vi } from "vitest";

import {
  CancelAccountDeletion,
  ExecuteDueAccountDeletion,
  GetAccountDeletionStatus,
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
      jobId: operationId,
      operationId,
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
});
