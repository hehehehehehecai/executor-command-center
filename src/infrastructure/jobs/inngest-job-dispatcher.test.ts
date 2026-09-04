// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

type AdapterModule = {
  inngestJobDispatcherContract: string;
  mapBackgroundJobToInngestEvent(job: Record<string, unknown>): Record<string, unknown>;
  InngestJobDispatcher: new (client: {
    send(event: Record<string, unknown>): Promise<{ ids: unknown }>;
  }) => { dispatch(job: Record<string, unknown>): Promise<{ providerJobId: string }> };
};

let adapter: Partial<AdapterModule> = {};

beforeAll(async () => {
  const modulePath = "./inngest-job-dispatcher";
  adapter = await import(modulePath).catch(() => ({}));
});

const projectAJob = {
  version: "background-job.v1",
  jobType: "project.sync.requested.v1",
  jobId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  syncRunId: "33333333-3333-4333-8333-333333333333",
  idempotencyKey: "sync-request:fixture-001",
  correlationId: "correlation:fixture-001",
  requestedAt: "2026-08-05T12:00:00.000Z",
};

const expectedEvent = {
  id: "job:22222222-2222-4222-8222-222222222222:sync-request:fixture-001",
  name: "executor/project.sync.requested.v1",
  data: projectAJob,
};

type FakeSend = (event: Record<string, unknown>) => Promise<{ ids: unknown }>;

function createSendMock() {
  return vi.fn<FakeSend>();
}

function dispatcher(send: ReturnType<typeof createSendMock>) {
  const Dispatcher = adapter.InngestJobDispatcher;
  expect(Dispatcher).toBeTypeOf("function");
  return new Dispatcher!({ send });
}

describe("inngest-job-dispatcher.v1", () => {
  it("maps the supported job to a fixed event name and complete minimal lineage", () => {
    expect(adapter.inngestJobDispatcherContract).toBe("inngest-job-dispatcher.v1");
    expect(adapter.mapBackgroundJobToInngestEvent?.(projectAJob)).toEqual(expectedEvent);
  });

  it("maps the same job byte-for-byte deterministically", () => {
    const first = adapter.mapBackgroundJobToInngestEvent?.(projectAJob);
    const second = adapter.mapBackgroundJobToInngestEvent?.({ ...projectAJob });
    expect(first).toEqual(expectedEvent);
    expect(second).toEqual(expectedEvent);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("scopes identical idempotency keys by Project", () => {
    const projectBJob = {
      ...projectAJob,
      jobId: "44444444-4444-4444-8444-444444444444",
      projectId: "55555555-5555-4555-8555-555555555555",
      syncRunId: "66666666-6666-4666-8666-666666666666",
    };
    const eventA = adapter.mapBackgroundJobToInngestEvent?.(projectAJob);
    const eventB = adapter.mapBackgroundJobToInngestEvent?.(projectBJob);
    expect(eventA?.id).toBe(expectedEvent.id);
    expect(eventB?.id).toBe(
      "job:55555555-5555-4555-8555-555555555555:sync-request:fixture-001",
    );
    expect(eventA?.id).not.toBe(eventB?.id);
  });

  it("maps exactly one provider id to providerJobId and sends once", async () => {
    const send = createSendMock().mockResolvedValue({ ids: ["provider-event-001"] });
    await expect(dispatcher(send).dispatch(projectAJob)).resolves.toEqual({
      providerJobId: "provider-event-001",
    });
    expect(send).toHaveBeenCalledExactlyOnceWith(expectedEvent);
  });

  it.each([
    ["zero ids", []],
    ["multiple ids", ["provider-1", "provider-2"]],
    ["blank id", [" "]],
    ["unsafe id", ["provider id with spaces"]],
    ["non-array ids", null],
  ])("rejects an invalid provider receipt: %s", async (_name, ids) => {
    const send = createSendMock().mockResolvedValue({ ids });
    await expect(dispatcher(send).dispatch(projectAJob)).rejects.toThrow(
      "inngest_dispatch_receipt_invalid",
    );
  });

  it("normalizes provider rejection without leaking its body or credentials", async () => {
    const send = createSendMock().mockRejectedValue({
      status: 429,
      body: "SYNTHETIC_PROVIDER_BODY_DO_NOT_LEAK",
      eventKey: "SYNTHETIC_EVENT_KEY_DO_NOT_LEAK",
    });
    let caught: unknown;
    try {
      await dispatcher(send).dispatch(projectAJob);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("inngest_dispatch_rejected");
    expect(JSON.stringify(caught)).not.toMatch(/PROVIDER_BODY|EVENT_KEY|429/i);
    expect((caught as Error).cause).toBeUndefined();
  });

  it("normalizes transport failure without leaking stack or credentials", async () => {
    const send = createSendMock().mockRejectedValue(
      new Error("SYNTHETIC_NETWORK_SECRET_DO_NOT_LEAK"),
    );
    let caught: unknown;
    try {
      await dispatcher(send).dispatch(projectAJob);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("inngest_transport_failed");
    expect((caught as Error).message).not.toContain("SYNTHETIC_NETWORK_SECRET");
    expect((caught as Error).cause).toBeUndefined();
  });

  it("rejects an unknown job type before invoking the provider", async () => {
    const send = createSendMock();
    await expect(dispatcher(send).dispatch({
      ...projectAJob,
      jobType: "github.reader.v1",
    })).rejects.toThrow("background_job_unsupported_type");
    expect(send).not.toHaveBeenCalled();
  });

  it("uses only the injected fake client and never global fetch", async () => {
    const originalFetch = globalThis.fetch;
    const network = vi.fn(() => {
      throw new Error("real_network_forbidden");
    });
    globalThis.fetch = network as typeof fetch;
    try {
      const send = createSendMock().mockResolvedValue({ ids: ["provider-event-001"] });
      await dispatcher(send).dispatch(projectAJob);
      expect(network).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
