import { describe, expect, it, vi } from "vitest";

import type { ProjectBriefRecord } from "@/domain/project-brief/project-brief";
import {
  syntheticBriefEvaluatedAt,
  syntheticBriefFingerprint,
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefRangeEnd,
  syntheticBriefRangeStart,
  syntheticBriefUserId,
  syntheticProjectBrief,
} from "@/testing/project-brief/project-brief-fixture";

import {
  LoadValidatedProjectBriefUseCase,
  ProjectBriefDisplayError,
} from "./load-validated-project-brief";

function record(overrides: Partial<ProjectBriefRecord> = {}): ProjectBriefRecord {
  return {
    id: syntheticBriefId,
    projectId: syntheticBriefProjectId,
    rangeStart: syntheticBriefRangeStart,
    rangeEnd: syntheticBriefRangeEnd,
    promptVersion: "project-brief-v1",
    schemaVersion: "project-brief-schema-v1",
    evidenceFingerprint: syntheticBriefFingerprint,
    status: "completed",
    payload: syntheticProjectBrief() as unknown as Readonly<Record<string, unknown>>,
    failureStage: null,
    errorCode: null,
    createdAt: "2026-08-18T01:00:00.000Z",
    completedAt: "2026-08-18T01:01:00.000Z",
    expiresAt: "2026-08-19T01:00:00.000Z",
    ...overrides,
  };
}

function harness(records: readonly ProjectBriefRecord[] = [record()]) {
  const artifact = { snapshot: {}, canonicalPayload: "{}", fingerprint: syntheticBriefFingerprint };
  const listForProject = vi.fn().mockResolvedValue(records);
  const build = vi.fn().mockResolvedValue(artifact);
  const validate = vi.fn().mockResolvedValue({ status: "valid" });
  return {
    listForProject,
    build,
    validate,
    artifact,
    useCase: new LoadValidatedProjectBriefUseCase({
      reader: { listForProject },
      evidenceBuilder: { execute: build },
      evidenceValidator: { execute: validate },
    }),
  };
}

const input = {
  actorUserId: syntheticBriefUserId,
  projectId: syntheticBriefProjectId,
  now: "2026-08-18T06:00:00.000Z",
};

describe("LoadValidatedProjectBriefUseCase", () => {
  it("selects the latest non-expired Completed row with deterministic tie breakers", async () => {
    const older = record({
      id: "30000000-0000-4000-8000-000000000004",
      completedAt: "2026-08-18T00:00:00.000Z",
    });
    const tieAfter = record({ id: "f0000000-0000-4000-8000-000000000005" });
    const h = harness([older, tieAfter, record()]);

    await expect(h.useCase.execute(input)).resolves.toMatchObject({
      briefId: syntheticBriefId,
      brief: syntheticProjectBrief(),
      artifact: h.artifact,
    });
    expect(h.build).toHaveBeenCalledWith({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      rangeStart: syntheticBriefRangeStart,
      rangeEnd: syntheticBriefRangeEnd,
      now: syntheticBriefEvaluatedAt,
    });
    expect(h.validate).toHaveBeenCalledOnce();
  });

  it.each([
    ["no row", [], "brief_not_found"],
    ["only expired", [record({ expiresAt: "2026-08-18T05:59:59.999Z" })], "brief_expired"],
    ["invalid payload", [record({ payload: { arbitrary: true } })], "brief_invalid"],
  ])("fails closed for %s", async (_caseId, records, code) => {
    const h = harness(records as readonly ProjectBriefRecord[]);
    await expect(h.useCase.execute(input)).rejects.toMatchObject({
      name: "ProjectBriefDisplayError",
      code,
    });
  });

  it("maps artifact or Evidence validation failures without leaking their message", async () => {
    const h = harness();
    h.validate.mockRejectedValueOnce(new Error("private source id and payload"));
    const error = await h.useCase.execute(input).catch((value) => value);
    expect(error).toBeInstanceOf(ProjectBriefDisplayError);
    expect(error).toMatchObject({ code: "brief_evidence_validation_failed" });
    expect(JSON.stringify(error)).not.toContain("private source id");
  });
});
