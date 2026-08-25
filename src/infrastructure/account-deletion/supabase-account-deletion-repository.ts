import "server-only";

import type { AccountDeletionRepository } from "@/application/account-deletion/account-deletion-use-cases";
import type { AccountDeletionOperation } from "@/domain/account-deletion/account-deletion";

type Options = { supabaseUrl: string; serviceRoleKey: string; fetcher?: typeof fetch };

export class SupabaseAccountDeletionRepository implements AccountDeletionRepository {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: Options) {
    this.endpoint = `${options.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/`;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async rpc(name: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.fetcher(new URL(name, this.endpoint).toString(), {
        method: "POST",
        headers: {
          apikey: this.options.serviceRoleKey,
          authorization: `Bearer ${this.options.serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error("account_deletion_storage_failed", { cause: error });
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message : "account_deletion_storage_failed";
      const stable = /^account_deletion_[a-z_]+$/.test(message) ? message : "account_deletion_storage_failed";
      throw new Error(stable);
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("account_deletion_storage_failed");
    }
    return payload as Record<string, unknown>;
  }

  request(input: Parameters<AccountDeletionRepository["request"]>[0]) {
    return this.rpc("request_account_deletion", {
      p_actor_user_id: input.actorUserId,
      p_idempotency_key: input.idempotencyKey,
      p_confirmation: input.confirmation,
    }) as Promise<AccountDeletionOperation>;
  }
  getStatus(input: Parameters<AccountDeletionRepository["getStatus"]>[0]) {
    return this.rpc("get_account_deletion_status", { p_actor_user_id: input.actorUserId }) as Promise<AccountDeletionOperation>;
  }
  cancel(input: Parameters<AccountDeletionRepository["cancel"]>[0]) {
    return this.rpc("cancel_account_deletion", { p_actor_user_id: input.actorUserId, p_operation_id: input.operationId }) as Promise<AccountDeletionOperation>;
  }
  claim(input: Parameters<AccountDeletionRepository["claim"]>[0]) {
    return this.rpc("claim_account_deletion", { p_operation_id: input.operationId, p_lease_duration: "5 minutes" });
  }
  cleanupBusinessData(input: Parameters<AccountDeletionRepository["cleanupBusinessData"]>[0]) {
    return this.rpc("cleanup_account_business_data", { p_operation_id: input.operationId, p_lease_token: input.leaseToken }) as Promise<{ outcome: string }>;
  }
  complete(input: Parameters<AccountDeletionRepository["complete"]>[0]) {
    return this.rpc("complete_account_deletion", {
      p_operation_id: input.operationId,
      p_lease_token: input.leaseToken,
      p_outcome: input.outcome,
      p_receipt_fingerprint: input.receiptFingerprint,
      p_error_code: input.errorCode,
    });
  }
}
