// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("is dynamic and delegates only project, request identity and injected time", async () => {
    const response = await POST(
      new Request("https://executor.example.test/api/projects/x/resync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: "manual-request-001" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(202);
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: "manual-request-001", userId: "attacker" }),
      }),
      { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });
});
