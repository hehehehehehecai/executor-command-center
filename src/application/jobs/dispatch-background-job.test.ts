// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

type ApplicationModule = {
  jobDispatcherContract: string;
  DispatchBackgroundJob: new (dispatcher: {
    dispatch(job: Record<string, unknown>): Promise<{ providerJobId: string }>;
  }) => { execute(input: unknown): Promise<{ providerJobId: string }> };
};

let application: Partial<ApplicationModule> = {};

beforeAll(async () => {
  const modulePath = "./dispatch-background-job";
  application = await import(modulePath).catch(() => ({}));
});
const validJob = {
  version: "background-job.v1",
  jobType: "project.sync.requested.v1",
  jobId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  syncRunId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "sync-request:fixture-001",
  correlationId: "correlation:fixture-001",
  requestedAt: "2026-08-05T12:00:00.000Z",
};

describe("job-dispatcher.v1 application boundary", () => {
  it("validates and dispatches through the provider-neutral port", async () => {
    const dispatch = vi.fn().mockResolvedValue({ providerJobId: "provider-event-001" });
    const UseCase = application.DispatchBackgroundJob;
    expect(UseCase).toBeTypeOf("function");
    const result = await new UseCase!({ dispatch }).execute(validJob);
    expect(application.jobDispatcherContract).toBe("job-dispatcher.v1");
    expect(result).toEqual({ providerJobId: "provider-event-001" });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(validJob);
  });

  it("rejects invalid input before calling the dispatcher", async () => {
    const dispatch = vi.fn();
    const UseCase = application.DispatchBackgroundJob;
    expect(UseCase).toBeTypeOf("function");
    await expect(new UseCase!({ dispatch }).execute({
      ...validJob,
      projectId: "wrong-project",
    })).rejects.toThrow("background_job_invalid_request");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
