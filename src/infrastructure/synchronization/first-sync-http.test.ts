// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { handleFirstSyncRequest } from "./first-sync-http";

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

function request(body: unknown, headers: Record<string, string> = {
  origin: "https://executor.example.test",
  "content-type": "application/json; charset=utf-8",
}) {
  return new Request(`https://executor.example.test/api/projects/${projectId}/first-sync`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("first-sync-http.v1", () => {
  it.each([
    ["missing Origin", { "content-type": "application/json" }, { requestId: "request-001" }, 403],
    ["foreign Origin", { origin: "https://attacker.example.test", "content-type": "application/json" }, { requestId: "request-001" }, 403],
    ["wrong content type", { origin: "https://executor.example.test", "content-type": "text/plain" }, { requestId: "request-001" }, 400],
    ["malformed JSON", undefined, "{", 400],
    ["extra body field", undefined, { requestId: "request-001", userId: "forged" }, 400],
    ["invalid request identity", undefined, { requestId: " request " }, 400],
  ])("rejects %s before dependency execution", async (_name, headers, body, status) => {
    const execute = vi.fn();
    const response = await handleFirstSyncRequest({
      request: request(body, headers),
      appOrigin: "https://executor.example.test",
      projectId,
      execute,
    });
    expect(response.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("rejects invalid project identity and invalid APP_ORIGIN before execution", async () => {
    const execute = vi.fn();
    const invalidProject = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test",
      projectId: "not-a-uuid",
      execute,
    });
    const invalidConfiguration = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test/path",
      projectId,
      execute,
    });
    expect(invalidProject.status).toBe(400);
    expect(invalidConfiguration.status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps a new dispatch to 202 and a replay to 200 with only safe IDs", async () => {
    const first = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test",
      projectId,
      execute: vi.fn(async () => receipt),
    });
    const replay = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test",
      projectId,
      execute: vi.fn(async () => ({ ...receipt, reused: true })),
    });
    expect(first.status).toBe(202);
    await expect(first.json()).resolves.toEqual({
      result: "accepted",
      code: "first_sync_accepted",
      syncRunId: receipt.syncRunId,
      jobId: receipt.jobId,
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      result: "duplicate",
      code: "first_sync_reused",
      syncRunId: receipt.syncRunId,
      jobId: receipt.jobId,
    });
  });

  it.each([
    ["first_sync_unauthenticated", 401],
    ["first_sync_project_not_found", 404],
    ["first_sync_authorization_revoked", 409],
    ["first_sync_configuration_missing", 503],
    ["raw service-role secret SQL stack", 503],
  ])("normalizes %s without leaking the raw error", async (message, status) => {
    const failures: unknown[] = [];
    const response = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test",
      projectId,
      execute: vi.fn(async () => { throw new Error(message); }),
      onFailure: (failure) => failures.push(failure),
    });
    const text = await response.text();
    expect(response.status).toBe(status);
    expect(text).not.toMatch(/service-role|secret|SQL stack/i);
    expect(JSON.stringify(failures)).not.toMatch(/service-role|secret|SQL stack/i);
  });

  it("preserves multiple session cookies and existing Vary on business failure", async () => {
    const responseHeaders = new Headers({ vary: "Accept-Encoding" });
    responseHeaders.append("set-cookie", "sb-access=synthetic-one; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "sb-refresh=synthetic-two; Path=/; HttpOnly");
    const response = await handleFirstSyncRequest({
      request: request({ requestId: "request-001" }),
      appOrigin: "https://executor.example.test",
      projectId,
      responseHeaders,
      execute: vi.fn(async () => { throw new Error("first_sync_project_not_found"); }),
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
  });
});
