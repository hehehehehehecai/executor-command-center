import type { FeatureId } from "@/shared/features/feature-definition";
import { featureRegistry } from "@/shared/features/feature-registry";

export interface CopilotContext {
  featureId: FeatureId;
  projectId: string | null;
  evidenceReferenceIds: string[];
}

export type CopilotContextTransitionReason =
  | "evidence_updated"
  | "feature_changed"
  | "identity_unchanged"
  | "project_changed";

export interface CopilotContextTransition {
  readonly context: CopilotContext;
  readonly reason: CopilotContextTransitionReason;
}

export type CopilotContextIdentity = Pick<
  CopilotContext,
  "featureId" | "projectId"
>;

const featureIds = new Set<FeatureId>(
  featureRegistry.map(({ id }) => id),
);

export class InvalidCopilotContextError extends Error {
  readonly code = "invalid_copilot_context";

  constructor(value: string) {
    super(`Unsupported Copilot context Feature: ${value}`);
    this.name = "InvalidCopilotContextError";
  }
}

function assertFeatureId(value: FeatureId) {
  if (!featureIds.has(value)) {
    throw new InvalidCopilotContextError(String(value));
  }
}

function stableEvidenceReferenceIds(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

export function createCopilotContext(input: CopilotContext): CopilotContext {
  assertFeatureId(input.featureId);

  return {
    featureId: input.featureId,
    projectId: input.projectId,
    evidenceReferenceIds: stableEvidenceReferenceIds(
      input.evidenceReferenceIds,
    ),
  };
}

export function transitionCopilotContext(
  current: CopilotContext,
  nextIdentity: CopilotContextIdentity,
): CopilotContextTransition {
  const normalizedCurrent = createCopilotContext(current);
  assertFeatureId(nextIdentity.featureId);

  if (normalizedCurrent.featureId !== nextIdentity.featureId) {
    return {
      reason: "feature_changed",
      context: {
        ...nextIdentity,
        evidenceReferenceIds: [],
      },
    };
  }

  if (normalizedCurrent.projectId !== nextIdentity.projectId) {
    return {
      reason: "project_changed",
      context: {
        ...nextIdentity,
        evidenceReferenceIds: [],
      },
    };
  }

  return {
    reason: "identity_unchanged",
    context: normalizedCurrent,
  };
}

export function updateCopilotEvidenceReferences(
  current: CopilotContext,
  evidenceReferenceIds: readonly string[],
): CopilotContextTransition {
  const normalizedCurrent = createCopilotContext(current);

  return {
    reason: "evidence_updated",
    context: {
      ...normalizedCurrent,
      evidenceReferenceIds: stableEvidenceReferenceIds([
        ...normalizedCurrent.evidenceReferenceIds,
        ...evidenceReferenceIds,
      ]),
    },
  };
}
