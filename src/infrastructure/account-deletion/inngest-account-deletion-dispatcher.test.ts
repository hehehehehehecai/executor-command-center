import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InngestAccountDeletionDispatcher } from "./inngest-account-deletion-dispatcher";

const operationId = "b3800000-0000-4000-8000-000000000001";

describe("InngestAccountDeletionDispatcher", () => {
  it("deduplicates one recovery generation without suppressing a later generation", async () => {
    const send = vi.fn().mockResolvedValue({ ids: ["provider-job"] });
    const dispatcher = new InngestAccountDeletionDispatcher({ send } as never);
    await dispatcher.dispatch({
      version: "account-deletion-job.v1",
      jobType: "account.deletion.due.v1",
      jobId: `${operationId}:4`,
      operationId,
      generation: 4,
      dueAt: "2026-08-25T08:00:00.000Z",
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      id: `account-deletion:${operationId}:4`,
      data: expect.objectContaining({ generation: 4 }),
    }));
  });

  it("rejects a mismatched operation and generation identity before provider dispatch", async () => {
    const send = vi.fn();
    const dispatcher = new InngestAccountDeletionDispatcher({ send } as never);
    await expect(dispatcher.dispatch({
      version: "account-deletion-job.v1",
      jobType: "account.deletion.due.v1",
      jobId: `${operationId}:2`,
      operationId,
      generation: 3,
      dueAt: "2026-08-25T08:00:00.000Z",
    })).rejects.toThrow("account_deletion_job_invalid");
    expect(send).not.toHaveBeenCalled();
  });
});
