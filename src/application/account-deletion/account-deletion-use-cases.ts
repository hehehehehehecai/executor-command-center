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
  markRetryExhausted(input: { operationId: string; generation: number }): Promise<Record<string, unknown>>;
  claimRecoveries(input: { limit: number }): Promise<Record<string, unknown>>;
  completeRecoveryDispatch(input: {
    operationId: string;
    generation: number;
    dispatchToken: string;
    outcome: "dispatched" | "dispatch_failed";
    errorCode: "account_deletion_recovery_dispatch_failed" | null;
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
        jobId: `${operation.operationId}:0`,
        operationId: operation.operationId,
        generation: 0,
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

export class MarkAccountDeletionRetryExhausted {
  constructor(private readonly repository: Pick<AccountDeletionRepository, "markRetryExhausted">) {}
  execute(input: { operationId: string; generation: number }) {
    return this.repository.markRetryExhausted(input);
  }
}

type RecoveryCandidate = {
  operationId: string;
  generation: number;
  dispatchToken: string;
  dueAt: string;
};

function recoveryCandidates(value: Record<string, unknown>): RecoveryCandidate[] {
  if (!Array.isArray(value.operations)) throw new Error("account_deletion_storage_failed");
  return value.operations.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null) throw new Error("account_deletion_storage_failed");
    const record = candidate as Record<string, unknown>;
    if (typeof record.operationId !== "string" || typeof record.generation !== "number"
      || !Number.isInteger(record.generation) || record.generation < 1
      || typeof record.dispatchToken !== "string" || typeof record.dueAt !== "string") {
      throw new Error("account_deletion_storage_failed");
    }
    return record as RecoveryCandidate;
  });
}

export class RecoverExhaustedAccountDeletions {
  constructor(private readonly dependencies: {
    repository: Pick<AccountDeletionRepository, "claimRecoveries" | "completeRecoveryDispatch">;
    dispatcher: AccountDeletionScheduler;
  }) {}

  async execute() {
    const candidates = recoveryCandidates(await this.dependencies.repository.claimRecoveries({ limit: 25 }));
    let dispatched = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        await this.dependencies.dispatcher.dispatch({
          version: "account-deletion-job.v1",
          jobType: "account.deletion.due.v1",
          jobId: `${candidate.operationId}:${candidate.generation}`,
          operationId: candidate.operationId,
          generation: candidate.generation,
          dueAt: candidate.dueAt,
        });
        await this.dependencies.repository.completeRecoveryDispatch({
          operationId: candidate.operationId,
          generation: candidate.generation,
          dispatchToken: candidate.dispatchToken,
          outcome: "dispatched",
          errorCode: null,
        });
        dispatched += 1;
      } catch {
        await this.dependencies.repository.completeRecoveryDispatch({
          operationId: candidate.operationId,
          generation: candidate.generation,
          dispatchToken: candidate.dispatchToken,
          outcome: "dispatch_failed",
          errorCode: "account_deletion_recovery_dispatch_failed",
        });
        failed += 1;
      }
    }
    return { eligible: candidates.length, dispatched, failed };
  }
}
