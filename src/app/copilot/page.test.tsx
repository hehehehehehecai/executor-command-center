import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CopilotPage from "./page";

afterEach(cleanup);

describe("Copilot route", () => {
  it("loads the fictional Preview shell by default", async () => {
    render(await CopilotPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Copilot Workspace" }),
    ).toBeVisible();
    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "演示数据 · 完全虚构",
    );
  });

  it("clears old evidence when the project changes", async () => {
    render(
      await CopilotPage({
        searchParams: Promise.resolve({
          action: "switch",
          fromFeatureId: "project-galaxy",
          fromProjectId: "project-odyssey",
          fromEvidence: ["evidence-goal", "evidence-freshness"],
          featureId: "project-galaxy",
          projectId: "project-atlas",
        }),
      }),
    );

    expect(screen.getByText("project-atlas")).toBeVisible();
    expect(screen.getByText("暂无证据引用")).toBeVisible();
    expect(screen.getByText("项目已切换，旧引用已清除")).toBeVisible();
  });

  it("retains same-identity evidence and deduplicates new references", async () => {
    render(
      await CopilotPage({
        searchParams: Promise.resolve({
          action: "evidence",
          fromFeatureId: "project-galaxy",
          fromProjectId: "project-odyssey",
          fromEvidence: ["evidence-goal", "evidence-freshness"],
          evidenceReferenceIds: "evidence-freshness\nevidence-decision\nevidence-goal",
        }),
      }),
    );

    const evidence = screen.getByRole("region", { name: "证据引用" });
    expect(
      within(evidence)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["evidence-goal", "evidence-freshness", "evidence-decision"]);
    expect(screen.getByText("本地证据引用已更新")).toBeVisible();
  });

  it("fails closed for an unknown feature without changing current context", async () => {
    render(
      await CopilotPage({
        searchParams: Promise.resolve({
          action: "switch",
          fromFeatureId: "project-galaxy",
          fromProjectId: "project-odyssey",
          fromEvidence: "evidence-goal",
          featureId: "unknown-feature",
          projectId: "project-atlas",
        }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "未知面板，未改变当前上下文。",
    );
    expect(screen.getByText("project-odyssey")).toBeVisible();
    expect(screen.getByText("evidence-goal")).toBeVisible();
    expect(screen.queryByText("project-atlas")).not.toBeInTheDocument();
  });

  it("shows Connected failure without loading Preview content", async () => {
    const connectedPort = {
      load: vi.fn(async () =>
        Promise.reject(new Error("copilot_connected_unavailable")),
      ),
    };

    render(
      await CopilotPage({
        searchParams: Promise.resolve({ mode: "connected" }),
        connectedPort,
      }),
    );

    expect(screen.getByText("Connected 数据暂时不可用。")).toBeVisible();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
    expect(connectedPort.load).toHaveBeenCalledOnce();
  });
});
