import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { featureRegistry } from "@/shared/features/feature-registry";

import { CopilotWorkspacePanel } from "./CopilotWorkspacePanel";
import type { CopilotWorkspaceViewModel } from "./copilot-workspace-view-model";

function viewModel(
  overrides: Partial<CopilotWorkspaceViewModel> = {},
): CopilotWorkspaceViewModel {
  return {
    mode: "preview",
    provenanceLabel: "演示数据 · 完全虚构",
    context: {
      featureId: "project-galaxy",
      projectId: "project-odyssey",
      evidenceReferenceIds: ["evidence-goal", "evidence-freshness"],
    },
    lastTransitionReason: "initialized",
    ...overrides,
  };
}

afterEach(cleanup);

describe("CopilotWorkspacePanel", () => {
  it("renders an explicit context shell without answer or model claims", () => {
    render(<CopilotWorkspacePanel viewModel={viewModel()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Copilot Workspace" }),
    ).toBeVisible();
    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "Demo · 演示数据 · 完全虚构",
    );
    expect(screen.getByRole("region", { name: "当前上下文" })).toBeVisible();
    expect(screen.getByRole("region", { name: "证据引用" })).toBeVisible();
    expect(screen.getByText("本阶段不生成答案，也不调用 AI 模型。")).toBeVisible();
    expect(screen.queryByText(/模型回答|生成成功|streaming/i)).not.toBeInTheDocument();
  });

  it("uses the frozen Registry order in the keyboard-accessible context form", () => {
    render(<CopilotWorkspacePanel viewModel={viewModel()} />);

    const form = screen.getByRole("form", { name: "切换 Copilot 上下文" });
    const featureSelect = within(form).getByRole("combobox", {
      name: "面板",
    });
    const options = within(featureSelect).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("value"))).toEqual(
      featureRegistry.map(({ id }) => id),
    );
    expect(featureSelect).toHaveValue("project-galaxy");
    expect(within(form).getByRole("textbox", { name: "项目 ID" })).toHaveValue(
      "project-odyssey",
    );
    expect(
      within(form).getByRole("button", { name: "切换并校准上下文" }),
    ).toBeVisible();
  });

  it("shows exact identity, transition reason and stable evidence references", () => {
    render(
      <CopilotWorkspacePanel
        viewModel={viewModel({ lastTransitionReason: "identity_unchanged" })}
      />,
    );

    const contextRegion = screen.getByRole("region", { name: "当前上下文" });
    expect(within(contextRegion).getByText("project-galaxy")).toBeVisible();
    expect(within(contextRegion).getByText("project-odyssey")).toBeVisible();
    expect(within(contextRegion).getByText("身份未变化，引用已保留")).toBeVisible();

    const evidenceRegion = screen.getByRole("region", { name: "证据引用" });
    expect(within(evidenceRegion).getAllByRole("listitem")).toHaveLength(2);
    expect(within(evidenceRegion).getByText("evidence-goal")).toBeVisible();
    expect(within(evidenceRegion).getByText("evidence-freshness")).toBeVisible();
  });

  it("renders null project and empty evidence as explicit empty states", () => {
    render(
      <CopilotWorkspacePanel
        viewModel={viewModel({
          context: {
            featureId: "copilot",
            projectId: null,
            evidenceReferenceIds: [],
          },
          lastTransitionReason: "project_changed",
        })}
      />,
    );

    expect(screen.getByText("未选择项目（null）")).toBeVisible();
    expect(screen.getByText("暂无证据引用")).toBeVisible();
    expect(screen.getByText("项目已切换，旧引用已清除")).toBeVisible();
  });

  it("offers a local evidence form and announces fail-closed feedback", () => {
    render(
      <CopilotWorkspacePanel
        viewModel={viewModel()}
        feedback={{ kind: "error", message: "未知面板，未改变当前上下文。" }}
      />,
    );

    const form = screen.getByRole("form", { name: "添加证据引用" });
    expect(
      within(form).getByRole("textbox", { name: "证据引用 ID" }),
    ).toBeVisible();
    expect(
      within(form).getByRole("button", { name: "更新本地引用" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "未知面板，未改变当前上下文。",
    );
  });
});
