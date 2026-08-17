import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MissionControlPanel } from "./MissionControlPanel";
import {
  createMissionControlViewModel,
  missionSuggestionStatuses,
  type MissionControlSource,
} from "./mission-control-view-model";

function source(overrides: Partial<MissionControlSource> = {}): MissionControlSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    recordedTasks: [
      {
        id: "task-issue",
        taskType: "issue",
        title: "修复虚构导航焦点",
        state: "open",
        sourceLabel: "fictional/starship#21 · GitHub 只读",
        originalUrl: "https://github.example.test/fictional/starship/issues/21",
      },
    ],
    suggestions: missionSuggestionStatuses.map((status) => ({
      id: `suggestion-${status}`,
      title: `${status} 候选行动`,
      rationale: "虚构活动显示需要人工复核。",
      evidence: [{ label: "虚构证据 #1", originalUrl: null }],
      unknowns: "系统不知道本地未提交工作。",
      ruleVersion: "mission-rule.v1",
      status,
      provenanceLabel: "本地系统建议 · 完全虚构",
      draftTitle: status === "accepted" ? "chore: 复核虚构活动" : null,
      draftBody: status === "accepted" ? "此草稿完全虚构，请人工核验。" : null,
    })),
    ...overrides,
  };
}

afterEach(cleanup);

describe("MissionControlPanel", () => {
  it("renders recorded GitHub tasks and system suggestions in distinct semantic regions", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);

    const tasks = screen.getByRole("region", { name: "已记录任务" });
    const suggestions = screen.getByRole("region", { name: "系统建议" });

    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "Demo · 演示数据 · 完全虚构",
    );
    expect(within(tasks).getByText("修复虚构导航焦点")).toBeVisible();
    expect(within(tasks).getByText(/GitHub 只读/)).toBeVisible();
    expect(within(suggestions).queryByText("修复虚构导航焦点")).not.toBeInTheDocument();
    expect(within(suggestions).getAllByRole("article")).toHaveLength(5);
  });

  it("renders all five states as text-backed semantic labels", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);

    for (const status of missionSuggestionStatuses) {
      const badge = screen.getByText(status, { selector: "[data-suggestion-status]" });
      expect(badge).toHaveAttribute("data-suggestion-status", status);
    }
  });

  it("offers a keyboard-native local acceptance form for suggested items", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);

    const button = screen.getByRole("button", { name: "接受建议" });
    const form = button.closest("form");

    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("method", "get");
    expect(form?.querySelector('input[name="action"]')).toHaveValue("transition");
    expect(form?.querySelector('input[name="suggestionId"]')).toHaveValue(
      "suggestion-suggested",
    );
    expect(form?.querySelector('input[name="nextStatus"]')).toHaveValue("accepted");
  });

  it("renders suggestion basis, evidence, unknowns and rule version", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);

    expect(screen.getAllByText("虚构活动显示需要人工复核。")).toHaveLength(5);
    expect(screen.getAllByText("虚构证据 #1")).toHaveLength(5);
    expect(screen.getAllByText("系统不知道本地未提交工作。")).toHaveLength(5);
    expect(screen.getAllByText("mission-rule.v1")).toHaveLength(5);
  });

  it("renders an accepted Issue draft as read-only copyable fields without remote claims", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);

    expect(screen.getByRole("textbox", { name: "Issue 草稿标题" })).toHaveValue(
      "chore: 复核虚构活动",
    );
    expect(screen.getByRole("textbox", { name: "Issue 草稿正文" })).toHaveValue(
      "此草稿完全虚构，请人工核验。",
    );
    expect(screen.getByText("只生成本地草稿，不会创建 GitHub Issue。")).toBeVisible();
    expect(screen.getByText("查看本地 Issue 草稿").closest("summary")).not.toBeNull();
    expect(screen.queryByText(/创建成功|Issue #/)).not.toBeInTheDocument();
  });

  it("shows explicit empty states and an invalid draft state", () => {
    const { rerender } = render(
      <MissionControlPanel
        viewModel={createMissionControlViewModel(
          source({ recordedTasks: [], suggestions: [] }),
          "preview",
        )}
      />,
    );

    expect(screen.getByText("暂无 GitHub 已记录任务")).toBeVisible();
    expect(screen.getByText("暂无系统建议")).toBeVisible();

    rerender(
      <MissionControlPanel
        viewModel={createMissionControlViewModel(
          source({
            suggestions: [
              {
                ...source().suggestions[1]!,
                draftTitle: null,
                draftBody: null,
              },
            ],
          }),
          "preview",
        )}
      />,
    );

    expect(screen.getByText("Issue 草稿不可用：缺少必要字段。")).toBeVisible();
  });
});
