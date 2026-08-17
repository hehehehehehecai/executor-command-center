import { describe, expect, it } from "vitest";

import { loadCopilotWorkspacePreviewFixture } from "./copilot-workspace-preview-fixture";
import { loadDecisionArchivePreviewFixture } from "./decision-archive-preview-fixture";
import { loadFlightLogPreviewFixture } from "./flight-log-preview-fixture";
import { loadMissionControlPreviewFixture } from "./mission-control-preview-fixture";
import { loadProjectGalaxyPreviewFixture } from "./project-galaxy-preview-fixture";

describe("five-panel Preview fixture isolation", () => {
  it("returns independent Project Galaxy case copies", async () => {
    const first = await loadProjectGalaxyPreviewFixture();
    const second = await loadProjectGalaxyPreviewFixture();

    expect(first).not.toBe(second);
    expect(first.project).not.toBe(second.project);
    expect(first.activity).not.toBe(second.activity);
  });

  it("returns independent Flight Log case copies", async () => {
    const first = await loadFlightLogPreviewFixture();
    const second = await loadFlightLogPreviewFixture();

    expect(first).not.toBe(second);
    expect(first.events).not.toBe(second.events);
  });

  it("returns independent Mission Control case copies", async () => {
    const first = await loadMissionControlPreviewFixture();
    const second = await loadMissionControlPreviewFixture();

    expect(first).not.toBe(second);
    expect(first.recordedTasks).not.toBe(second.recordedTasks);
    expect(first.suggestions).not.toBe(second.suggestions);
  });

  it("returns independent Decision Archive case copies", async () => {
    const first = await loadDecisionArchivePreviewFixture();
    const second = await loadDecisionArchivePreviewFixture();

    expect(first).not.toBe(second);
    expect(first.candidates).not.toBe(second.candidates);
    expect(first.records).not.toBe(second.records);
  });

  it("returns independent Copilot case copies", async () => {
    const first = await loadCopilotWorkspacePreviewFixture();
    const second = await loadCopilotWorkspacePreviewFixture();

    expect(first).not.toBe(second);
    expect(first.context).not.toBe(second.context);
    expect(first.context.evidenceReferenceIds).not.toBe(
      second.context.evidenceReferenceIds,
    );
  });
});
