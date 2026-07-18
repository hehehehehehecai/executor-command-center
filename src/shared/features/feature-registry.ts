import type { FeatureDefinition } from "./feature-definition";

export const featureRegistry: readonly FeatureDefinition[] = [
  {
    id: "project-galaxy",
    title: "Project Galaxy",
    subtitle: "项目星图",
    route: "/project-galaxy",
    order: 10,
    requiresGitHubData: true,
  },
  {
    id: "flight-log",
    title: "Flight Log",
    subtitle: "航行日志",
    route: "/flight-log",
    order: 20,
    requiresGitHubData: true,
  },
  {
    id: "mission-control",
    title: "Mission Control",
    subtitle: "任务中枢",
    route: "/mission-control",
    order: 30,
    requiresGitHubData: true,
  },
  {
    id: "decision-archive",
    title: "Decision Archive",
    subtitle: "决策档案",
    route: "/decision-archive",
    order: 40,
    requiresGitHubData: true,
  },
  {
    id: "copilot",
    title: "Copilot",
    subtitle: "AI 副驾驶",
    route: "/copilot",
    order: 50,
    requiresGitHubData: true,
  },
] as const;
