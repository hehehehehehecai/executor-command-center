// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefUserId,
} from "@/testing/project-brief/project-brief-fixture";

const mocks = vi.hoisted(() => ({
  createDependencies: vi.fn(),
  execute: vi.fn(),
  getVerifiedUserId: vi.fn(),
}));

vi.mock("./project-brief-follow-up-route-dependencies", () => ({
  createProjectBriefFollowUpRouteDependencies: mocks.createDependencies,
}));

import { POST } from "./route";

function request(body: unknown, origin = "https://executor.example.test") {
  return new Request("https://executor.example.test/api/projects/x/briefs/y/follow-up", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const body = {
  question: "当前简报有哪些风险？",
  evidenceReferenceIds: [],
};

const context = {
  params: Promise.resolve({
    projectId: syntheticBriefProjectId,
    briefId: syntheticBriefId,
  }),
};

describe("POST Project Brief follow-up", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    vi.clearAllMocks();
    mocks.getVerifiedUserId.mockResolvedValue(syntheticBriefUserId);
    mocks.execute.mockResolvedValue({
      contractVersion: "project-brief-follow-up.v1",
      schemaVersion: "project-brief-follow-up-schema.v1",
      status: "unknown",
      answer: null,
      evidenceRefs: [],
      unknowns: ["当前 Evidence 无法确认风险。"],
      boundaryNote: "回答仅限当前已验证 Brief 与 Evidence；不使用外部知识、工具或对话历史。",
    });
    mocks.createDependencies.mockResolvedValue({
      session: { getVerifiedUserId: mocks.getVerifiedUserId },
      followUp: { execute: mocks.execute },
      clock: { now: () => new Date("2026-08-18T06:00:00.000Z") },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("passes only route identity, verified user and strict single question", async () => {
    const response = await POST(request(body), context);
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({
      actorUserId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      briefId: syntheticBriefId,
      question: body.question,
      evidenceReferenceIds: [],
      now: "2026-08-18T06:00:00.000Z",
    });
  });

  it.each([
    [{ ...body, messages: [] }, 400, "invalid_request"],
    [{ ...body, question: "" }, 400, "invalid_request"],
    [{ ...body, evidenceReferenceIds: Array.from({ length: 11 }, (_, index) => `ref-${index}`) }, 400, "invalid_request"],
  ])("rejects forbidden or malformed body before dependencies", async (value, status, code) => {
    const response = await POST(request(value), context);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(mocks.createDependencies).not.toHaveBeenCalled();
  });

  it("rejects foreign Origin and unauthenticated session", async () => {
    const foreign = await POST(request(body, "https://attacker.test"), context);
    expect(foreign.status).toBe(403);
    expect(mocks.createDependencies).not.toHaveBeenCalled();

    mocks.getVerifiedUserId.mockResolvedValueOnce(null);
    const anonymous = await POST(request(body), context);
    expect(anonymous.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["follow_up_invalid_request", 400],
    ["follow_up_out_of_scope", 422],
    ["follow_up_evidence_invalid", 422],
    ["follow_up_unavailable", 503],
    ["brief_not_found", 404],
    ["brief_expired", 410],
  ])("maps %s without leaking the internal error", async (code, status) => {
    mocks.execute.mockRejectedValueOnce(Object.assign(new Error("secret prompt and stack"), { code }));
    const response = await POST(request(body), context);
    expect(response.status).toBe(status);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain(code);
    expect(serialized).not.toContain("secret prompt");
  });
});
