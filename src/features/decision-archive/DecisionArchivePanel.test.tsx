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
