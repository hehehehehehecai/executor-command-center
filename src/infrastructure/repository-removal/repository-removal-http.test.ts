// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  handleRepositoryRemoval,
  repositoryRemovalFailureContract,
  repositoryRemovalHttpContract,
} from "./repository-removal-http";

const appOrigin = "https://executor.example.test";
const projectId = "22222222-2222-4222-8222-222222222222";
const body = {
  projectId,
  mode: "REMOVE_REPOSITORY_DATA" as const,
  idempotencyKey: "phase6-http:request-1",
  confirmation: { projectId, text: `REMOVE ${projectId}` },
};
const operation = {
  operationId: "33333333-3333-4333-8333-333333333333",
  projectId,
  mode: "REMOVE_REPOSITORY_DATA" as const,
  status: "completed" as const,
  outcome: "executed" as const,
  counts: {
    deleted: { github_commits: 1 },
    preserved: { projects: 1 },
    invalidated: { evidence_links: 1 },
  },
  safelyRetryable: true as const,
  completedAt: "2026-08-24T09:00:00.000Z",
};

function post(
  payload: unknown = body,
  origin = appOrigin,
  contentType = "application/json",
) {
  return new Request(
    `${appOrigin}/api/projects/${projectId}/repository-removal`,
    {
      method: "POST",
      headers: { origin, "content-type": contentType },
      body: JSON.stringify(payload),
    },
  );
}

describe("repository-removal-http.v1", () => {
  it("accepts one exact same-origin command and returns private completion data", async () => {
    const execute = vi.fn(async () => operation);
    const response = await handleRepositoryRemoval({
      request: post(),
      routeProjectId: projectId,
      appOrigin,
      execute,
    });

    expect(repositoryRemovalHttpContract).toBe("repository-removal-http.v1");
    expect(repositoryRemovalFailureContract).toBe(
      "repository-removal-failure.v1",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(execute).toHaveBeenCalledWith(body);
    await expect(response.json()).resolves.toEqual({ operation });
  });

  it.each([
    [{ ...body, projectId: "44444444-4444-4444-8444-444444444444" }, 400],
    [{ ...body, unknown: true }, 400],
    [{ ...body, confirmation: { ...body.confirmation, text: "REMOVE" } }, 400],
  ])("rejects unbound or non-strict JSON before execution", async (payload, status) => {
    const execute = vi.fn();
    const response = await handleRepositoryRemoval({
      request: post(payload),
      routeProjectId: projectId,
      appOrigin,
      execute,
    });
    expect(response.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [post(body, "https://evil.example.test"), 403],
    [post(body, appOrigin, "text/plain"), 400],
  ])("enforces same-origin strict JSON", async (request, status) => {
    const execute = vi.fn();
    const response = await handleRepositoryRemoval({
      request,
      routeProjectId: projectId,
      appOrigin,
      execute,
    });
    expect(response.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before execution", async () => {
    const execute = vi.fn();
    const response = await handleRepositoryRemoval({
      request: post({ ...body, padding: "x".repeat(9_000) }),
      routeProjectId: projectId,
      appOrigin,
      execute,
    });

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["repository_removal_unauthenticated", 401],
    ["repository_removal_invalid_request", 400],
    ["repository_removal_confirmation_mismatch", 400],
    ["repository_removal_not_found", 404],
    ["repository_removal_conflict", 409],
    ["repository_removal_precondition_failed", 412],
    ["repository_removal_retryable_job_conflict", 423],
    ["repository_removal_configuration_missing", 503],
    ["repository_removal_storage_failed", 503],
    ["database-secret-sentinel", 503],
  ])("maps %s to safe HTTP %i", async (code, status) => {
    const response = await handleRepositoryRemoval({
      request: post(),
      routeProjectId: projectId,
      appOrigin,
      execute: async () => {
        throw new Error(code);
      },
    });
    const serialized = JSON.stringify(await response.json());
    expect(response.status).toBe(status);
    expect(serialized).not.toContain("database-secret-sentinel");
    expect(serialized).not.toMatch(/service_role|authorization|cookie|sql|stack/i);
    expect(serialized).not.toContain(`REMOVE ${projectId}`);
    expect(serialized).not.toContain('"confirmation":');
  });
});
