import type { ProjectStatus } from "@/domain/project-calibration/project-calibration";
import type { PanelMode } from "@/shared/panel-query";

import type { ProjectFreshnessPresentationInput } from "./freshness-presentation";

export type ProjectGalaxyFreshness =
  | {
      readonly kind: "known";
      readonly input: ProjectFreshnessPresentationInput;
    }
  | {
      readonly kind: "unknown";
      readonly provenanceLabel: string;
      readonly description: string;
    };

export interface ProjectGalaxyActivity {
  readonly id: string;
  readonly summary: string;
  readonly occurredAt: string;
}

export interface ProjectGalaxySuggestedStatus {
  readonly value: ProjectStatus;
  readonly rationale: string;
  readonly generatedAt: string;
}

export interface ProjectGalaxySource {
  readonly project: {
    readonly id: string;
    readonly name: string | null;
    readonly repositoryLabel: string | null;
  };
  readonly officialStatus: ProjectStatus | null;
  readonly suggestedStatus: ProjectGalaxySuggestedStatus | null;
  readonly activity: readonly ProjectGalaxyActivity[];
  readonly freshness: ProjectGalaxyFreshness;
  readonly coreGoal: string | null;
  readonly currentStageGoal: string | null;
  readonly currentBlockers: readonly string[];
  readonly provenanceLabel: string;
}

export interface ProjectGalaxyViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly project: ProjectGalaxySource["project"];
  readonly officialStatus: ProjectStatus | null;
  readonly suggestedStatus: ProjectGalaxySuggestedStatus | null;
  readonly recentActivity: readonly ProjectGalaxyActivity[];
  readonly freshness: ProjectGalaxyFreshness;
  readonly coreGoal: string | null;
  readonly currentStageGoal: string | null;
  readonly currentBlockers: readonly string[];
}

function copyFreshness(
  freshness: ProjectGalaxyFreshness,
): ProjectGalaxyFreshness {
  if (freshness.kind === "unknown") {
    return { ...freshness };
  }

  return {
    kind: "known",
    input: {
      ...freshness.input,
      latestRun:
        freshness.input.latestRun === null
          ? null
          : { ...freshness.input.latestRun },
    },
  };
}

export function mapProjectGalaxyViewModel(
  source: ProjectGalaxySource,
  mode: PanelMode,
): ProjectGalaxyViewModel {
  const recentActivity = source.activity
    .map((activity) => ({ ...activity }))
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        left.id.localeCompare(right.id),
    );

  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    project: { ...source.project },
    officialStatus: source.officialStatus,
    suggestedStatus:
      source.suggestedStatus === null ? null : { ...source.suggestedStatus },
    recentActivity,
    freshness: copyFreshness(source.freshness),
    coreGoal: source.coreGoal,
    currentStageGoal: source.currentStageGoal,
    currentBlockers: [...source.currentBlockers],
  };
}
