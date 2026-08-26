import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureId } from "@/shared/features/feature-definition";
import { featureRegistry } from "@/shared/features/feature-registry";
import { CommandDeckPage } from ".";

const expectedPanelContent: Readonly<
  Record<FeatureId, { status: string; summary: string; detail: string }>
> = {
  "project-galaxy": {
    status: "开发中",
    summary: "核心目标与当前阶段已在演示档案中校准。",
    detail: "5 个演示项目信号已归入当前星图。",
  },
  "flight-log": {
    status: "近期活跃",
    summary: "演示时间线包含提交、Pull Request 与发布记录。",
    detail: "最近 7 天共有 12 条虚构活动记录。",
  },
  "mission-control": {
    status: "等待舰长确认",
    summary: "已记录任务与系统候选建议保持明确分离。",
    detail: "3 个演示任务，2 条演示建议。",
  },
  "decision-archive": {
    status: "决策已归档",
    summary: "已确认决策与候选决策点分别展示。",
    detail: "2 条演示决策，1 个演示候选点。",
  },
  copilot: {
    status: "演示模式",
    summary: "展示有证据边界的项目简报形态。",
    detail: "不调用模型，不消耗任何 AI 配额。",
  },
};

describe("CommandDeckPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the EXECUTOR brand without an authentication provider", () => {
    render(<CommandDeckPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "EXECUTOR" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Command Your Projects")).toBeInTheDocument();
  });

  it("offers the GitHub identity sign-in entry without claiming repository access", () => {
    render(<CommandDeckPage />);

    expect(
      screen.getByRole("link", { name: "使用 GitHub 登录" }),
    ).toHaveAttribute(
      "href",
      "/api/auth/github?returnTo=%2Fonboarding",
    );
    expect(screen.getByText("登录仅用于确认身份，不授予仓库权限。"))
      .toBeInTheDocument();
  });

  it("discloses the fictional preview and fixture version", () => {
    render(<CommandDeckPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Command Deck" }),
    ).toBeInTheDocument();
    expect(screen.getByText("舰桥预览")).toBeInTheDocument();
    expect(screen.getAllByText("演示数据 · 完全虚构")).toHaveLength(2);
    expect(screen.getByText("演示数据版本 1.1.0")).toBeInTheDocument();
  });

  it("renders exactly five panel entries in Registry order", () => {
    render(<CommandDeckPage />);

    const panels = screen.getAllByRole("article");

    expect(panels).toHaveLength(5);
    expect(panels.map((panel) => panel.dataset.featureId)).toEqual(
      featureRegistry.map((feature) => feature.id),
    );
  });

  it("exposes the desktop workspace landmarks and a semantic current item", () => {
    render(<CommandDeckPage />);

    const banner = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const navigation = screen.getByRole("navigation", {
      name: "桌面主导航",
    });

    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(banner).not.toContainElement(main);
    expect(main).not.toContainElement(banner);
    expect(navigation).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Command Deck 工作区" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "舰桥上下文" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "舰桥总览" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("renders the frozen Registry destinations in desktop navigation order", () => {
    render(<CommandDeckPage />);

    const navigation = screen.getByRole("navigation", {
      name: "桌面主导航",
    });
    const links = within(navigation).getAllByRole("link").slice(1);

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/project-galaxy",
      "/flight-log",
      "/mission-control",
      "/decision-archive",
      "/copilot",
    ]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Project Galaxy 项目星图",
      "Flight Log 航行日志",
      "Mission Control 任务中枢",
      "Decision Archive 决策档案",
      "Copilot AI 副驾驶",
    ]);
  });

  it("opens the mobile navigation and returns focus after Escape closes it", () => {
    render(<CommandDeckPage />);

    const trigger = screen.getByRole("button", { name: "打开主导航" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "mobile-command-navigation");
    expect(
      screen.queryByRole("navigation", { name: "移动主导航" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("navigation", { name: "移动主导航" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭主导航" }));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("navigation", { name: "移动主导航" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the mobile navigation when a Registry destination is selected", () => {
    render(<CommandDeckPage />);

    const trigger = screen.getByRole("button", { name: "打开主导航" });
    fireEvent.click(trigger);

    const mobileNavigation = screen.getByRole("navigation", {
      name: "移动主导航",
    });
    const firstFeature = featureRegistry[0];
    const firstFeatureLink = within(mobileNavigation).getByRole("link", {
      name: `${firstFeature.title} ${firstFeature.subtitle}`,
    });

    expect(firstFeatureLink).toHaveAttribute("href", firstFeature.route);
    firstFeatureLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(firstFeatureLink);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("navigation", { name: "移动主导航" }),
    ).not.toBeInTheDocument();
  });

  it("uses Registry titles, subtitles and routes for accessible links", () => {
    render(<CommandDeckPage />);

    const accessibleNames = featureRegistry.map(
      (feature) => `打开${feature.subtitle}演示入口`,
    );

    for (const [index, feature] of featureRegistry.entries()) {
      const panel = screen.getAllByRole("article")[index];
      const panelQueries = within(panel);

      expect(panelQueries.getByText(feature.title)).toBeInTheDocument();
      expect(panelQueries.getByText(feature.subtitle)).toBeInTheDocument();
      expect(
        panelQueries.getByRole("link", { name: accessibleNames[index] }),
      ).toHaveAttribute("href", feature.route);
    }

    expect(new Set(accessibleNames).size).toBe(featureRegistry.length);
  });

  it("marks every panel as demo data", () => {
    render(<CommandDeckPage />);

    expect(screen.getAllByText("演示数据", { exact: true })).toHaveLength(5);
  });

  it("maps the frozen fictional content by Feature ID", () => {
    render(<CommandDeckPage />);

    for (const panel of screen.getAllByRole("article")) {
      const featureId = panel.dataset.featureId as FeatureId;
      const expected = expectedPanelContent[featureId];
      const panelQueries = within(panel);

      expect(panelQueries.getByText(expected.status)).toBeInTheDocument();
      expect(panelQueries.getByText(expected.summary)).toBeInTheDocument();
      expect(panelQueries.getByText(expected.detail)).toBeInTheDocument();
    }
  });

  it("renders without calling fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<CommandDeckPage />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders deterministic demo freshness without claiming a real sync", () => {
    render(<CommandDeckPage />);

    expect(screen.getByText("Syncing")).toBeVisible();
    expect(screen.getByText("running · 33333333…")).toBeVisible();
    expect(screen.getByText("2026-08-06 00:00:00 UTC")).toHaveAttribute(
      "dateTime",
      "2026-08-06T00:00:00.000Z",
    );
    expect(screen.queryByText(/33333333-3333/)).not.toBeInTheDocument();
  });

  it("does not claim a real connection or successful sync", () => {
    render(<CommandDeckPage />);

    expect(
      screen.queryByText(/连接成功|同步成功|Connected Mode/i),
    ).not.toBeInTheDocument();
  });

  it("explains that deep panel pages are deferred", () => {
    render(<CommandDeckPage />);

    expect(
      screen.getByText(
        "这些入口展示稳定路由元数据；深度面板页面将在后续 Phase 实现。",
      ),
    ).toBeInTheDocument();
  });
});
