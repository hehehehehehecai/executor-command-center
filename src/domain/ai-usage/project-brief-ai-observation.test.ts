import { describe, expect, it } from "vitest";

import {
  createProjectBriefAiObservation,
  parseProjectBriefAiObservation,
  projectBriefAiFailureStages,
  projectBriefAiObservationContractVersion,
} from "./project-brief-ai-observation";

const invocation = {
  id: "50000000-0000-4000-8000-000000000005",
  userId: "10000000-0000-4000-8000-000000000001",
  projectId: "20000000-0000-4000-8000-000000000002",
  feature: "project_brief",
  provider: "deepseek",
  model: "deepseek-chat",
  promptVersion: "project-brief-v1",
  schemaVersion: "project-brief-schema-v1",
  inputFingerprint: "a".repeat(64),
  status: "completed" as const,
  inputTokens: 120,
  outputTokens: 80,
  latencyMs: 450,
  costMicrounits: null,
  cacheStatus: "miss" as const,
  failureStage: null,
  errorCode: null,
  reservationId: "30000000-0000-4000-8000-000000000003",
  briefId: "40000000-0000-4000-8000-000000000004",
  providerRequestId: "provider-request-safe",
  createdAt: "2026-08-21T01:00:00.000Z",
  startedAt: "2026-08-21T01:00:00.000Z",
  completedAt: "2026-08-21T01:00:00.450Z",
};

const reservation = { amount: 3, status: "consumed" as const };
const brief = {
  rangeStart: "2026-08-01T00:00:00.000Z",
  rangeEnd: "2026-08-21T00:00:00.000Z",
};

describe("project Brief AI observation", () => {
  it("freezes the safe contract and canonical failure taxonomy", () => {
    expect(projectBriefAiObservationContractVersion).toBe(
      "project-brief-ai-observation.v1",
    );
    expect(projectBriefAiFailureStages).toEqual([
      "provider", "parse", "schema", "evidence", "persistence",
    ]);
  });

  it("projects a completed cold invocation with honest unknown cost and quota", () => {
    const result = createProjectBriefAiObservation({
      invocation, reservation, brief, cacheKeyFingerprint: "c".repeat(64),
    });
    expect(result).toMatchObject({
      contractVersion: "project-brief-ai-observation.v1",
      observationId: invocation.id,
      correlationId: invocation.reservationId,
      providerRequestId: invocation.providerRequestId,
      briefId: invocation.briefId,
      userId: invocation.userId,
      feature: "project_brief",
      projectId: invocation.projectId,
      provider: "deepseek",
      model: "deepseek-chat",
      promptVersion: "project-brief-v1",
      schemaVersion: "project-brief-schema-v1",
      evidenceFingerprint: invocation.inputFingerprint,
      inputTokens: 120,
      outputTokens: 80,
      latencyMs: 450,
      cost: { amountMicrounits: null, basis: "unavailable" },
      cacheStatus: "miss",
      providerAttempted: true,
      quotaCharge: 3,
      terminalStatus: "completed",
      failureStage: null,
      failureCode: null,
    });
    expect(result.cacheKeyFingerprint).toBe("c".repeat(64));
  });

  it.each([
    ["project_brief_provider_failure", "provider"],
    ["project_brief_empty_output", "provider"],
    ["project_brief_parse_failure", "parse"],
    ["project_brief_schema_validation_failed", "schema"],
    ["project_brief_evidence_validation_failed", "evidence"],
    ["project_brief_persistence_failed", "persistence"],
  ] as const)("maps %s to canonical %s without allowing Completed", (errorCode, stage) => {
    const result = createProjectBriefAiObservation({
      invocation: {
        ...invocation,
        status: "failed",
        briefId: null,
        failureStage: stage === "schema" ? "schema_validation" : "provider",
        errorCode,
      },
      reservation: { amount: 3, status: "released" },
      brief: null,
      cacheKeyFingerprint: null,
    });
    expect(result).toMatchObject({
      terminalStatus: "failed",
      failureStage: stage,
      failureCode: errorCode,
      quotaCharge: 0,
      cacheKeyFingerprint: null,
    });
  });

  it("does not serialize prompts, secrets, raw responses, evidence text or stacks", () => {
    const source = {
      invocation: {
        ...invocation,
        systemPrompt: "PRIVATE_SYSTEM_PROMPT",
        userPrompt: "PRIVATE_USER_PROMPT",
        authorization: "Bearer PRIVATE_SECRET",
        rawResponse: "PRIVATE_PROVIDER_RESPONSE",
        evidenceText: "PRIVATE_EVIDENCE_DOCUMENT",
        stack: "PRIVATE_STACK",
      },
      reservation,
      brief,
      cacheKeyFingerprint: "c".repeat(64),
    } as unknown as Parameters<typeof createProjectBriefAiObservation>[0];
    const serialized = JSON.stringify(createProjectBriefAiObservation(source));
    for (const forbidden of [
      "PRIVATE_SYSTEM_PROMPT", "PRIVATE_USER_PROMPT", "PRIVATE_SECRET",
      "PRIVATE_PROVIDER_RESPONSE", "PRIVATE_EVIDENCE_DOCUMENT", "PRIVATE_STACK",
    ]) expect(serialized).not.toContain(forbidden);

    expect(() => parseProjectBriefAiObservation({
      ...createProjectBriefAiObservation({
        invocation, reservation, brief, cacheKeyFingerprint: "c".repeat(64),
      }),
      rawResponse: "forbidden",
    })).toThrow("project_brief_ai_observation_invalid");
  });
});
