import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectGalaxyPanel,
  type ProjectGalaxyViewModel,
} from "@/features/project-galaxy";

const viewModel: ProjectGalaxyViewModel = {
  mode: "preview",
  provenanceLabel: "演示数据 · 完全虚构",
  project: {
    id: "project-aurora",
    name: "Aurora Cartography",
    repositoryLabel: "demo/aurora-cartography",
  },
  officialStatus: "in_development",
  suggestedStatus: {
    value: "polishing",
    rationale: "近期虚构活动表明项目可以进入打磨阶段。",
    generatedAt: "2026-08-17T09:00:00.000Z",
  },
  recentActivity: [
    {
      id: "activity-1",
      summary: "完成虚构导航模型评审",
      occurredAt: "2026-08-17T08:00:00.000Z",
    },
  ],
  freshness: {
    kind: "known",
    input: {
      provenance: "demo",
      authorizationRevoked: false,
      latestRun: null,
      lastSuccessfulAt: "2026-08-17T08:00:00.000Z",
      coverageComplete: true,
      now: "2026-08-17T12:00:00.000Z",
    },
  },
  coreGoal: "建立可审阅的虚构项目全景。",
  currentStageGoal: "验证状态、目标和活动的信息层级。",
  currentBlockers: ["等待虚构的可访问性复核窗口。"],
};

describe("ProjectGalaxyPanel", () => {
  afterEach(cleanup);

  it("renders all eight required information groups", () => {
    render(<ProjectGalaxyPanel viewModel={viewModel} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Project Galaxy" }),
    ).toBeVisible();
    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "Demo · 演示数据 · 完全虚构",
    );
    expect(screen.getByText("查看演示建议边界")).toBeVisible();
    expect(screen.getByLabelText("项目身份")).toHaveTextContent(
      "Aurora Cartography",
    );
    expect(screen.getByRole("region", { name: "Official Status" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Suggested Status" })).toBeVisible();
    expect(screen.getByRole("region", { name: "最近活动" })).toBeVisible();
    expect(screen.getByRole("region", { name: "数据新鲜度" })).toBeVisible();
    expect(screen.getByRole("region", { name: "核心目标" })).toHaveTextContent(
      "建立可审阅的虚构项目全景。",
    );
    expect(screen.getByRole("region", { name: "当前阶段目标" })).toHaveTextContent(
      "验证状态、目标和活动的信息层级。",
    );
    expect(screen.getByRole("region", { name: "当前阻碍" })).toHaveTextContent(
      "等待虚构的可访问性复核窗口。",
    );
  });

  it("separates Official facts from Suggested guidance without color-only meaning", () => {
    render(<ProjectGalaxyPanel viewModel={viewModel} />);

    const official = screen.getByRole("region", { name: "Official Status" });
    const suggested = screen.getByRole("region", { name: "Suggested Status" });

    expect(official).toHaveAttribute("data-status-kind", "fact");
    expect(official).toHaveTextContent("官方事实");
    expect(official).toHaveTextContent("开发中");
    expect(suggested).toHaveAttribute("data-status-kind", "suggestion");
    expect(suggested).toHaveTextContent("系统建议");
    expect(suggested).toHaveTextContent("打磨中");
    expect(suggested).toHaveTextContent("建议不会修改 Official Status");
  });

  it("renders explicit empty states without falling Suggested back to Official", () => {
    render(
      <ProjectGalaxyPanel
        viewModel={{
          ...viewModel,
          suggestedStatus: null,
          recentActivity: [],
          coreGoal: null,
          currentStageGoal: null,
          currentBlockers: [],
        }}
      />,
    );

    const official = screen.getByRole("region", { name: "Official Status" });
    const suggested = screen.getByRole("region", { name: "Suggested Status" });

    expect(official).toHaveTextContent("开发中");
    expect(suggested).toHaveTextContent("暂无状态建议");
    expect(suggested).not.toHaveTextContent("开发中");
    expect(screen.getByRole("region", { name: "最近活动" })).toHaveTextContent(
      "暂无最近活动",
    );
    expect(screen.getByRole("region", { name: "核心目标" })).toHaveTextContent(
      "尚未记录核心目标",
    );
    expect(screen.getByRole("region", { name: "当前阶段目标" })).toHaveTextContent(
      "尚未记录当前阶段目标",
    );
    expect(screen.getByRole("region", { name: "当前阻碍" })).toHaveTextContent(
      "当前没有记录的阻碍",
    );
  });

  it("renders stable stale and unknown Freshness text", () => {
    if (viewModel.freshness.kind !== "known") {
      throw new Error("Test fixture must start with known Freshness data.");
    }

    const { rerender } = render(
      <ProjectGalaxyPanel
        viewModel={{
          ...viewModel,
          freshness: {
            kind: "known",
            input: {
              ...viewModel.freshness.input,
              lastSuccessfulAt: "2026-08-16T11:59:59.999Z",
            },
          },
        }}
      />,
    );

    expect(screen.getByText("Stale")).toBeVisible();
    expect(screen.getByText("数据已超过 24 小时未成功同步。")).toBeVisible();

    rerender(
      <ProjectGalaxyPanel
        viewModel={{
          ...viewModel,
          freshness: {
            kind: "unknown",
            provenanceLabel: "演示数据 · 完全虚构",
            description: "该虚构 case 没有可用的同步时间。",
          },
        }}
      />,
    );

    const freshnessRegion = screen.getByRole("region", { name: "数据新鲜度" });
    expect(freshnessRegion).toHaveTextContent("Unknown");
    expect(freshnessRegion).toHaveTextContent("该虚构 case 没有可用的同步时间。");
  });

  it("uses semantic activity times and provides a keyboard-reachable destination", () => {
    render(<ProjectGalaxyPanel viewModel={viewModel} />);

    const activity = screen.getByRole("region", { name: "最近活动" });
    expect(within(activity).getByText("完成虚构导航模型评审")).toBeVisible();
    expect(within(activity).getByText("2026-08-17 08:00 UTC")).toHaveAttribute(
      "dateTime",
      "2026-08-17T08:00:00.000Z",
    );
    expect(screen.getByRole("link", { name: "返回 Command Deck" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText("查看演示建议边界").closest("summary")).not.toBeNull();
  });
});
