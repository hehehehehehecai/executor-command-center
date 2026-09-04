// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createDependencies: vi.fn(), execute: vi.fn() }));
vi.mock("./first-sync-route-dependencies", () => ({
  createFirstSyncRouteDependencies: mocks.createDependencies,
}));

import { POST, dynamic } from "./route";

const projectId = "11111111-1111-4111-8111-111111111111";
const receipt = {
  syncRunId: "33333333-3333-4333-8333-333333333333",
  jobId: "33333333-3333-4333-8333-333333333333",
  correlationId: "first-sync:33333333-3333-4333-8333-333333333333",
  idempotencyKey: "first-sync:request-001",
  providerJobId: "provider-first-sync-001",
  windowStart: "2026-05-08T00:00:00.000Z",
  windowEnd: "2026-08-06T00:00:00.000Z",
  reused: false,
} as const;

function request(headers: Record<string, string> = { origin: "https://executor.example.test", "content-type": "application/json" }, body: unknown = { requestId: "request-001" }) {
  return new Request(`https://executor.example.test/api/projects/${projectId}/first-sync`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/{projectId}/first-sync", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(receipt);
    mocks.createDependencies.mockResolvedValue({ entry: { execute: mocks.execute } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is dynamic and delegates a strict project/request command to production dependencies", async () => {
    const response = await POST(request(), { params: Promise.resolve({ projectId }) });
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(202);
    expect(mocks.createDependencies).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({ projectId, requestId: "request-001" });
  });

  it.each([
    ["missing origin", { "content-type": "application/json" }, { requestId: "request-001" }, 403],
    ["wrong content", { origin: "https://executor.example.test", "content-type": "text/plain" }, { requestId: "request-001" }, 400],
    ["authority injection", { origin: "https://executor.example.test", "content-type": "application/json" }, { requestId: "request-001", userId: "forged" }, 400],
  ])("rejects %s before dependency/session construction", async (_name, headers, body, status) => {
    const response = await POST(request(headers, body), { params: Promise.resolve({ projectId }) });
    expect(response.status).toBe(status);
    expect(mocks.createDependencies).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("preserves session refresh headers on the final response", async () => {
    mocks.createDependencies.mockImplementation(async (headers: Headers) => {
      headers.append("set-cookie", "sb-access=synthetic-one; Path=/; HttpOnly");
      headers.append("set-cookie", "sb-refresh=synthetic-two; Path=/; HttpOnly");
      return { entry: { execute: mocks.execute } };
    });
    const response = await POST(request(), { params: Promise.resolve({ projectId }) });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("serializes a revoked installation before exposing a run or job receipt", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("first_sync_authorization_revoked"));

    const response = await POST(request(), { params: Promise.resolve({ projectId }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      result: "failed",
      code: "first_sync_authorization_revoked",
      syncRunId: null,
      jobId: null,
    });
  });
});
