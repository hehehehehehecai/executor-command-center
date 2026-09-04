import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeatureId } from "@/shared/features/feature-definition";

import {
  InvalidCopilotContextError,
  createCopilotContext,
  transitionCopilotContext,
  updateCopilotEvidenceReferences,
  type CopilotContext,
} from "./copilot-context";

function context(overrides: Partial<CopilotContext> = {}): CopilotContext {
  return {
    featureId: "project-galaxy",
    projectId: "project-odyssey",
    evidenceReferenceIds: ["evidence-goal", "evidence-freshness"],
    ...overrides,
  };
}

describe("CopilotContext", () => {
  it("keeps the exact three-field compile-time contract", () => {
    expectTypeOf<CopilotContext>().toEqualTypeOf<{
      featureId: FeatureId;
      projectId: string | null;
      evidenceReferenceIds: string[];
    }>();
  });

  it("normalizes evidence IDs with stable first-seen deduplication", () => {
    expect(
      createCopilotContext(
        context({
          evidenceReferenceIds: [
            " evidence-goal ",
            "evidence-freshness",
            "evidence-goal",
            "   ",
          ],
        }),
      ),
    ).toEqual({
      featureId: "project-galaxy",
      projectId: "project-odyssey",
      evidenceReferenceIds: ["evidence-goal", "evidence-freshness"],
    });
  });

  it("preserves evidence when feature and project identity are unchanged", () => {
    expect(
      transitionCopilotContext(context(), {
        featureId: "project-galaxy",
        projectId: "project-odyssey",
      }),
    ).toEqual({
      reason: "identity_unchanged",
      context: context(),
    });
  });

  it("clears evidence when the feature changes", () => {
    expect(
      transitionCopilotContext(context(), {
        featureId: "flight-log",
        projectId: "project-odyssey",
      }),
    ).toEqual({
      reason: "feature_changed",
      context: {
        featureId: "flight-log",
        projectId: "project-odyssey",
        evidenceReferenceIds: [],
      },
    });
  });

  it.each([
    ["project-atlas", "project_changed"],
    [null, "project_changed"],
  ] as const)(
    "clears evidence when project identity becomes %s",
    (projectId, reason) => {
      expect(
        transitionCopilotContext(context(), {
          featureId: "project-galaxy",
          projectId,
        }),
      ).toEqual({
        reason,
        context: {
          featureId: "project-galaxy",
          projectId,
          evidenceReferenceIds: [],
        },
      });
    },
  );

  it("merges evidence for the same identity without disturbing stable order", () => {
    expect(
      updateCopilotEvidenceReferences(context(), [
        "evidence-freshness",
        " evidence-decision ",
        "evidence-goal",
      ]),
    ).toEqual({
      reason: "evidence_updated",
      context: {
        featureId: "project-galaxy",
        projectId: "project-odyssey",
        evidenceReferenceIds: [
          "evidence-goal",
          "evidence-freshness",
          "evidence-decision",
        ],
      },
    });
  });

  it("fails closed for an unknown Feature ID", () => {
    expect(() =>
      createCopilotContext(
        context({ featureId: "unknown-feature" as FeatureId }),
      ),
    ).toThrow(InvalidCopilotContextError);
  });
});
