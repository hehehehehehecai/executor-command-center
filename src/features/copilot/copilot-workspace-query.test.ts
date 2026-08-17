import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PanelQuery } from "@/shared/panel-query";

import {
  createCopilotWorkspaceConnectedQuery,
  createCopilotWorkspacePreviewQuery,
  resolveCopilotWorkspaceQuery,
  type CopilotWorkspaceConnectedPort,
} from "./copilot-workspace-query";
import type {
  CopilotWorkspaceSource,
  CopilotWorkspaceViewModel,
} from "./copilot-workspace-view-model";

function source(provenanceLabel: string): CopilotWorkspaceSource {
  return {
    provenanceLabel,
    context: {
      featureId: "copilot",
      projectId: null,
      evidenceReferenceIds: [],
    },
    lastTransitionReason: "initialized",
  };
}

describe("Copilot Workspace queries", () => {
  it("implements the same PanelQuery<ViewModel> contract for both modes", () => {
    const previewQuery = createCopilotWorkspacePreviewQuery(async () =>
      source("Preview loader"),
    );
    const connectedQuery = createCopilotWorkspaceConnectedQuery({
      load: async () => source("Connected port"),
    });

    expectTypeOf(previewQuery).toEqualTypeOf<
      PanelQuery<CopilotWorkspaceViewModel>
    >();
    expectTypeOf(connectedQuery).toEqualTypeOf<
      PanelQuery<CopilotWorkspaceViewModel>
    >();
  });

  it("loads Preview from the local loader without calling Connected", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: CopilotWorkspaceConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    await expect(
      resolveCopilotWorkspaceQuery("preview", {
        previewLoader,
        connectedPort,
      }).load(),
    ).resolves.toMatchObject({
      mode: "preview",
      provenanceLabel: "Preview loader",
    });
    expect(previewLoader).toHaveBeenCalledOnce();
    expect(connectedPort.load).not.toHaveBeenCalled();
  });

  it("loads Connected only through the injected port", async () => {
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: CopilotWorkspaceConnectedPort = {
      load: vi.fn(async () => source("Connected port")),
    };

    await expect(
      resolveCopilotWorkspaceQuery("connected", {
        previewLoader,
        connectedPort,
      }).load(),
    ).resolves.toMatchObject({
      mode: "connected",
      provenanceLabel: "Connected port",
    });
    expect(connectedPort.load).toHaveBeenCalledOnce();
    expect(previewLoader).not.toHaveBeenCalled();
  });

  it("keeps Connected failure observable without Preview fallback", async () => {
    const failure = new Error("copilot_connected_unavailable");
    const previewLoader = vi.fn(async () => source("Preview loader"));
    const connectedPort: CopilotWorkspaceConnectedPort = {
      load: vi.fn(async () => Promise.reject(failure)),
    };

    await expect(
      resolveCopilotWorkspaceQuery("connected", {
        previewLoader,
        connectedPort,
      }).load(),
    ).rejects.toBe(failure);
    expect(previewLoader).not.toHaveBeenCalled();
  });
});
