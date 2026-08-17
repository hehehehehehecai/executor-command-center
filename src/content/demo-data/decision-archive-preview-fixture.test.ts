import { describe, expect, it } from "vitest";

import {
  decisionArchivePreviewFixture,
  loadDecisionArchivePreviewFixture,
} from "./decision-archive-preview-fixture";

describe("Decision Archive Preview fixture", () => {
  it("is versioned, completely fictional, model-free and network-free", async () => {
    expect(decisionArchivePreviewFixture.metadata).toEqual({
      fixtureVersion: "decision-archive-preview.v1",
      disclosure: "演示数据 · 完全虚构",
      usesRealUserData: false,
      requiresNetwork: false,
      invokesModel: false,
    });
    await expect(loadDecisionArchivePreviewFixture()).resolves.toEqual(
      decisionArchivePreviewFixture.cases.default,
    );
  });

  it("covers candidates, manual and confirmed records, empty sets and failure inputs", () => {
    const fixture = decisionArchivePreviewFixture;

    expect(fixture.cases.default.candidates.length).toBeGreaterThan(1);
    expect(fixture.cases.default.records.map(({ createdVia }) => createdVia)).toEqual([
      "manual",
      "candidate_confirmation",
    ]);
    expect(fixture.cases.noCandidates.candidates).toEqual([]);
    expect(fixture.cases.noRecords.records).toEqual([]);
    expect(fixture.actionCases.emptyReason.confirmationReason).toBe("   ");
    expect(fixture.actionCases.duplicateConfirmation.candidateId).toBe(
      "candidate-confirmed",
    );
    expect(fixture.localActionContext).toEqual({
      recordId: "record-local-preview",
      actorId: "preview-captain",
      occurredAt: "2026-08-17T14:00:00.000Z",
    });
  });
});
