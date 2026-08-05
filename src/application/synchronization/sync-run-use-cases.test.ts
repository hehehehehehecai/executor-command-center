// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

type UseCaseModule = {
  CreateQueuedSyncRun: new (repository: Record<string, unknown>) => { execute(input: unknown): Promise<unknown> };
  GetLatestSyncRun: new (repository: Record<string, unknown>) => { execute(projectId: string): Promise<unknown> };
  TransitionSyncRun: new (repository: Record<string, unknown>) => { execute(input: unknown): Promise<unknown> };
};

let useCases: Partial<UseCaseModule> = {};

beforeAll(async () => {
  const modulePath = "./sync-run-use-cases";
  useCases = await import(modulePath).catch(() => ({}));
});

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

describe("SyncRun application boundary", () => {
  it("creates a queued run with a project-scoped idempotency key", async () => {
    const createQueued = vi.fn().mockResolvedValue({ id: runId, status: "queued" });
    const UseCase = useCases.CreateQueuedSyncRun;
    expect(UseCase).toBeTypeOf("function");
    const result = await new UseCase!({ createQueued }).execute({
      projectId,
      idempotencyKey: "first-sync:fixture-001",
      triggerSource: "first_sync",
    });
    expect(createQueued).toHaveBeenCalledWith({
      projectId,
      idempotencyKey: "first-sync:fixture-001",
      triggerSource: "first_sync",
    });
    expect(result).toEqual({ id: runId, status: "queued" });
  });

  it("reads the latest run by validated project id", async () => {
    const getLatest = vi.fn().mockResolvedValue(null);
    const UseCase = useCases.GetLatestSyncRun;
    expect(UseCase).toBeTypeOf("function");
    await expect(new UseCase!({ getLatest }).execute(projectId)).resolves.toBeNull();
    expect(getLatest).toHaveBeenCalledWith(projectId);
  });

  it("passes expected status and version to one conditional transition", async () => {
    const transition = vi.fn().mockResolvedValue({ id: runId, status: "running", version: 2 });
    const UseCase = useCases.TransitionSyncRun;
    expect(UseCase).toBeTypeOf("function");
    await new UseCase!({ transition }).execute({
      projectId,
      runId,
      expectedStatus: "queued",
      expectedVersion: 1,
      targetStatus: "running",
      transitionedAt: "2026-08-05T12:00:00.000Z",
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
    });
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(expect.objectContaining({
      projectId,
      runId,
      expectedStatus: "queued",
      expectedVersion: 1,
      targetStatus: "running",
    }));
  });

  it("rejects an illegal transition before touching persistence", async () => {
    const transition = vi.fn();
    const UseCase = useCases.TransitionSyncRun;
    expect(UseCase).toBeTypeOf("function");
    await expect(new UseCase!({ transition }).execute({
      projectId,
      runId,
      expectedStatus: "completed",
      expectedVersion: 3,
      targetStatus: "running",
      transitionedAt: "2026-08-05T12:00:00.000Z",
      progressCursor: null,
      errorCode: null,
      errorSummary: null,
    })).rejects.toThrow("sync_run_invalid_transition");
    expect(transition).not.toHaveBeenCalled();
  });

  it.each([
    { projectId: "not-a-uuid", idempotencyKey: "key", triggerSource: "manual" },
    { projectId, idempotencyKey: " key ", triggerSource: "manual" },
    { projectId, idempotencyKey: "key", triggerSource: "" },
  ])("rejects invalid create input without persistence: %o", async (input) => {
    const createQueued = vi.fn();
    const UseCase = useCases.CreateQueuedSyncRun;
    expect(UseCase).toBeTypeOf("function");
    await expect(new UseCase!({ createQueued }).execute(input)).rejects.toThrow(
      "sync_run_invalid_request",
    );
    expect(createQueued).not.toHaveBeenCalled();
  });
});
