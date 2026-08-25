import "server-only";
import type { Inngest } from "inngest";

import type { AccountDeletionScheduler } from "@/application/account-deletion/account-deletion-use-cases";
import { parseAccountDeletionJob, type AccountDeletionJob } from "@/domain/account-deletion/account-deletion-job";

export class InngestAccountDeletionDispatcher implements AccountDeletionScheduler {
  constructor(private readonly client: Pick<Inngest, "send">) {}
  async dispatch(input: AccountDeletionJob) {
    const job = parseAccountDeletionJob(input);
    let receipt: unknown;
    try {
      receipt = await this.client.send({
        id: `account-deletion:${job.operationId}`,
        name: "executor/account.deletion.due.v1",
        data: job,
      });
    } catch (error) {
      throw new Error("account_deletion_dispatch_failed", { cause: error });
    }
    const ids = typeof receipt === "object" && receipt !== null && "ids" in receipt ? (receipt as { ids?: unknown }).ids : null;
    if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string") {
      throw new Error("account_deletion_dispatch_failed");
    }
    return { providerJobId: ids[0] };
  }
}
