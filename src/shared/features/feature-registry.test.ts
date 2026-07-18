import { describe, expect, it } from "vitest";

import { featureRegistry } from "./feature-registry";

type RegistryEntry = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly route: string;
  readonly order: number;
  readonly requiresGitHubData: boolean;
};

const registry = featureRegistry as readonly RegistryEntry[];

const expectedRegistry = [
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

function expectFiveFeatures() {
  expect(registry).toHaveLength(5);
}

describe("featureRegistry", () => {
  it("matches the frozen feature-registry.v1 contract exactly", () => {
    expectFiveFeatures();
    expect(registry).toEqual(expectedRegistry);
  });

  it("keeps the five Feature IDs in their stable order", () => {
    expectFiveFeatures();
    expect(registry.map(({ id }) => id)).toEqual(
      expectedRegistry.map(({ id }) => id),
    );
  });

  it("contains unique Feature IDs", () => {
    expectFiveFeatures();
    const ids = registry.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains unique routes", () => {
    expectFiveFeatures();
    const routes = registry.map(({ route }) => route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("contains unique orders", () => {
    expectFiveFeatures();
    const orders = registry.map(({ order }) => order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("keeps orders strictly increasing", () => {
    expectFiveFeatures();
    const orders = registry.map(({ order }) => order);
    expect(orders.every((order, index) => index === 0 || order > orders[index - 1])).toBe(
      true,
    );
  });

  it("uses non-root absolute lowercase kebab-case routes", () => {
    expectFiveFeatures();
    expect(
      registry.every(
        ({ route }) =>
          route !== "/" && /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route),
      ),
    ).toBe(true);
  });

  it("marks every Feature as requiring GitHub data", () => {
    expectFiveFeatures();
    expect(registry.every(({ requiresGitHubData }) => requiresGitHubData)).toBe(true);
  });
});
