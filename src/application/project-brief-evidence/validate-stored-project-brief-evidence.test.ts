import { describe, expect, it, vi } from "vitest";

import {
  syntheticBriefFingerprint,
  syntheticBriefId,
  syntheticBriefProjectId,
  syntheticBriefUserId,
  syntheticProjectBrief,
} from "@/testing/project-brief/project-brief-fixture";

import { ValidateStoredProjectBriefEvidenceUseCase } from "./validate-stored-project-brief-evidence";

function harness() {
  const brief = syntheticProjectBrief();
  const receipt = {
    id: "40000000-0000-4000-8000-000000000004",
    userId: syntheticBriefUserId,
    projectId: syntheticBriefProjectId,
    briefId: syntheticBriefId,
    status: "completed" as const,
    cacheStatus: "miss" as const,
    inputFingerprint: syntheticBriefFingerprint,
    promptVersion: brief.promptVersion,
    schemaVersion: brief.schemaVersion,
    reservationId: "50000000-0000-4000-8000-000000000005",
    sourceInvocationId: null,
  };
  const sources = {
    authorizationStatus: "active" as const,
    projectProfile: {
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      sourceId: "profile:odyssey",
      sourceUpdatedAt: "2026-08-18T00:10:00.000Z",
      sourceVersion: "project-calibration.v1",
      coreGoal: "Synthetic core goal",
      currentStageGoal: "Synthetic current goal",
      status: "in_development",
      currentBlocker: null,
    },
    githubActivities: [{
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      sourceKind: "github_issue" as const,
      sourceId: "issue:42",
      occurredAt: "2026-08-18T02:00:00.000Z",
      sourceUpdatedAt: "2026-08-18T02:00:00.000Z",
      sourceVersion: "closed-after-generation",
      summary: "Synthetic issue changed after generation",
      facts: { state: "closed" },
    }],
    authorizedDocuments: [],
    confirmedDecisionsSourceAvailable: false,
    confirmedDecisions: [],
  };
  const listForBrief = vi.fn().mockResolvedValue([receipt]);
  const readSources = vi.fn().mockResolvedValue(sources);
  const readFreshness = vi.fn().mockResolvedValue({
    sourceId: "freshness:odyssey",
    projectId: syntheticBriefProjectId,
    status: "completed",
    finishedAt: brief.freshness.lastSuccessfulAt,
  });
  return {
    brief,
    receipt,
    sources,
    listForBrief,
    readSources,
    readFreshness,
    useCase: new ValidateStoredProjectBriefEvidenceUseCase({
      receiptReader: { listForBrief },
      sourceReader: { read: readSources },
      freshnessReceiptReader: { read: readFreshness },
    }),
  };
}

const input = (brief = syntheticProjectBrief()) => ({
  actorUserId: syntheticBriefUserId,
  projectId: syntheticBriefProjectId,
  briefId: syntheticBriefId,
  brief,
});

describe("ValidateStoredProjectBriefEvidenceUseCase", () => {
  it("accepts a generation-validated historical receipt after a mutable source changes", async () => {
    const h = harness();
    await expect(h.useCase.execute(input(h.brief))).resolves.toEqual({
      contractVersion: "project-brief-evidence-validation.v1",
      status: "valid",
      validatedReferenceCount: 3,
      evidenceFingerprint: syntheticBriefFingerprint,
    });
    expect(h.listForBrief).toHaveBeenCalledWith({
      userId: syntheticBriefUserId,
      projectId: syntheticBriefProjectId,
      briefId: syntheticBriefId,
    });
  });

  it.each([
    ["missing receipt", { receipts: [] }, "evidence_fingerprint_mismatch"],
    ["tampered receipt", { receiptFingerprint: "b".repeat(64) }, "evidence_fingerprint_mismatch"],
    ["revoked installation", { authorizationStatus: "revoked" }, "evidence_permission_revoked"],
    ["deleted source", { activities: [] }, "evidence_source_not_found"],
    ["stale freshness receipt", { freshnessFinishedAt: "2026-08-18T00:29:59.000Z" }, "evidence_outside_period"],
  ])("fails closed for %s", async (_name, mutation, code) => {
    const h = harness();
    if ("receipts" in mutation) h.listForBrief.mockResolvedValueOnce(mutation.receipts);
    if ("receiptFingerprint" in mutation) {
      h.listForBrief.mockResolvedValueOnce([{ ...h.receipt, inputFingerprint: mutation.receiptFingerprint }]);
    }
    if ("authorizationStatus" in mutation) {
      h.readSources.mockResolvedValueOnce({ ...h.sources, authorizationStatus: mutation.authorizationStatus });
    }
    if ("activities" in mutation) {
      h.readSources.mockResolvedValueOnce({ ...h.sources, githubActivities: mutation.activities });
    }
    if ("freshnessFinishedAt" in mutation) {
      h.readFreshness.mockResolvedValueOnce({
        sourceId: "freshness:odyssey",
        projectId: syntheticBriefProjectId,
        status: "completed",
        finishedAt: mutation.freshnessFinishedAt,
      });
    }
    await expect(h.useCase.execute(input(h.brief))).rejects.toMatchObject({ code });
  });

  it("does not recover a document hash mismatch without a persisted per-ref digest", async () => {
    const h = harness();
    const documentRef = {
      ...h.brief.evidenceRefs[1],
      sourceKind: "github_document" as const,
      sourceId: "README.md",
    };
    const brief = {
      ...h.brief,
      evidenceRefs: [h.brief.evidenceRefs[0], documentRef, h.brief.evidenceRefs[2]],
    };
    await expect(h.useCase.execute(input(brief))).rejects.toMatchObject({
      code: "evidence_document_sha_mismatch",
    });
  });

  it("fails closed when an evidence ref crosses the project boundary", async () => {
    const h = harness();
    const brief = {
      ...h.brief,
      evidenceRefs: h.brief.evidenceRefs.map((ref, index) => index === 1
        ? { ...ref, projectId: "90000000-0000-4000-8000-000000000009" }
        : ref),
    };
    await expect(h.useCase.execute(input(brief))).rejects.toMatchObject({
      code: "evidence_wrong_project",
    });
  });
});
