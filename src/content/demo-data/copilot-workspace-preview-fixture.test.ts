import { describe, expect, it } from "vitest";

import {
  createCopilotContext,
  transitionCopilotContext,
  updateCopilotEvidenceReferences,
} from "@/features/copilot";

import {
  copilotWorkspacePreviewFixture,
  loadCopilotWorkspacePreviewFixture,
} from "./copilot-workspace-preview-fixture";

describe("Copilot Workspace Preview fixture", () => {
  it("is fictional, local, network-free and model-free", () => {
    expect(copilotWorkspacePreviewFixture.metadata).toEqual({
      fixtureVersion: "copilot-workspace-preview.v1",
      disclosure: "演示数据 · 完全虚构",
      usesRealUserData: false,
      requiresNetwork: false,
      invokesModel: false,
      containsModelOutput: false,
    });
    expect(copilotWorkspacePreviewFixture.cases.default.projectBrief?.status).toBe("ready");
    const readyBrief = copilotWorkspacePreviewFixture.cases.default.projectBrief;
    expect(readyBrief?.status === "ready" ? readyBrief.brief.projectId : null).toBe(
      copilotWorkspacePreviewFixture.cases.default.context.projectId,
    );
    expect(copilotWorkspacePreviewFixture.followUpCases.success.status).toBe("answered");
    expect(copilotWorkspacePreviewFixture.followUpCases.rejected.code).toBe(
      "follow_up_out_of_scope",
    );
  });

  it("loads the stable default Preview source", async () => {
    await expect(loadCopilotWorkspacePreviewFixture()).resolves.toEqual(
      copilotWorkspacePreviewFixture.cases.default,
    );
  });

  it("covers identity retention, feature/project clearing, null and dedup cases", () => {
    const cases = copilotWorkspacePreviewFixture.transitionCases;

    expect(
      transitionCopilotContext(
        createCopilotContext(cases.sameIdentity.current),
        cases.sameIdentity.nextIdentity,
      ),
    ).toMatchObject({
      reason: "identity_unchanged",
      context: { evidenceReferenceIds: ["evidence-goal"] },
    });
    expect(
      transitionCopilotContext(
        createCopilotContext(cases.featureSwitch.current),
        cases.featureSwitch.nextIdentity,
      ),
    ).toMatchObject({
      reason: "feature_changed",
      context: { evidenceReferenceIds: [] },
    });
    expect(
      transitionCopilotContext(
        createCopilotContext(cases.projectSwitch.current),
        cases.projectSwitch.nextIdentity,
      ),
    ).toMatchObject({
      reason: "project_changed",
      context: { evidenceReferenceIds: [] },
    });
    expect(
      transitionCopilotContext(
        createCopilotContext(cases.nullProject.current),
        cases.nullProject.nextIdentity,
      ).context,
    ).toMatchObject({ projectId: null, evidenceReferenceIds: [] });
    expect(
      updateCopilotEvidenceReferences(
        createCopilotContext(cases.duplicateEvidence.current),
        cases.duplicateEvidence.evidenceReferenceIds,
      ).context.evidenceReferenceIds,
    ).toEqual(["evidence-goal", "evidence-decision"]);
  });

  it("includes unknown-feature and empty-context fail-closed cases", () => {
    expect(copilotWorkspacePreviewFixture.actionCases.unknownFeature).toEqual({
      featureId: "unknown-feature",
      projectId: "20000000-0000-4000-8000-000000000002",
    });
    expect(copilotWorkspacePreviewFixture.cases.empty.context).toEqual({
      featureId: "copilot",
      projectId: null,
      evidenceReferenceIds: [],
    });
    expect(copilotWorkspacePreviewFixture.cases.empty.projectBrief).toMatchObject({
      status: "not_found",
    });
    expect(copilotWorkspacePreviewFixture.cases.stale.projectBrief).toMatchObject({
      status: "expired",
    });
  });
});
