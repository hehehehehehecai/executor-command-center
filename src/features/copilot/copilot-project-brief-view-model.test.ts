import { describe, expect, it } from "vitest";

import {
  syntheticBriefProjectId,
  syntheticEvidenceRef,
  syntheticProjectBrief,
} from "@/testing/project-brief/project-brief-fixture";

import {
  createCopilotProjectBriefViewModel,
  evidenceNavigationHref,
  evidenceReferenceId,
  safeEvidenceOriginalHref,
} from "./copilot-project-brief-view-model";

describe("Copilot Project Brief view model", () => {
  it("T11 来源详情仅合并当前白名单，展示时间并拒绝任意外链", () => {
    const brief = syntheticProjectBrief();
    const ref = brief.summary.evidenceRefs[0];
    const id = evidenceReferenceId(ref);
    const result = createCopilotProjectBriefViewModel(brief, {
      briefId: "30000000-0000-4000-8000-000000000003", mode: "connected", selectedEvidence: id,
      generatedAt: "2026-10-10T09:00:00.000Z",
      evidenceDetails: [{ ...ref, referenceId: id, href: null, summary: "已持久化的活动摘要", occurredAt: "2026-10-10T08:00:00.000Z", originalHref: "https://github.com/owner/repo/issues/42", relationship: "摘要依据" },
        { ...ref, referenceId: "not-in-current-brief", href: null, summary: "不能显示" }],
    });
    expect(result.generatedAt).toBe("2026-10-10T09:00:00.000Z");
    expect(result.selectedEvidence).toMatchObject({ summary: "已持久化的活动摘要", occurredAt: "2026-10-10T08:00:00.000Z", originalHref: "https://github.com/owner/repo/issues/42" });
    expect(result.evidenceSources.some(item => item.summary === "不能显示")).toBe(false);
    for (const href of ["javascript:alert(1)", "https://evil.invalid/owner/repo/issues/42", "https://user@github.com/owner/repo/issues/42", "https://github.com/owner/repo/issues/42?next=https://evil.invalid"]) expect(safeEvidenceOriginalHref(href)).toBeNull();
  });
  it("keeps the frozen section order and explicit empty states", () => {
    const result = createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
      briefId: "30000000-0000-4000-8000-000000000003",
      mode: "preview",
      selectedEvidence: null,
    });

    expect(result.sections.map(({ id }) => id)).toEqual([
      "completedChanges",
      "ongoingWork",
      "openItems",
      "riskSignals",
      "unknowns",
    ]);
    expect(result.sections.find(({ id }) => id === "openItems")).toMatchObject({
      empty: true,
      emptyMessage: "暂无待处理事项",
    });
    expect(result.freshness).toEqual({
      status: "fresh",
      evaluatedAt: "2026-08-18T01:00:00.000Z",
      lastSuccessfulAt: "2026-08-18T00:30:00.000Z",
      coverageComplete: true,
      evidence: expect.any(Array),
    });
    expect(result.boundaryNote).toContain("bounded Evidence Snapshot");
  });

  it("builds encoded same-page Evidence links from an allowlisted stable alignment ID", () => {
    const ref = syntheticEvidenceRef("github_issue", "issue:42 / ? & 中文");
    const id = evidenceReferenceId(ref);
    const href = evidenceNavigationHref(ref, "connected");
    const url = new URL(href ?? "", "https://executor.example.test");

    expect(JSON.parse(id)).toEqual([ref.sourceKind, ref.sourceId, ref.projectId]);
    expect(url.pathname).toBe("/copilot");
    expect(url.searchParams.get("mode")).toBe("connected");
    expect(url.searchParams.get("projectId")).toBe(syntheticBriefProjectId);
    expect(url.searchParams.get("selectedEvidence")).toBe(id);
    expect(href).not.toContain("issue:42 / ? & 中文");
  });

  it("selects only a current Brief allowlist ref and refuses unknown source kinds or cross-project refs", () => {
    const brief = syntheticProjectBrief();
    const selected = evidenceReferenceId(brief.summary.evidenceRefs[0]);
    expect(createCopilotProjectBriefViewModel(brief, {
      briefId: "30000000-0000-4000-8000-000000000003",
      mode: "connected",
      selectedEvidence: selected,
    }).selectedEvidence).toMatchObject({ sourceId: "issue:42" });

    const crossProject = JSON.stringify(["github_issue", "issue:42", "90000000-0000-4000-8000-000000000009"]);
    expect(createCopilotProjectBriefViewModel(brief, {
      briefId: "30000000-0000-4000-8000-000000000003",
      mode: "connected",
      selectedEvidence: crossProject,
    }).selectedEvidence).toBeNull();
    expect(evidenceNavigationHref({
      ...brief.summary.evidenceRefs[0],
      sourceKind: "unknown_kind",
    } as never, "connected")).toBeNull();
  });
});
