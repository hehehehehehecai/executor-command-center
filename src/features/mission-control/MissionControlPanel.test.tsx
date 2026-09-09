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


describe("MissionControlPanel theme contracts", () => {
  it("preserves four task types and states in stable ID order with text labels", () => {
    const labels = ["Issue", "Pull Request", "Review Request", "Workflow Failure"];
    const states = ["open", "pending", "unknown", "failed"] as const;
    const taskTypes = ["issue", "pull_request", "review_request", "workflow_failure"] as const;
    const tasks = taskTypes.map((taskType, index) => ({
      ...source().recordedTasks[0]!, id: `task-${index}`, taskType,
      state: states[index]!, title: `事实任务 ${index}`,
    }));
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source({ recordedTasks: [...tasks].reverse() }), "preview")} />);
    const region = screen.getByRole("region", { name: "已记录任务" });
    expect(within(region).getByText("4 项")).toBeVisible();
    within(region).getAllByRole("article").forEach((article, index) => {
      expect(article).toHaveAttribute("data-content-kind", "recorded-fact");
      expect(article).toHaveAttribute("data-task-state", states[index]);
      expect(within(article).getByRole("heading", { level: 3 })).toHaveTextContent(`事实任务 ${index}`);
      expect(within(article).getByText(`事实 · ${labels[index]}`)).toBeVisible();
      expect(within(article).getByText(states[index]![0]!.toUpperCase() + states[index]!.slice(1))).toBeVisible();
    });
  });

  it("serializes the native acceptance form and offers it only for suggested items in both modes", () => {
    const { rerender } = render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);
    for (const mode of ["preview", "connected"] as const) {
      rerender(<MissionControlPanel viewModel={createMissionControlViewModel(source(), mode)} />);
      for (const status of missionSuggestionStatuses) {
        const article = screen.getByText(status, { selector: "[data-suggestion-status]" }).closest("article")!;
        expect(within(article).queryAllByRole("button", { name: "接受建议" })).toHaveLength(status === "suggested" ? 1 : 0);
      }
      const button = screen.getByRole("button", { name: "接受建议" });
      const form = button.closest("form")!;
      expect(button).toHaveAttribute("type", "submit");
      expect(form.method).toBe("get");
      expect(Object.fromEntries(new FormData(form))).toEqual({ mode, action: "transition", suggestionId: "suggestion-suggested", nextStatus: "accepted" });
      expect(within(screen.getByRole("region", { name: "已记录任务" })).queryAllByRole("button")).toHaveLength(0);
    }
  });

  it("keeps accepted drafts initially open with read-only fields and five textarea rows", () => {
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source(), "preview")} />);
    const title = screen.getByRole("textbox", { name: "Issue 草稿标题" });
    const body = screen.getByRole("textbox", { name: "Issue 草稿正文" });
    expect(title).toHaveAttribute("readonly");
    expect(body).toHaveAttribute("readonly");
    expect(body).toHaveAttribute("rows", "5");
    expect(title.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("来源建议 ID：suggestion-accepted")).toBeVisible();
    expect(screen.queryByRole("button", { name: /创建.*Issue/ })).not.toBeInTheDocument();
  });

  it("preserves success and error live feedback without changing facts or suggestions", () => {
    const vm = createMissionControlViewModel(source(), "preview");
    const { rerender } = render(<MissionControlPanel viewModel={vm} />);
    const facts = screen.getByRole("region", { name: "已记录任务" }).innerHTML;
    const suggestions = screen.getByRole("region", { name: "系统建议" }).innerHTML;
    for (const feedback of [{ kind: "success", message: "建议状态已在本地更新；GitHub 已记录事实保持不变。" }, { kind: "error", message: "建议状态未改变。" }] as const) {
      rerender(<MissionControlPanel viewModel={vm} feedback={feedback} />);
      expect(screen.getByRole("status")).toHaveAttribute("data-feedback-kind", feedback.kind);
      expect(screen.getByRole("status")).toHaveTextContent(feedback.message);
      expect(screen.getByRole("region", { name: "已记录任务" }).innerHTML).toBe(facts);
      expect(screen.getByRole("region", { name: "系统建议" }).innerHTML).toBe(suggestions);
    }
  });

  it("degrades unsafe fact and evidence URLs while retaining safe HTTPS links", () => {
    const urls = ["javascript:alert(1)", "http://unsafe.example.test/item", "https://name:pass@unsafe.example.test/item", "not a url", null, "https://safe.example.test/item"];
    const data = source({
      recordedTasks: urls.map((originalUrl, index) => ({ ...source().recordedTasks[0]!, id: `task-${index}`, originalUrl })),
      suggestions: [{ ...source().suggestions[0]!, evidence: urls.map((originalUrl, index) => ({ label: `证据 ${index}`, originalUrl })) }],
    });
    render(<MissionControlPanel viewModel={createMissionControlViewModel(data, "preview")} />);
    const facts = screen.getByRole("region", { name: "已记录任务" });
    const suggestions = screen.getByRole("region", { name: "系统建议" });
    expect(within(facts).getAllByText("原始链接不可用")).toHaveLength(5);
    expect(within(facts).getAllByRole("link")).toHaveLength(1);
    expect(within(facts).getByRole("link")).toHaveAttribute("href", urls[5]);
    expect(within(suggestions).getAllByRole("link")).toHaveLength(1);
    expect(within(suggestions).getByRole("link", { name: "证据 5" })).toHaveAttribute("href", urls[5]);
    for (let index = 0; index < 5; index += 1) {
      expect(within(suggestions).getByText(`证据 ${index}`)).toBeVisible();
      expect(within(suggestions).queryByRole("link", { name: `证据 ${index}` })).not.toBeInTheDocument();
    }
  });

  it("retains missing-evidence and incomplete-draft explanations for accepted suggestions", () => {
    const accepted = source().suggestions.find(({ status }) => status === "accepted")!;
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source({ suggestions: [
      { ...accepted, id: "a", evidence: [], draftTitle: " ", draftBody: "完整正文" },
      { ...accepted, id: "b", evidence: [], draftTitle: "完整标题", draftBody: null },
    ] }), "preview")} />);
    expect(screen.getAllByText("无可用证据引用")).toHaveLength(2);
    expect(screen.getAllByText("Issue 草稿不可用：缺少必要字段。")).toHaveLength(2);
    expect(screen.getAllByText("建议 · 已在本地接受")).toHaveLength(2);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps long suggestion and fact content complete without merging duplicate titles", () => {
    const long = "长内容保持完整，供人工逐项核验。".repeat(50);
    const suggestion = source().suggestions[0]!;
    render(<MissionControlPanel viewModel={createMissionControlViewModel(source({
      recordedTasks: [{ ...source().recordedTasks[0]!, title: long, sourceLabel: long }],
      suggestions: [{ ...suggestion, id: "z", title: "相同标题", rationale: long, unknowns: long, evidence: [{ label: long, originalUrl: null }] }, { ...suggestion, id: "a", title: "相同标题", rationale: long }],
    }), "preview")} />);
    const facts = screen.getByRole("region", { name: "已记录任务" });
    expect(within(facts).getByRole("heading", { level: 3 }).textContent).toBe(long);
    const suggestions = screen.getByRole("region", { name: "系统建议" });
    expect(within(suggestions).getAllByRole("heading", { name: "相同标题" })).toHaveLength(2);
    const articles = within(suggestions).getAllByRole("article");
    expect(articles.map((article) => new FormData(article.querySelector("form")!).get("suggestionId"))).toEqual(["a", "z"]);
    expect(within(articles[1]!).getAllByText(long)).toHaveLength(3);
  });
});
