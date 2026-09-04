import { describe, expect, it, vi } from "vitest";

import { handleManualResyncRequest } from "./reconciliation-http";

const projectId = "11111111-1111-4111-8111-111111111111";
const appOrigin = "https://executor.example.test";
const requestedAt = "2026-08-06T03:00:00.000Z";

function request(input: {
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly origin?: string | null;
  readonly contentType?: string;
} = {}) {
  const headers = new Headers();
  if (input.origin !== null) headers.set("origin", input.origin ?? appOrigin);
  headers.set("content-type", input.contentType ?? "application/json");
  return new Request(`${appOrigin}/api/projects/${projectId}/resync`, {
    method: "POST",
    headers,
    body: input.rawBody ?? JSON.stringify(input.body ?? { requestId: "manual-request-001" }),
  });
}

function expectSecureMutationHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("pragma")).toBe("no-cache");
  const vary = new Set((response.headers.get("vary") ?? "").split(",").map((value) => value.trim().toLowerCase()));
  expect(vary).toEqual(new Set(["cookie", "origin"]));
}

describe("manual-resync.v1 HTTP adapter", () => {
  it("maps a valid minimal request to the Application result", async () => {
    const execute = vi.fn(async () => ({
      result: "accepted" as const,
      code: "manual_resync_accepted",
      syncRunId: "33333333-3333-4333-8333-333333333333",
      providerJobId: "provider-phase7-001",
    }));
    const response = await handleManualResyncRequest({
      request: request(),
      appOrigin,
      projectId,
      requestedAt,
      execute,
    });
    expect(response.status).toBe(202);
    expectSecureMutationHeaders(response);
    await expect(response.json()).resolves.toEqual({
      result: "accepted",
      code: "manual_resync_accepted",
      syncRunId: "33333333-3333-4333-8333-333333333333",
    });
    expect(execute).toHaveBeenCalledWith({
      projectId,
      requestId: "manual-request-001",
      requestedAt,
    });
  });

  it.each([
    ["missing Origin", request({ origin: null }), appOrigin, 403, "manual_resync_origin_forbidden"],
    ["foreign Origin", request({ origin: "https://attacker.example.test" }), appOrigin, 403, "manual_resync_origin_forbidden"],
    ["invalid APP_ORIGIN", request(), `${appOrigin}/path`, 503, "manual_resync_configuration_missing"],
  ] as const)("rejects %s before time or Application dependencies", async (_name, httpRequest, configuredOrigin, status, code) => {
    const clock = vi.fn(async () => requestedAt);
    const execute = vi.fn();
    const response = await handleManualResyncRequest({
      request: httpRequest,
      appOrigin: configuredOrigin,
      projectId,
      requestedAt: clock,
      execute,
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ result: status === 503 ? "failed" : "rejected", code });
    expectSecureMutationHeaders(response);
    expect(clock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["text/plain", JSON.stringify({ requestId: "manual-request-001" })],
    ["application/x-www-form-urlencoded", "requestId=manual-request-001"],
  ])("rejects non-JSON content type %s before time or execution", async (contentType, rawBody) => {
    const clock = vi.fn(async () => requestedAt);
    const execute = vi.fn();
    const response = await handleManualResyncRequest({
      request: request({ contentType, rawBody }),
      appOrigin,
      projectId,
      requestedAt: clock,
      execute,
    });
    expect(response.status).toBe(400);
    expectSecureMutationHeaders(response);
    expect(clock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON after HTTP gates but before time or execution", async () => {
    const clock = vi.fn(async () => requestedAt);
    const execute = vi.fn();
    const response = await handleManualResyncRequest({
      request: request({ rawBody: "{" }),
      appOrigin,
      projectId,
      requestedAt: clock,
      execute,
    });
    expect(response.status).toBe(400);
    expectSecureMutationHeaders(response);
    expect(clock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [{}, 400],
    [{ requestId: " bad " }, 400],
    [{ requestId: "manual-request-001", userId: "attacker" }, 400],
  ])("rejects invalid or authority-injecting body before execution", async (body, status) => {
    const execute = vi.fn();
    const response = await handleManualResyncRequest({
      request: request({ body }),
      appOrigin,
      projectId,
      requestedAt,
      execute,
    });
    expect(response.status).toBe(status);
    expectSecureMutationHeaders(response);
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
      request: request({ contentType: "Application/JSON; charset=utf-8" }),
      appOrigin,
      projectId,
      requestedAt,
      execute: async () => ({ result, code: `manual_resync_${result}`, syncRunId: null, providerJobId: null }),
    });
    expect(response.status).toBe(status);
    expectSecureMutationHeaders(response);
  });

  it("preserves one Supabase session Set-Cookie and replaces unsafe cache headers", async () => {
    const responseHeaders = new Headers({
      "cache-control": "public, max-age=3600",
      "set-cookie": "sb-session=refreshed; Path=/; HttpOnly",
      vary: "Accept-Encoding",
    });
    const response = await handleManualResyncRequest({
      request: request(),
      appOrigin,
      responseHeaders,
      projectId,
      requestedAt,
      execute: async () => ({ result: "accepted", code: "manual_resync_accepted", syncRunId: null, providerJobId: null }),
    });
    expect(response.headers.getSetCookie()).toEqual(["sb-session=refreshed; Path=/; HttpOnly"]);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("preserves multiple Supabase Set-Cookie values on a business failure", async () => {
    const responseHeaders = new Headers({ vary: "Cookie" });
    responseHeaders.append("set-cookie", "sb-access=one; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "sb-refresh=two; Path=/; HttpOnly");
    const response = await handleManualResyncRequest({
      request: request(),
      appOrigin,
      responseHeaders,
      projectId,
      requestedAt,
      execute: async () => ({ result: "failed", code: "manual_resync_failed", syncRunId: null, providerJobId: null }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([
      "sb-access=one; Path=/; HttpOnly",
      "sb-refresh=two; Path=/; HttpOnly",
    ]);
    expectSecureMutationHeaders(response);
  });
});
