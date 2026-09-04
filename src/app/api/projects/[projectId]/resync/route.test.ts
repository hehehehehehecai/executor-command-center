// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDependencies: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("./resync-route-dependencies", () => ({
  createManualResyncDependencies: mocks.createDependencies,
}));

import { POST, dynamic } from "./route";

describe("POST /api/projects/{projectId}/resync", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({
      result: "accepted",
      code: "manual_resync_accepted",
      syncRunId: "33333333-3333-4333-8333-333333333333",
      providerJobId: "provider-phase7-001",
    });
    mocks.createDependencies.mockResolvedValue({
      manual: { execute: mocks.execute },
      clock: { now: () => new Date("2026-08-06T03:00:00.000Z") },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is dynamic and delegates only project, request identity and injected time", async () => {
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://executor.example.test" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(mocks.execute).toHaveBeenCalledWith({
      projectId: "11111111-1111-4111-8111-111111111111",
      requestId: "manual-request-001",
      requestedAt: "2026-08-06T03:00:00.000Z",
    });
  });

  it("rejects authority-injecting body before dependency construction", async () => {
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://executor.example.test" },
        body: JSON.stringify({ requestId: "manual-request-001", userId: "attacker" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });

  it.each([
    ["missing Origin", { "content-type": "application/json" }, 403],
    ["foreign Origin", { "content-type": "application/json", origin: "https://attacker.example.test" }, 403],
    ["non-JSON content", { "content-type": "text/plain", origin: "https://executor.example.test" }, 400],
  ])("rejects %s before dependency/session construction", async (_name, headers, status) => {
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers,
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.createDependencies).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns a stable configuration failure before dependencies when APP_ORIGIN is invalid", async () => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test/path");
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://executor.example.test" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "manual_resync_configuration_missing" });
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });

  it("preserves multiple session refresh cookies and Vary on the final response", async () => {
    mocks.createDependencies.mockImplementation(async (responseHeaders: Headers) => {
      responseHeaders.append("set-cookie", "sb-access=one; Path=/; HttpOnly");
      responseHeaders.append("set-cookie", "sb-refresh=two; Path=/; HttpOnly");
      responseHeaders.set("vary", "Accept-Encoding");
      return {
        manual: { execute: mocks.execute },
        clock: { now: () => new Date("2026-08-06T03:00:00.000Z") },
      };
    });
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://executor.example.test" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(202);
    expect(response.headers.getSetCookie()).toEqual([
      "sb-access=one; Path=/; HttpOnly",
      "sb-refresh=two; Path=/; HttpOnly",
    ]);
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("returns the revoked authorization result without a SyncRun identifier", async () => {
    mocks.execute.mockResolvedValueOnce({
      result: "authorization_revoked",
      code: "manual_resync_authorization_revoked",
      syncRunId: null,
      providerJobId: null,
    });

    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://executor.example.test" },
        body: JSON.stringify({ requestId: "manual-request-revoked" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      result: "authorization_revoked",
      code: "manual_resync_authorization_revoked",
      syncRunId: null,
    });
  });
});
