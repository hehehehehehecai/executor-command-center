import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createBoundary: vi.fn(),
  createRuntime: vi.fn(),
  getVerifiedUserId: vi.fn(),
  assertTarget: vi.fn(),
  issue: vi.fn(),
  consume: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/app/api/staging-verification/staging-verification-route-dependencies", () => ({
  createStagingVerificationBoundary: routeMocks.createBoundary,
  createStagingVerificationRuntime: routeMocks.createRuntime,
}));

import { POST as executeRoute } from "@/app/api/staging-verification/[operation]/route";
import { POST as issueRoute } from "@/app/api/staging-verification/[operation]/ticket/route";

import {
  handleStagingVerificationExecution,
  handleStagingVerificationTicketIssue,
  stagingVerificationCookieName,
} from "./staging-verification-http";

const origin = "https://staging.example.test";
const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "e56ce489-4ad2-4490-975b-08e875ae81d3";
const archivedProjectId = "22222222-2222-4222-8222-222222222222";
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

function formRequest(path: string, entries: readonly (readonly [string, string])[]) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(entries.map(([key, value]) => [key, value])),
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
      expectedProjectId: projectId,
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

  it("accepts a same-origin browser form without weakening ticket issuance", async () => {
    const issue = vi.fn().mockResolvedValue({
      contractVersion: "staging-verification.v1",
      rawToken: "f".repeat(43),
      caseId: body.caseId,
      projectId,
      operation: "webhook-replay",
    });
    const response = await handleStagingVerificationTicketIssue({
      request: formRequest("/api/staging-verification/webhook-replay/ticket", [
        ["projectId", projectId],
        ["caseId", body.caseId],
      ]),
      appOrigin: origin,
      operation: "webhook-replay",
      expectedProjectId: projectId,
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      issue,
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(issue).toHaveBeenCalledWith({
      userId,
      projectId,
      caseId: body.caseId,
      operation: "webhook-replay",
    });
  });

  it("rejects duplicate browser form fields before authentication or persistence", async () => {
    const getVerifiedUserId = vi.fn();
    const issue = vi.fn();
    const response = await handleStagingVerificationTicketIssue({
      request: formRequest("/api/staging-verification/webhook-replay/ticket", [
        ["projectId", projectId],
        ["projectId", "33333333-3333-4333-8333-333333333333"],
        ["caseId", body.caseId],
      ]),
      appOrigin: origin,
      operation: "webhook-replay",
      expectedProjectId: projectId,
      getVerifiedUserId,
      authorize: vi.fn(),
      issue,
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "staging_verification_request_invalid" },
    });
    expect(getVerifiedUserId).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
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
      expectedProjectId: projectId,
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

  it("executes from a same-origin browser form while preserving one-time cookie consumption", async () => {
    const consume = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ result: "completed", runId: "form-run-id" });
    const form = formRequest("/api/staging-verification/reconciliation", [
      ["projectId", projectId],
      ["caseId", body.caseId],
    ]);
    form.headers.set("cookie", `${stagingVerificationCookieName}=${"e".repeat(43)}`);
    const response = await handleStagingVerificationExecution({
      request: form,
      appOrigin: origin,
      operation: "reconciliation",
      expectedProjectId: projectId,
      getVerifiedUserId: async () => userId,
      authorize: vi.fn().mockResolvedValue(undefined),
      consume,
      execute,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(consume).toHaveBeenCalledWith({
      userId,
      projectId,
      caseId: body.caseId,
      operation: "reconciliation",
      rawToken: "e".repeat(43),
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
      expectedProjectId: projectId,
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
      expectedProjectId: projectId,
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
      expectedProjectId: projectId,
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

describe("staging verification route fixed-project binding", () => {
  const configuredTarget = {
    projectId,
    installationId: 157171025,
    repositoryFullName: "hecaitest1/executor-stage6-staging-fixture",
  } as const;
  const authorizedTarget = { ...configuredTarget, repositoryId: 1348250652 } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.getVerifiedUserId.mockResolvedValue(userId);
    routeMocks.assertTarget.mockResolvedValue(authorizedTarget);
    routeMocks.issue.mockResolvedValue({
      contractVersion: "staging-verification.v1",
      rawToken: "a".repeat(43),
      caseId: body.caseId,
      projectId,
      operation: "webhook-replay",
    });
    routeMocks.consume.mockResolvedValue(undefined);
    routeMocks.execute.mockResolvedValue({ result: "completed", runId: "fixed-project-run" });
    routeMocks.createRuntime.mockResolvedValue({ execute: routeMocks.execute });
    routeMocks.createBoundary.mockResolvedValue({
      environment: { APP_ORIGIN: origin },
      target: configuredTarget,
      session: { getVerifiedUserId: routeMocks.getVerifiedUserId },
      authorizer: { assertTarget: routeMocks.assertTarget },
      issue: { execute: routeMocks.issue },
      consume: { execute: routeMocks.consume },
    });
  });

  it("rejects an archived same-owner JSON ticket target before session, authorization, or issue", async () => {
    const response = await issueRoute(
      request(
        "/api/staging-verification/webhook-replay/ticket",
        { projectId: archivedProjectId, caseId: body.caseId },
      ),
      { params: Promise.resolve({ operation: "webhook-replay" }) },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "staging_verification_forbidden" },
    });
    expect(routeMocks.getVerifiedUserId).not.toHaveBeenCalled();
    expect(routeMocks.assertTarget).not.toHaveBeenCalled();
    expect(routeMocks.issue).not.toHaveBeenCalled();
  });

  it("rejects an archived same-owner form execution before session, authorization, consume, or execute", async () => {
    const input = formRequest("/api/staging-verification/reconciliation", [
      ["projectId", archivedProjectId],
      ["caseId", body.caseId],
    ]);
    input.headers.set("cookie", `${stagingVerificationCookieName}=${"b".repeat(43)}`);
    const response = await executeRoute(input, {
      params: Promise.resolve({ operation: "reconciliation" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "staging_verification_forbidden" },
    });
    expect(routeMocks.getVerifiedUserId).not.toHaveBeenCalled();
    expect(routeMocks.assertTarget).not.toHaveBeenCalled();
    expect(routeMocks.consume).not.toHaveBeenCalled();
    expect(routeMocks.createRuntime).not.toHaveBeenCalled();
    expect(routeMocks.execute).not.toHaveBeenCalled();
  });

  it("issues a browser-form ticket only for the platform-fixed project target", async () => {
    const response = await issueRoute(
      formRequest("/api/staging-verification/webhook-replay/ticket", [
        ["projectId", projectId],
        ["caseId", body.caseId],
      ]),
      { params: Promise.resolve({ operation: "webhook-replay" }) },
    );
    expect(response.status).toBe(201);
    expect(routeMocks.assertTarget).toHaveBeenCalledWith({
      userId,
      expected: configuredTarget,
    });
    expect(routeMocks.issue).toHaveBeenCalledWith({
      userId,
      projectId,
      caseId: body.caseId,
      operation: "webhook-replay",
    });
  });

  it("consumes and executes JSON only with the platform-fixed runtime target", async () => {
    const input = request(
      "/api/staging-verification/reconciliation",
      body,
      `${stagingVerificationCookieName}=${"b".repeat(43)}`,
    );
    const response = await executeRoute(input, {
      params: Promise.resolve({ operation: "reconciliation" }),
    });
    expect(response.status).toBe(200);
    expect(routeMocks.assertTarget).toHaveBeenCalledWith({
      userId,
      expected: configuredTarget,
    });
    expect(routeMocks.consume).toHaveBeenCalledWith({
      userId,
      projectId,
      caseId: body.caseId,
      operation: "reconciliation",
      rawToken: "b".repeat(43),
    });
    expect(routeMocks.createRuntime).toHaveBeenCalledWith({
      userId,
      responseHeaders: expect.any(Headers),
      target: configuredTarget,
      repositoryId: 1348250652,
    });
    expect(routeMocks.execute).toHaveBeenCalledOnce();
  });
});
