// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUseCase: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("./repository-removal-route-dependencies", () => ({
  createRepositoryRemovalUseCase: mocks.createUseCase,
}));

import { POST, dynamic } from "./route";

const projectId = "22222222-2222-4222-8222-222222222222";
const command = {
  projectId,
  mode: "REMOVE_REPOSITORY_DATA",
  idempotencyKey: "phase6-route:request-1",
  confirmation: { projectId, text: `REMOVE ${projectId}` },
} as const;
const operation = {
  operationId: "33333333-3333-4333-8333-333333333333",
  projectId,
  mode: "REMOVE_REPOSITORY_DATA",
  status: "completed",
  outcome: "executed",
  counts: {
    deleted: { github_commits: 1 },
    preserved: { projects: 1 },
    invalidated: { evidence_links: 1 },
  },
  safelyRetryable: true,
  completedAt: "2026-08-24T09:00:00.000Z",
} as const;

function request(payload: unknown = command) {
  return new Request(
    `https://executor.example.test/api/projects/${projectId}/repository-removal`,
    {
      method: "POST",
      headers: {
        origin: "https://executor.example.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

describe("POST /api/projects/{projectId}/repository-removal", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(operation);
    mocks.createUseCase.mockResolvedValue({ execute: mocks.execute });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("routes one verified application use case and exposes only the result", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ projectId }),
    });
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(mocks.createUseCase).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith(command);
    await expect(response.json()).resolves.toEqual({ operation });
  });

  it("rejects a forged route/body project mismatch before constructing dependencies", async () => {
    const response = await POST(
      request({
        ...command,
        projectId: "44444444-4444-4444-8444-444444444444",
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.createUseCase).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
