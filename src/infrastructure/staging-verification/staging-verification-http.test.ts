import { describe, expect, it, vi } from "vitest";

import {
  handleStagingVerificationExecution,
  handleStagingVerificationTicketIssue,
  stagingVerificationCookieName,
} from "./staging-verification-http";

const origin = "https://staging.example.test";
const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const body = { projectId, caseId: "phase8-13-case-001" };

function request(path: string, value: unknown = body, cookie?: string) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(value),
  });
}

describe("staging verification HTTP boundary", () => {
  it("issues an HttpOnly Secure SameSite=Lax short-lived narrow-path cookie", async () => {
    const issue = vi.fn().mockResolvedValue({
      contractVersion: "staging-verification.v1",
      rawToken: "a".repeat(43),
      caseId: body.caseId,
      projectId,
      operation: "webhook-replay",
    });
    const response = await handleStagingVerificationTicketIssue({
      request: request("/api/staging-verification/webhook-replay/ticket"),
      appOrigin: origin,
      operation: "webhook-replay",
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      issue,
    });
    expect(response.status).toBe(201);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${stagingVerificationCookieName}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/api/staging-verification/webhook-replay");
    expect(cookie).toContain("Max-Age=300");
    const payload = await response.json();
    expect(payload).toEqual({
      contractVersion: "staging-verification.v1",
      result: "ticket_issued",
      caseId: body.caseId,
      operation: "webhook-replay",
    });
    expect(JSON.stringify(payload)).not.toContain("a".repeat(43));
  });

  it("consumes the cookie, clears it on success, and exposes only low-sensitive evidence", async () => {
    const consume = vi.fn().mockResolvedValue({ caseId: body.caseId, projectId, operation: "reconciliation" });
    const execute = vi.fn().mockResolvedValue({ result: "completed", runId: "low-sensitive-run-id" });
    const response = await handleStagingVerificationExecution({
      request: request(
        "/api/staging-verification/reconciliation",
        body,
        `${stagingVerificationCookieName}=${"b".repeat(43)}`,
      ),
      appOrigin: origin,
      operation: "reconciliation",
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      consume,
      execute,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(response.json()).resolves.toEqual({
      contractVersion: "staging-verification.v1",
      caseId: body.caseId,
      operation: "reconciliation",
      evidence: { result: "completed", runId: "low-sensitive-run-id" },
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    ["foreign origin", "https://attacker.test", userId, 403, "staging_verification_origin_forbidden"],
    ["unauthenticated", origin, null, 401, "staging_verification_unauthenticated"],
  ])("fails closed for %s before any business operation", async (_name, requestOrigin, actor, status, code) => {
    const execute = vi.fn();
    const response = await handleStagingVerificationExecution({
      request: new Request(`${origin}/api/staging-verification/webhook-replay`, {
        method: "POST",
        headers: { origin: requestOrigin, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      appOrigin: origin,
      operation: "webhook-replay",
      getVerifiedUserId: async () => actor,
      authorize: vi.fn(),
      consume: vi.fn(),
      execute,
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("clears a consumed or invalid ticket on failure and redacts internal details", async () => {
    const response = await handleStagingVerificationExecution({
      request: request(
        "/api/staging-verification/provider-failure-retry",
        body,
        `${stagingVerificationCookieName}=${"c".repeat(43)}`,
      ),
      appOrigin: origin,
      operation: "provider-failure-retry",
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockRejectedValue(new Error("private token details")),
      execute: vi.fn(),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("staging_verification_token_invalid");
    expect(serialized).not.toContain("private token details");
  });

  it("returns a safe service failure after ticket consumption without leaking runtime details", async () => {
    const response = await handleStagingVerificationExecution({
      request: request(
        "/api/staging-verification/reconciliation",
        body,
        `${stagingVerificationCookieName}=${"d".repeat(43)}`,
      ),
      appOrigin: origin,
      operation: "reconciliation",
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockRejectedValue(new Error("private provider and database details")),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":{"code":"staging_verification_failed"}}',
    );
  });
});
