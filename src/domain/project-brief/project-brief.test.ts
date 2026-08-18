import { describe, expect, it } from "vitest";

import {
  canCompleteProjectBrief,
  projectBriefStatuses,
} from "./project-brief";

describe("project-brief-persistence.v1", () => {
  it("keeps the Phase 1 state contract provider-agnostic", () => {
    expect(projectBriefStatuses).toEqual(["pending", "completed", "failed"]);
  });

  it("requires validation lineage before a brief can be completed", () => {
    expect(canCompleteProjectBrief({
      promptVersion: "brief-prompt.v1",
      schemaVersion: "project-brief.v1",
      evidenceFingerprint: "a".repeat(64),
      payload: { summary: "synthetic" },
    })).toBe(true);
    expect(canCompleteProjectBrief({
      promptVersion: null,
      schemaVersion: "project-brief.v1",
      evidenceFingerprint: "a".repeat(64),
      payload: { summary: "synthetic" },
    })).toBe(false);
    expect(canCompleteProjectBrief({
      promptVersion: "brief-prompt.v1",
      schemaVersion: "project-brief.v1",
      evidenceFingerprint: null,
      payload: { summary: "synthetic" },
    })).toBe(false);
    expect(canCompleteProjectBrief({
      promptVersion: "brief-prompt.v1",
      schemaVersion: "project-brief.v1",
      evidenceFingerprint: "a".repeat(64),
      payload: null,
    })).toBe(false);
  });
});
