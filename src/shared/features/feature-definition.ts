export type FeatureId =
  | "project-galaxy"
  | "flight-log"
  | "mission-control"
  | "decision-archive"
  | "copilot";

export interface FeatureDefinition {
  id: FeatureId;
  title: string;
  subtitle: string;
  route: string;
  order: number;
  requiresGitHubData: boolean;
}
