import type { AccountDeletionJob } from "@/domain/account-deletion/account-deletion-job";
import {
  parseAccountDeletionCancellation,
  parseAccountDeletionRequest,
  type AccountDeletionOperation,
} from "@/domain/account-deletion/account-deletion";

type SessionReader = { getVerifiedUserId(): Promise<string | null> };

export interface AccountDeletionScheduler {
  dispatch(job: AccountDeletionJob): Promise<{ providerJobId: string }>;
}
export interface AccountDeletionRepository {
  request(input: { actorUserId: string; idempotencyKey: string; confirmation: string }): Promise<AccountDeletionOperation>;
  getStatus(input: { actorUserId: string }): Promise<AccountDeletionOperation>;
  cancel(input: { actorUserId: string; operationId: string }): Promise<AccountDeletionOperation>;
  claim(input: { operationId: string }): Promise<Record<string, unknown>>;
  cleanupBusinessData(input: { operationId: string; leaseToken: string }): Promise<{ outcome: string }>;
  complete(input: {
    operationId: string;
    leaseToken: string;
    outcome: "auth_deleted" | "auth_already_absent" | "auth_failed" | "business_failed";
    receiptFingerprint: string | null;
    errorCode: string | null;
  }): Promise<Record<string, unknown>>;
}

export interface AuthIdentityAdmin {
  deleteIdentity(input: { userId: string }): Promise<{
    outcome: "deleted" | "already_absent";
    receiptFingerprint: string;
  }>;
}

async function verifiedActor(sessionReader: SessionReader) {
  const actorUserId = await sessionReader.getVerifiedUserId();
  if (!actorUserId) throw new Error("account_deletion_unauthenticated");
  return actorUserId;
}

export class RequestAccountDeletion {
  constructor(private readonly dependencies: {
    sessionReader: SessionReader;
    repository: Pick<AccountDeletionRepository, "request">;
    dispatcher: AccountDeletionScheduler;
  }) {}

  async execute(value: unknown) {
    const actorUserId = await verifiedActor(this.dependencies.sessionReader);
    const request = parseAccountDeletionRequest(value);
    if (request.confirmation !== `DELETE ACCOUNT ${actorUserId}`) {
      throw new Error("account_deletion_invalid_request");
    }
    const operation = await this.dependencies.repository.request({ actorUserId, ...request });
    if (!operation.operationId || !operation.dueAt) throw new Error("account_deletion_storage_failed");
    try {
      await this.dependencies.dispatcher.dispatch({
        version: "account-deletion-job.v1",
        jobType: "account.deletion.due.v1",
        jobId: operation.operationId,
        operationId: operation.operationId,
        dueAt: operation.dueAt,
      });
    } catch (error) {
      throw new Error("account_deletion_dispatch_failed", { cause: error });
    }
    return operation;
  }
}

export class GetAccountDeletionStatus {
  constructor(private readonly dependencies: {
    sessionReader: SessionReader;
    repository: Pick<AccountDeletionRepository, "getStatus">;
  }) {}
  async execute() {
    return this.dependencies.repository.getStatus({
      actorUserId: await verifiedActor(this.dependencies.sessionReader),
    });
  }
}

export class CancelAccountDeletion {
  constructor(private readonly dependencies: {
    sessionReader: SessionReader;
    repository: Pick<AccountDeletionRepository, "cancel">;
  }) {}
  async execute(value: unknown) {
    const actorUserId = await verifiedActor(this.dependencies.sessionReader);
    return this.dependencies.repository.cancel({
      actorUserId,
      ...parseAccountDeletionCancellation(value),
    });
  }
}

export class ExecuteDueAccountDeletion {
  constructor(private readonly dependencies: {
    repository: Pick<AccountDeletionRepository, "claim" | "cleanupBusinessData" | "complete">;
    authAdmin: AuthIdentityAdmin;
  }) {}

  async execute(input: { operationId: string }) {
    const claim = await this.dependencies.repository.claim(input);
    if (claim.outcome !== "claimed") return claim;
    const operationId = claim.operationId;
    const userId = claim.userId;
    const leaseToken = claim.leaseToken;
    if (typeof operationId !== "string" || typeof userId !== "string" || typeof leaseToken !== "string") {
      throw new Error("account_deletion_storage_failed");
    }
    try {
      await this.dependencies.repository.cleanupBusinessData({ operationId, leaseToken });
    } catch {
      return this.dependencies.repository.complete({
        operationId, leaseToken, outcome: "business_failed", receiptFingerprint: null,
        errorCode: "account_deletion_business_cleanup_failed",
      });
    }
    let authResult;
    try {
      authResult = await this.dependencies.authAdmin.deleteIdentity({ userId });
    } catch {
      return this.dependencies.repository.complete({
        operationId, leaseToken, outcome: "auth_failed", receiptFingerprint: null,
        errorCode: "account_deletion_auth_identity_delete_failed",
      });
    }
    return this.dependencies.repository.complete({
      operationId,
      leaseToken,
      outcome: authResult.outcome === "deleted" ? "auth_deleted" : "auth_already_absent",
      receiptFingerprint: authResult.receiptFingerprint,
      errorCode: null,
    });
  }
}
