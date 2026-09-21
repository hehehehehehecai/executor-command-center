import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DecisionArchivePanel } from "./DecisionArchivePanel";
import {
  createDecisionArchiveViewModel,
  type DecisionArchiveSource,
} from "./decision-archive-view-model";

function source(overrides: Partial<DecisionArchiveSource> = {}): DecisionArchiveSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    candidates: [
      {
        id: "candidate-pending",
        proposedDecision: "采用虚构的分阶段发布策略",
        rationale: "虚构活动仅形成待确认候选。",
        alternatives: ["继续整批发布"],
        references: [],
        unknowns: "系统不知道用户动机。",
        sourceLabel: "本地 Candidate stub · 完全虚构",
        generatedAt: "2026-08-16T10:00:00.000Z",
        status: "pending",
        confirmedRecordId: null,
        revisitCondition: "发布风险下降后重新审视",
      },
      {
        id: "candidate-confirmed",
        proposedDecision: "保留虚构 Preview 披露",
        rationale: "虚构规则候选。",
        alternatives: [],
        references: [],
        unknowns: "无真实数据。",
        sourceLabel: "本地 Candidate stub · 完全虚构",
        generatedAt: "2026-08-15T10:00:00.000Z",
        status: "confirmed",
        confirmedRecordId: "record-ai",
        revisitCondition: null,
      },
    ],
    records: [
      {
        id: "record-manual",
        decision: "手动创建的虚构决定",
        confirmationReason: "用户主动记录决定与原因。",
        alternatives: ["不记录"],
        references: [],
        status: "active",
        revisitCondition: null,
        createdVia: "manual",
        confirmedBy: "preview-captain",
        confirmedAt: "2026-08-15T09:00:00.000Z",
        sourceCandidateId: null,
      },
      {
        id: "record-ai",
        decision: "保留虚构 Preview 披露",
        confirmationReason: "用户补充的确认原因。",
        alternatives: [],
        references: [],
        status: "active",
        revisitCondition: null,
        createdVia: "candidate_confirmation",
        confirmedBy: "preview-captain",
        confirmedAt: "2026-08-15T11:00:00.000Z",
        sourceCandidateId: "candidate-confirmed",
      },
    ],
    ...overrides,
  };
}

afterEach(cleanup);

describe("DecisionArchivePanel", () => {
  it("renders Candidate and Record in distinct semantic regions", () => {
    render(
      <DecisionArchivePanel
        viewModel={createDecisionArchiveViewModel(source(), "preview")}
      />,
    );

    const candidates = screen.getByRole("region", { name: "决策候选" });
    const records = screen.getByRole("region", { name: "正式决策记录" });
    expect(screen.getByLabelText("数据来源")).toHaveTextContent(
      "Demo · 演示数据 · 完全虚构",
    );
    expect(within(candidates).getAllByRole("article")).toHaveLength(2);
    expect(within(records).getAllByRole("article")).toHaveLength(2);
    expect(within(candidates).getByText("采用虚构的分阶段发布策略")).toBeVisible();
    expect(within(records).getByText("手动创建的虚构决定")).toBeVisible();
  });

  it("provides required manual and Candidate confirmation forms without persistence claims", () => {
    render(
      <DecisionArchivePanel
        viewModel={createDecisionArchiveViewModel(source(), "preview")}
      />,
    );

    const manual = screen.getByRole("form", { name: "手动创建决策记录" });
    expect(within(manual).getByRole("textbox", { name: "决定内容" })).toBeRequired();
    expect(within(manual).getByRole("textbox", { name: "确认原因" })).toBeRequired();
    expect(within(manual).getByRole("button", { name: "生成本地记录预览" })).toBeVisible();

    const confirm = screen.getByRole("form", {
      name: "确认候选：采用虚构的分阶段发布策略",
    });
    expect(within(confirm).getByRole("textbox", { name: "用户确认原因" })).toBeRequired();
    expect(
      within(confirm).getByRole("button", { name: "确认并生成本地记录" }),
    ).toBeVisible();
    expect(screen.getAllByText(/不会持久化|未持久化/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/模型调用成功|数据库保存成功/)).not.toBeInTheDocument();
  });

  it("shows Candidate lineage and distinguishes manual from confirmed records", () => {
    render(
      <DecisionArchivePanel
        viewModel={createDecisionArchiveViewModel(source(), "preview")}
      />,
    );

    expect(screen.getByText("Candidate 状态：pending")).toBeVisible();
    expect(screen.getByText("Candidate 状态：confirmed")).toBeVisible();
    expect(screen.getByText("创建方式：手动创建")).toBeVisible();
    expect(screen.getByText("创建方式：用户确认 Candidate")).toBeVisible();
    expect(screen.getByText("来源 Candidate：candidate-confirmed")).toBeVisible();
  });

  it("shows independent empty states and local action feedback", () => {
    render(
      <DecisionArchivePanel
        viewModel={createDecisionArchiveViewModel(
          source({ candidates: [], records: [] }),
          "preview",
        )}
        feedback={{ kind: "error", message: "确认原因不能为空。" }}
      />,
    );

    expect(screen.getByText("暂无待审阅的决策候选")).toBeVisible();
    expect(screen.getByText("暂无正式决策记录")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("确认原因不能为空。");
  });
});


describe("DecisionArchivePanel theme contracts", () => {
  it("preserves accessible heading and ordered UTC dates including invalid dates", () => {
    const { unmount } = render(
      <DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source(), "preview")} />,
    );
    expect(screen.getByRole("main", { name: "Decision Archive" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { level: 1, name: "Decision Archive" })).toHaveAttribute("id", "decision-archive-title");
    expect(Array.from(document.querySelectorAll("time"), (time) => [time.dateTime, time.textContent])).toEqual([
      ["2026-08-15T10:00:00.000Z", "2026-08-15 10:00 UTC"],
      ["2026-08-16T10:00:00.000Z", "2026-08-16 10:00 UTC"],
      ["2026-08-15T11:00:00.000Z", "2026-08-15 11:00 UTC"],
      ["2026-08-15T09:00:00.000Z", "2026-08-15 09:00 UTC"],
    ]);
    unmount();
    const original = source();
    render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source({
      candidates: [{ ...original.candidates[0], generatedAt: "invalid-candidate-date" }],
      records: [{ ...original.records[0], confirmedAt: "invalid-record-date" }],
    }), "preview")} />);
    expect(Array.from(document.querySelectorAll("time"), (time) => [time.dateTime, time.textContent])).toEqual([
      ["invalid-candidate-date", "时间未知"],
      ["invalid-record-date", "时间未知"],
    ]);
  });

  it("retains four reference kinds and safe links while degrading unsafe URLs to text", () => {
    const kinds = ["commit", "pull_request", "issue", "document"] as const;
    const labels = ["Commit", "Pull Request", "Issue", "Document"];
    const unsafeUrls = ["http://example.test/plain", "javascript:alert(1)", "https://user:pass@example.test/private", null];
    const references = kinds.flatMap((kind, index) => [
      { id: `${kind}-safe`, kind, label: `安全${index}`, originalUrl: `https://example.test/${kind}` },
      { id: `${kind}-text`, kind, label: `降级${index}`, originalUrl: unsafeUrls[index] },
    ]);
    render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source({
      candidates: [{ ...source().candidates[0], references }], records: [],
    }), "preview")} />);
    const candidates = screen.getByRole("region", { name: "决策候选" });
    expect(within(candidates).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      labels.flatMap((label, index) => [`${label} · 安全${index}`, `${label} · 降级${index}`]),
    );
    for (const [index, kind] of kinds.entries()) {
      expect(within(candidates).getByRole("link", { name: `安全${index}` })).toHaveAttribute("href", `https://example.test/${kind}`);
      expect(within(candidates).getByText(`降级${index}`, { exact: true })).toBeVisible();
      expect(within(candidates).queryByRole("link", { name: `降级${index}` })).not.toBeInTheDocument();
    }
  });

  it("serializes every native GET field in both modes without changing control rows", () => {
    for (const mode of ["preview", "connected"] as const) {
      const { unmount } = render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source(), mode)} />);
      expect(screen.getByLabelText("数据来源")).toHaveAttribute("data-panel-mode", mode);
      const manual = screen.getByRole("form", { name: "手动创建决策记录" });
      const confirm = screen.getByRole("form", { name: "确认候选：采用虚构的分阶段发布策略" });
      expect(manual).toHaveAttribute("method", "get");
      expect(confirm).toHaveAttribute("method", "get");
      expect(Object.fromEntries(new FormData(manual as HTMLFormElement))).toEqual({
        mode, action: "manual", decision: "", reason: "", alternatives: "", revisitCondition: "",
      });
      expect(Object.fromEntries(new FormData(confirm as HTMLFormElement))).toEqual({
        mode, action: "confirm", candidateId: "candidate-pending", reason: "",
      });
      expect(Array.from(manual.querySelectorAll("textarea"), (input) => [input.name, input.rows, input.required])).toEqual([
        ["decision", 3, true], ["reason", 3, true], ["alternatives", 3, false],
      ]);
      expect(within(manual).getByRole("textbox", { name: "重新审视条件（可选）" })).not.toBeRequired();
      expect(within(confirm).getByRole("textbox", { name: "用户确认原因" })).toHaveAttribute("rows", "3");
      expect(within(manual).getByRole("button")).toHaveAttribute("type", "submit");
      expect(within(confirm).getByRole("button")).toHaveAttribute("type", "submit");
      unmount();
    }
  });

  it("keeps confirmed lineage without another form and retains missing-value fallbacks", () => {
    const original = source();
    render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source({
      candidates: [{ ...original.candidates[1], confirmedRecordId: null }],
      records: [{ ...original.records[0], confirmedBy: "", alternatives: [] }],
    }), "preview")} />);
    const candidate = within(screen.getByRole("region", { name: "决策候选" })).getByRole("article");
    const record = within(screen.getByRole("region", { name: "正式决策记录" })).getByRole("article");
    expect(candidate).toHaveAttribute("data-candidate-status", "confirmed");
    expect(within(candidate).getByText("已确认记录 ID：记录 ID 不可用")).toBeVisible();
    expect(within(candidate).queryByRole("form")).not.toBeInTheDocument();
    expect(within(candidate).getByText("系统不知道什么").nextElementSibling).toHaveTextContent("无真实数据。");
    expect(within(candidate).getByText("候选来源").nextElementSibling).toHaveTextContent("本地 Candidate stub · 完全虚构");
    expect(within(candidate).getByText("重新审视条件").nextElementSibling).toHaveTextContent("未提供");
    expect(within(record).getByText("确认者").nextElementSibling).toBeEmptyDOMElement();
    expect(within(record).getByText("来源 Candidate").nextElementSibling).toHaveTextContent("无（手动创建）");
    expect(within(record).getByText("未记录替代方案")).toBeVisible();
    expect(screen.getAllByText("暂无关联引用")).toHaveLength(2);
  });

  it("keeps each independent empty region and both local feedback kinds", () => {
    for (const empty of ["candidates", "records"] as const) {
      const feedback = empty === "candidates"
        ? { kind: "success" as const, message: "本地记录预览已生成；未持久化。" }
        : { kind: "error" as const, message: "确认原因不能为空。" };
      const { unmount } = render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source({ [empty]: [] }), "preview")} feedback={feedback} />);
      const candidates = screen.getByRole("region", { name: "决策候选" });
      const records = screen.getByRole("region", { name: "正式决策记录" });
      expect(within(candidates).queryAllByRole("article")).toHaveLength(empty === "candidates" ? 0 : 2);
      expect(within(records).queryAllByRole("article")).toHaveLength(empty === "records" ? 0 : 2);
      expect(within(empty === "candidates" ? candidates : records).getByText("0 项")).toBeVisible();
      expect(screen.getByText(empty === "candidates" ? "暂无待审阅的决策候选" : "暂无正式决策记录")).toBeVisible();
      expect(screen.getByRole("status")).toHaveAttribute("data-feedback-kind", feedback.kind);
      expect(screen.getByRole("status")).toHaveTextContent(feedback.message);
      unmount();
    }
  });

  it("preserves complete long decision evidence and record content in stable order", () => {
    const title = "长内容决策与证据需要逐项人工核对。".repeat(18);
    const detail = "完整保留候选依据、用户确认原因和系统未知事项。".repeat(16);
    const original = source();
    render(<DecisionArchivePanel viewModel={createDecisionArchiveViewModel(source({
      candidates: [{ ...original.candidates[0], proposedDecision: title, rationale: detail, unknowns: detail, sourceLabel: detail, revisitCondition: detail }],
      records: [
        { ...original.records[0], id: "z-record", decision: title, confirmationReason: detail, alternatives: [detail] },
        { ...original.records[1], id: "a-record", decision: title },
      ],
    }), "preview")} />);
    expect(screen.getAllByRole("heading", { level: 3, name: title })).toHaveLength(3);
    const candidates = screen.getByRole("region", { name: "决策候选" });
    for (const label of ["候选依据", "系统不知道什么", "候选来源", "重新审视条件"]) {
      expect(within(candidates).getByText(label).nextElementSibling?.textContent).toBe(detail);
    }
    const records = within(screen.getByRole("region", { name: "正式决策记录" })).getAllByRole("article");
    expect(within(records[0]).getByText("创建方式：用户确认 Candidate")).toBeVisible();
    expect(within(records[1]).getByText("用户确认原因").nextElementSibling?.textContent).toBe(detail);
    expect(within(records[1]).getByRole("listitem").textContent).toBe(detail);
  });
});
