import { describe, expect, expectTypeOf, it } from "vitest";

import type { PanelMode } from "@/shared/panel-query";

import type { CopilotContext } from "./copilot-context";
import {
  createCopilotWorkspaceViewModel,
  type CopilotWorkspaceSource,
  type CopilotWorkspaceViewModel,
} from "./copilot-workspace-view-model";

function source(
  overrides: Partial<CopilotWorkspaceSource> = {},
): CopilotWorkspaceSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    context: {
      featureId: "project-galaxy",
      projectId: "project-odyssey",
      evidenceReferenceIds: ["evidence-goal", "evidence-goal"],
    },
    lastTransitionReason: "initialized",
    ...overrides,
  };
}

describe("CopilotWorkspaceViewModel", () => {
  it("keeps mode, provenance and exact context in one stable contract", () => {
    const result = createCopilotWorkspaceViewModel(source(), "preview");

    expectTypeOf(result).toEqualTypeOf<CopilotWorkspaceViewModel>();
    expectTypeOf(result.mode).toEqualTypeOf<PanelMode>();
    expectTypeOf(result.context).toEqualTypeOf<CopilotContext>();
    expect(result).toEqual({
      mode: "preview",
      provenanceLabel: "演示数据 · 完全虚构",
      context: {
        featureId: "project-galaxy",
        projectId: "project-odyssey",
        evidenceReferenceIds: ["evidence-goal"],
      },
      lastTransitionReason: "initialized",
      projectBrief: { status: "not_found" },
      followUp: { status: "unavailable", message: "追问暂不可用。" },
    });
  });

  it("creates an independent context copy instead of mutating source data", () => {
    const input = source();
    const original = structuredClone(input);

    const result = createCopilotWorkspaceViewModel(input, "connected");
    result.context.evidenceReferenceIds.push("local-only");

    expect(input).toEqual(original);
  });
});
