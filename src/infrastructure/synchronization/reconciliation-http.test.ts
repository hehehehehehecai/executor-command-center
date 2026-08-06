import { describe, expect, it, vi } from "vitest";

import { handleManualResyncRequest } from "./reconciliation-http";

const projectId = "11111111-1111-4111-8111-111111111111";

describe("manual-resync.v1 HTTP adapter", () => {
  it("maps a valid minimal request to the Application result", async () => {
    const execute = vi.fn(async () => ({
      result: "accepted" as const,
      code: "manual_resync_accepted",
      syncRunId: "33333333-3333-4333-8333-333333333333",
      providerJobId: "provider-phase7-001",
    }));
    const response = await handleManualResyncRequest({
      request: new Request("http://localhost/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      projectId,
      requestedAt: "2026-08-06T03:00:00.000Z",
      execute,
    });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      result: "accepted",
      code: "manual_resync_accepted",
      syncRunId: "33333333-3333-4333-8333-333333333333",
    });
    expect(execute).toHaveBeenCalledWith({
      projectId,
      requestId: "manual-request-001",
      requestedAt: "2026-08-06T03:00:00.000Z",
    });
  });

  it.each([
    [{}, 400],
    [{ requestId: " bad " }, 400],
    [{ requestId: "manual-request-001", userId: "attacker" }, 400],
  ])("rejects invalid or authority-injecting body before execution", async (body, status) => {
    const execute = vi.fn();
    const response = await handleManualResyncRequest({
      request: new Request("http://localhost/api/projects/x/resync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      projectId,
      requestedAt: "2026-08-06T03:00:00.000Z",
      execute,
    });
    expect(response.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["coalesced", 200],
    ["duplicate", 200],
    ["forbidden", 403],
    ["authorization_revoked", 409],
    ["suspended", 409],
    ["not_found", 404],
    ["failed", 503],
    ["rejected", 400],
  ] as const)("maps stable %s result to HTTP %i", async (result, status) => {
    const response = await handleManualResyncRequest({
      request: new Request("http://localhost/api/projects/x/resync", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      projectId,
      requestedAt: "2026-08-06T03:00:00.000Z",
      execute: async () => ({ result, code: `manual_resync_${result}`, syncRunId: null, providerJobId: null }),
    });
    expect(response.status).toBe(status);
  });
});
