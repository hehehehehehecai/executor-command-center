import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { featureRegistry } from "@/shared/features/feature-registry";

import { CopilotWorkspacePanel } from "./CopilotWorkspacePanel";
import { createCopilotProjectBriefViewModel } from "./copilot-project-brief-view-model";
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
    projectBrief: { status: "not_found" },
    followUp: { status: "unavailable", message: "追问暂不可用。" },
    ...overrides,
  };
}

afterEach(cleanup);

describe("CopilotWorkspacePanel", () => {
  it("renders the validated Brief structure, explicit empty states, Freshness and permanent Boundary", async () => {
    const { syntheticProjectBrief } = await import(
      "@/testing/project-brief/project-brief-fixture"
    );
    render(<CopilotWorkspacePanel viewModel={viewModel({
      projectBrief: {
        status: "ready",
        value: createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
          briefId: "30000000-0000-4000-8000-000000000003",
          mode: "preview",
          selectedEvidence: null,
        }),
      },
      followUp: { status: "preview", message: "虚构追问示例，不会调用模型。" },
    })} />);

    expect(screen.getByRole("region", { name: "项目简报" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "项目简报" })).toBeVisible();
    expect(screen.getByText("暂无待处理事项")).toBeVisible();
    expect(screen.getByText("Freshness")).toBeVisible();
    expect(screen.getByRole("note", { name: "Brief 边界" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /查看证据/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("追问暂未启用")).toBeVisible();
  });

  it.each([
    ["not_found", "当前项目暂无已完成简报。"],
    ["expired", "当前项目只有已过期简报。"],
    ["invalid", "简报结构验证失败。"],
    ["evidence_validation_failed", "简报证据重新验证失败。"],
    ["unavailable", "简报读取暂时不可用。"],
  ])("renders the exact %s Brief state", (status, message) => {
    render(<CopilotWorkspacePanel viewModel={viewModel({
      projectBrief: { status } as never,
      followUp: { status: "unavailable", message: "追问暂不可用。" },
    })} />);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("note", { name: "Brief 边界" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "项目简报" })).not.toBeInTheDocument();
  });

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
    expect(
      screen.getByText("Brief 与追问均为完全虚构的离线演示。"),
    ).toBeVisible();
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
    expect(screen.getByText("未知面板，未改变当前上下文。")).toBeVisible();
  });
});


describe("Copilot evidence navigation", () => {
  it("links every available Evidence to its focusable detail without changing path or query", async () => {
    const { syntheticProjectBrief, syntheticBriefId } = await import(
      "@/testing/project-brief/project-brief-fixture"
    );
    for (const mode of ["preview", "connected"] as const) {
      const brief = createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
        briefId: syntheticBriefId, mode, selectedEvidence: null,
      });
      const { unmount } = render(<CopilotWorkspacePanel viewModel={viewModel({ mode, projectBrief: { status: "ready", value: brief } })} />);
      const expected = [
        ["摘要", "github_issue", "issue:42"],
        ["官方状态", "project_profile", "profile:odyssey"],
        ["已完成变更", "github_issue", "issue:42"],
        ["进行中工作", "github_issue", "issue:42"],
        ["Freshness", "freshness", "freshness:odyssey"],
      ];
      for (const [name, kind, id] of expected) {
        const link = within(screen.getByRole("region", { name })).getByRole("link", { name: `查看证据 · ${kind} · ${id}` });
        const selection = JSON.stringify([kind, id, "20000000-0000-4000-8000-000000000002"]);
        const href = `/copilot?mode=${mode}&projectId=20000000-0000-4000-8000-000000000002&selectedEvidence=${encodeURIComponent(selection)}#copilot-selected-evidence`;
        expect(link).toHaveAttribute("href", href);
      }
      unmount();
    }
  });

  it("exposes the selected Evidence as a programmatically focusable fragment target", async () => {
    const { syntheticProjectBrief, syntheticBriefId } = await import(
      "@/testing/project-brief/project-brief-fixture"
    );
    const brief = createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
      briefId: syntheticBriefId, mode: "preview",
      selectedEvidence: '["github_issue","issue:42","20000000-0000-4000-8000-000000000002"]',
    });
    render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: brief } })} />);
    const target = screen.getByRole("complementary", { name: "已聚焦 Evidence" });
    expect(target).toHaveAttribute("id", "copilot-selected-evidence");
    expect(target).toHaveAttribute("tabindex", "-1");
    expect([...target.querySelectorAll("dd")].map((node) => node.textContent)).toEqual([
      "github_issue", "issue:42", "20000000-0000-4000-8000-000000000002",
    ]);
    target.focus();
    expect(target).toHaveFocus();
  });

  it("keeps unavailable Evidence non-navigable and omits a target for unknown selection", async () => {
    const { syntheticProjectBrief, syntheticBriefId } = await import(
      "@/testing/project-brief/project-brief-fixture"
    );
    const brief = createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
      briefId: syntheticBriefId, mode: "preview", selectedEvidence: "unknown-reference",
    });
    render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: {
      ...brief, summary: { ...brief.summary, evidence: brief.summary.evidence.map((reference) => ({ ...reference, href: null })) },
    } } })} />);
    const summary = screen.getByRole("region", { name: "摘要" });
    expect(within(summary).getByText("不可导航 · github_issue")).toBeVisible();
    expect(within(summary).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "已聚焦 Evidence" })).not.toBeInTheDocument();
    expect(document.getElementById("copilot-selected-evidence")).toBeNull();
    expect(screen.getByRole("note", { name: "Brief 边界" })).toBeVisible();
  });
});


describe("Copilot Evidence fragment focus", () => {
  it("restores focus on fragment mount and page restoration without taking focus at other fragments", async () => {
    const { syntheticProjectBrief, syntheticBriefId } = await import(
      "@/testing/project-brief/project-brief-fixture"
    );
    const brief = createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
      briefId: syntheticBriefId, mode: "preview",
      selectedEvidence: '["github_issue","issue:42","20000000-0000-4000-8000-000000000002"]',
    });
    const originalUrl = window.location.href;
    try {
      window.history.replaceState(null, "", "#copilot-selected-evidence");
      const first = render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: brief } })} />);
      const target = screen.getByRole("complementary", { name: "已聚焦 Evidence" });
      expect(target).toHaveFocus();
      target.blur();
      expect(target).not.toHaveFocus();
      window.dispatchEvent(new Event("pageshow"));
      expect(target).toHaveFocus();
      first.unmount();

      window.history.replaceState(null, "", "#main-content");
      render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: brief } })} />);
      const otherFragmentTarget = screen.getByRole("complementary", { name: "已聚焦 Evidence" });
      expect(otherFragmentTarget).not.toHaveFocus();
      window.dispatchEvent(new Event("pageshow"));
      expect(otherFragmentTarget).not.toHaveFocus();
    } finally {
      window.history.replaceState(null, "", originalUrl);
    }
  });
});


async function themeBrief(selectedEvidence: string | null = null) {
  const { syntheticProjectBrief, syntheticBriefId } = await import(
    "@/testing/project-brief/project-brief-fixture"
  );
  return createCopilotProjectBriefViewModel(syntheticProjectBrief(), {
    briefId: syntheticBriefId,
    mode: "preview",
    selectedEvidence,
  });
}

describe("CopilotWorkspacePanel theme contracts", () => {
  it("preserves native GET fields and repeated context evidence in both modes", () => {
    for (const mode of ["preview", "connected"] as const) {
      const { unmount } = render(<CopilotWorkspacePanel viewModel={viewModel({ mode })} />);
      const hidden = [
        ["mode", mode], ["fromFeatureId", "project-galaxy"],
        ["fromProjectId", "project-odyssey"],
        ["fromEvidence", "evidence-goal"], ["fromEvidence", "evidence-freshness"],
      ];
      const switchForm = screen.getByRole<HTMLFormElement>("form", { name: "切换 Copilot 上下文" });
      const evidenceForm = screen.getByRole<HTMLFormElement>("form", { name: "添加证据引用" });
      expect(switchForm).toHaveAttribute("method", "get");
      expect(evidenceForm).toHaveAttribute("method", "get");
      expect([...new FormData(switchForm).entries()]).toEqual([
        ...hidden, ["action", "switch"], ["featureId", "project-galaxy"], ["projectId", "project-odyssey"],
      ]);
      expect([...new FormData(evidenceForm).entries()]).toEqual([
        ...hidden, ["action", "evidence"], ["evidenceReferenceIds", ""],
      ]);
      expect(within(evidenceForm).getByRole("textbox", { name: "证据引用 ID" })).toHaveAttribute("rows", "4");
      expect(switchForm.querySelector("[required]")).toBeNull();
      expect(evidenceForm.querySelector("[required]")).toBeNull();
      expect(screen.getByLabelText("数据来源")).toHaveAttribute("data-panel-mode", mode);
      unmount();
    }
  });

  it("preserves every explicit context transition label", () => {
    const reasons = [
      ["initialized", "本地 Shell 上下文已初始化"],
      ["identity_unchanged", "身份未变化，引用已保留"],
      ["feature_changed", "面板已切换，旧引用已清除"],
      ["project_changed", "项目已切换，旧引用已清除"],
      ["evidence_updated", "本地证据引用已更新"],
    ] as const;
    for (const [lastTransitionReason, label] of reasons) {
      const { unmount } = render(<CopilotWorkspacePanel viewModel={viewModel({ lastTransitionReason })} />);
      const region = screen.getByRole("region", { name: "当前上下文" });
      expect(within(region).getByText(label)).toBeVisible();
      expect([...region.querySelectorAll("dd")].map((node) => node.textContent)).toEqual([
        "project-galaxy", "project-odyssey",
      ]);
      unmount();
    }
  });

  it("retains Brief metadata Freshness timestamps and permanent Boundary", async () => {
    const brief = await themeBrief();
    const { rerender } = render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: brief } })} />);
    const metadata = screen.getByLabelText("Brief 元数据");
    expect([...metadata.querySelectorAll("dt")].map((node) => node.textContent)).toEqual(["Range", "Prompt", "Schema", "Fingerprint"]);
    expect([...metadata.querySelectorAll("dd")].map((node) => node.textContent)).toEqual([
      "2026-08-01T00:00:00.000Z → 2026-08-18T00:00:00.000Z",
      "project-brief-v1", "project-brief-schema-v1", "a".repeat(64),
    ]);
    const freshness = screen.getByRole("region", { name: "Freshness" });
    expect(freshness.querySelector("time")).toHaveAttribute("datetime", "2026-08-18T01:00:00.000Z");
    expect([...freshness.querySelectorAll("dd")].map((node) => node.textContent)).toEqual([
      "fresh", "2026-08-18T01:00:00.000Z", "2026-08-18T00:30:00.000Z", "是",
    ]);
    expect(screen.getByRole("note", { name: "Brief 边界" }).querySelector("p")?.textContent).toBe(brief.boundaryNote);
    rerender(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: {
      ...brief, freshness: { ...brief.freshness, lastSuccessfulAt: null, coverageComplete: false },
    } } })} />);
    expect([...screen.getByRole("region", { name: "Freshness" }).querySelectorAll("dd")].map((node) => node.textContent)).toEqual([
      "fresh", "2026-08-18T01:00:00.000Z", "未知", "否",
    ]);
    expect(screen.getByRole("note", { name: "Brief 边界" }).querySelector("p")?.textContent).toBe(brief.boundaryNote);
  });

  it("retains missing Evidence and the individual empty Brief sections", async () => {
    const brief = await themeBrief();
    const value = {
      ...brief,
      summary: { ...brief.summary, evidence: [] },
      officialStatus: { ...brief.officialStatus, evidence: [] },
      freshness: { ...brief.freshness, evidence: [] },
      sections: brief.sections.map((section) => section.id === "unknowns" ? {
        ...section, items: section.items.map((item) => ({ ...item, missingEvidence: ["已确认决策记录", "里程碑验收证据"] })),
      } : { ...section, empty: true, items: [] }),
    };
    const { rerender } = render(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value } })} />);
    for (const [name, text] of [["已完成变更", "暂无已完成变更"], ["进行中工作", "暂无进行中工作"], ["待处理事项", "暂无待处理事项"], ["风险信号", "暂无风险信号"]]) {
      expect(within(screen.getByRole("region", { name })).getByText(text)).toBeVisible();
    }
    for (const name of ["摘要", "官方状态", "Freshness", "未知项与缺失证据"]) {
      expect(within(screen.getByRole("region", { name })).getByText("无 Evidence 引用")).toBeVisible();
    }
    expect(within(screen.getByRole("region", { name: "未知项与缺失证据" })).getByText("缺失证据：已确认决策记录；里程碑验收证据")).toBeVisible();
    rerender(<CopilotWorkspacePanel viewModel={viewModel({ projectBrief: { status: "ready", value: {
      ...value, sections: value.sections.map((section) => ({ ...section, empty: true, items: [] })),
    } } })} />);
    expect(within(screen.getByRole("region", { name: "未知项与缺失证据" })).getByText("暂无未知项")).toBeVisible();
  });

  it("announces success and error without enabling follow-up controls", () => {
    for (const feedback of [
      { kind: "success", message: "本地证据引用已更新；未发送到外部服务。" },
      { kind: "error", message: "未知面板，未改变当前上下文。" },
    ] as const) {
      const { container, unmount } = render(<CopilotWorkspacePanel viewModel={viewModel()} feedback={feedback} />);
      const announcement = container.querySelector(`[data-feedback-kind="${feedback.kind}"]`);
      expect(announcement).toHaveAttribute("role", "status");
      expect(announcement?.textContent).toBe(feedback.message);
      const followUp = screen.getByRole("region", { name: "受约束追问" });
      expect(within(followUp).getByText("追问暂未启用")).toBeVisible();
      expect(within(followUp).getByText("无聊天历史、无外部搜索、无工具调用，也不会产生额外计费。")).toBeVisible();
      expect(followUp.querySelector("form, input, textarea, button")).toBeNull();
      expect(screen.getAllByRole("form")).toHaveLength(2);
      expect(screen.getByRole("note", { name: "Brief 边界" })).toBeVisible();
      unmount();
    }
  });

  it("preserves long context evidence and Brief content without truncation", async () => {
    const brief = await themeBrief();
    const text = "保留完整的项目上下文、证据边界和简报内容，所有数据均为本地合成。".repeat(12);
    const reference = "evidence-long-" + "bounded-evidence-".repeat(12);
    render(<CopilotWorkspacePanel viewModel={viewModel({
      context: { featureId: "project-galaxy", projectId: brief.projectId, evidenceReferenceIds: ["evidence-goal", reference] },
      projectBrief: { status: "ready", value: {
        ...brief, summary: { ...brief.summary, text },
        sections: brief.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, text })) })),
      } },
    })} />);
    expect(screen.getByRole("region", { name: "摘要" }).querySelector("p")?.textContent).toBe(text);
    expect(within(screen.getByRole("region", { name: "证据引用" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["evidence-goal", reference]);
    for (const name of ["已完成变更", "进行中工作", "未知项与缺失证据"]) {
      expect(screen.getByRole("region", { name }).querySelector("li > p")?.textContent).toBe(text);
    }
    expect(screen.getByLabelText("Brief 元数据").querySelectorAll("dd")[3].textContent).toBe("a".repeat(64));
    expect(screen.getByRole("note", { name: "Brief 边界" }).querySelector("p")?.textContent).toBe(brief.boundaryNote);
  });
});
