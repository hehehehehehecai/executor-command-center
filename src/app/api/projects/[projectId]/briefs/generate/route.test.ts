// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  syntheticBriefFingerprint,
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefUserId,
  syntheticProjectBrief,
} from "@/testing/project-brief/project-brief-fixture";

const mocks = vi.hoisted(() => ({
  createDependencies: vi.fn(),
  createUseCase: vi.fn(),
  execute: vi.fn(),
  getVerifiedUserId: vi.fn(),
}));

vi.mock("./project-brief-generation-route-dependencies", () => ({
  createProjectBriefGenerationRouteDependencies: mocks.createDependencies,
}));

import { POST, dynamic } from "./route";

function request(body: unknown, headers: Record<string, string> = {
  origin: "https://executor.example.test",
  "content-type": "application/json",
}) {
  return new Request(`https://executor.example.test/api/projects/${syntheticBriefProjectId}/briefs/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const body = {
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-18T00:00:00.000Z",
  requestKey: "brief-ui-request-001",
};

describe("POST /api/projects/{projectId}/briefs/generate", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    vi.clearAllMocks();
    mocks.getVerifiedUserId.mockResolvedValue(syntheticBriefUserId);
    mocks.execute.mockResolvedValue({
      contractVersion: "project-brief-generation.v1",
      status: "generated",
      energyCharged: 3,
      briefId: syntheticBriefId,
      invocationId: "40000000-0000-4000-8000-000000000004",
      evidenceFingerprint: syntheticBriefFingerprint,
      brief: syntheticProjectBrief(),
    });
    mocks.createDependencies.mockResolvedValue({
      session: { getVerifiedUserId: mocks.getVerifiedUserId },
      createUseCase: mocks.createUseCase,
      clock: { now: () => new Date("2026-08-18T06:00:00.000Z") },
    });
    mocks.createUseCase.mockReturnValue({ execute: mocks.execute });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["generated", 3],
    ["cache_hit", 0],
  ])("returns only the user-visible %s outcome with %i charged points", async (status, energyCharged) => {
    mocks.execute.mockResolvedValueOnce({
      contractVersion: "project-brief-generation.v1",
      status,
      energyCharged,
      briefId: syntheticBriefId,
      invocationId: status === "generated" ? "40000000-0000-4000-8000-000000000004" : null,
      evidenceFingerprint: syntheticBriefFingerprint,
      brief: syntheticProjectBrief(),
    });
    const response = await POST(request(body), {
      params: Promise.resolve({ projectId: syntheticBriefProjectId }),
    });

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status, energyCharged });
    expect(mocks.execute).toHaveBeenCalledWith({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      rangeStart: body.rangeStart,
      rangeEnd: body.rangeEnd,
      requestKey: body.requestKey,
      now: "2026-08-18T06:00:00.000Z",
      businessDate: "2026-08-18",
    });
  });

  it.each([
    ["missing Origin", { "content-type": "application/json" }, body, 403, "origin_forbidden"],
    ["foreign Origin", { origin: "https://attacker.test", "content-type": "application/json" }, body, 403, "origin_forbidden"],
    ["non JSON", { origin: "https://executor.example.test", "content-type": "text/plain" }, body, 400, "invalid_request"],
    ["authority injection", { origin: "https://executor.example.test", "content-type": "application/json" }, { ...body, userId: "attacker" }, 400, "invalid_request"],
  ])("rejects %s before dependency construction", async (_caseId, headers, value, status, code) => {
    const response = await POST(request(value, headers), {
      params: Promise.resolve({ projectId: syntheticBriefProjectId }),
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });

  it("returns unauthenticated without constructing the user-bound Use Case", async () => {
    mocks.getVerifiedUserId.mockResolvedValueOnce(null);
    const response = await POST(request(body), {
      params: Promise.resolve({ projectId: syntheticBriefProjectId }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthenticated" } });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.createUseCase).not.toHaveBeenCalled();
  });

  it("cancels an oversized streaming body before dependency construction", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(16_385)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const oversized = new Request(
      `https://executor.example.test/api/projects/${syntheticBriefProjectId}/briefs/generate`,
      {
        method: "POST",
        headers: {
          origin: "https://executor.example.test",
          "content-type": "application/json",
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    const response = await POST(oversized, {
      params: Promise.resolve({ projectId: syntheticBriefProjectId }),
    });
    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });

  it.each([
    ["project_brief_generation_invalid_request", 400],
    ["project_brief_authorization_failed", 403],
    ["project_brief_quota_reservation_failed", 402],
    ["project_brief_provider_failure", 502],
    ["project_brief_empty_output", 502],
    ["project_brief_parse_failure", 502],
    ["project_brief_evidence_validation_failed", 422],
    ["project_brief_idempotency_conflict", 409],
    ["reservation_release_failed", 503],
  ])("maps %s to a stable safe response", async (code, status) => {
    mocks.execute.mockRejectedValueOnce(Object.assign(new Error("private details"), { code }));
    const response = await POST(request(body), {
      params: Promise.resolve({ projectId: syntheticBriefProjectId }),
    });
    expect(response.status).toBe(status);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain(code);
    expect(serialized).not.toContain("private details");
  });
});
