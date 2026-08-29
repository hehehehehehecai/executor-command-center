import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DecisionArchiveConnectedPort } from "@/features/decision-archive";

const production = vi.hoisted(() => ({ create: vi.fn(), load: vi.fn() }));

vi.mock("@/app/connected-panel-dependencies", () => ({
  createDecisionArchiveProductionConnectedPort: production.create,
}));

vi.mock("@/content/demo-data/decision-archive-preview-fixture", () => ({
  decisionArchivePreviewFixture: {
    localActionContext: {
      recordId: "record-local-preview",
      actorId: "preview-captain",
      occurredAt: "2026-08-17T14:00:00.000Z",
    },
  },
  loadDecisionArchivePreviewFixture: vi.fn(async () => ({
    provenanceLabel: "演示数据 · 完全虚构",
    candidates: [
      {
        id: "candidate-pending",
        proposedDecision: "采用虚构的分阶段发布策略",
        rationale: "虚构依据",
        alternatives: [],
        references: [],
        unknowns: "系统不知道用户动机。",
        sourceLabel: "本地 Candidate stub · 完全虚构",
        generatedAt: "2026-08-16T10:00:00.000Z",
        status: "pending",
        confirmedRecordId: null,
        revisitCondition: null,
      },
    ],
    records: [],
  })),
}));

import DecisionArchivePage from "./page";

production.create.mockImplementation(async () => ({ load: production.load }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/decision-archive Preview / Connected composition", () => {
  it("defaults explicitly to Preview and discloses fictional data", async () => {
    render(await DecisionArchivePage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Decision Archive" }),
    ).toBeVisible();
    expect(screen.getByText("Preview Mode")).toBeVisible();
    expect(screen.getByText("演示数据 · 完全虚构")).toBeVisible();
  });

  it("creates a transient manual Record with normalized user input", async () => {
    render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({
          action: "manual",
          decision: "  采用虚构的每周复盘  ",
          reason: "  保持   依据可追溯  ",
          alternatives: "月度复盘\n不复盘",
          revisitCondition: "维护成本上升时",
        }),
      }),
    );

    const records = screen.getByRole("region", { name: "正式决策记录" });
    expect(within(records).getByText("采用虚构的每周复盘")).toBeVisible();
    expect(within(records).getByText("保持 依据可追溯")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "本地记录预览已生成；未持久化。",
    );
  });

  it("confirms a Candidate only with a nonblank reason and keeps Candidate visible", async () => {
    render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({
          action: "confirm",
          candidateId: "candidate-pending",
          reason: "用户明确确认虚构发布策略",
        }),
      }),
    );

    const candidates = screen.getByRole("region", { name: "决策候选" });
    const records = screen.getByRole("region", { name: "正式决策记录" });
    expect(within(candidates).getByText("Candidate 状态：confirmed")).toBeVisible();
    expect(within(records).getByText("采用虚构的分阶段发布策略")).toBeVisible();
    expect(within(records).getByText("用户明确确认虚构发布策略")).toBeVisible();
    expect(within(records).getByText("来源 Candidate：candidate-pending")).toBeVisible();
  });

  it("rejects a blank confirmation reason without creating a Record", async () => {
    render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({
          action: "confirm",
          candidateId: "candidate-pending",
          reason: "   ",
        }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("确认原因不能为空。");
    expect(screen.getByText("暂无正式决策记录")).toBeVisible();
  });

  it("uses only an injected Connected port and fails closed", async () => {
    const connectedPort: DecisionArchiveConnectedPort = {
      load: vi.fn(async () => ({
        provenanceLabel: "Connected read stub",
        candidates: [],
        records: [],
      })),
    };
    const { rerender } = render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({ mode: "connected" }),
        connectedPort,
      }),
    );

    expect(screen.getByText("Connected Mode")).toBeVisible();
    expect(screen.getByText("Connected read stub")).toBeVisible();

    rerender(
      await DecisionArchivePage({
        searchParams: Promise.resolve({ mode: "connected" }),
        connectedPort: { load: async () => Promise.reject(new Error("failed")) },
      }),
    );

    expect(screen.getByText("Connected 数据暂时不可用。")).toBeVisible();
    expect(screen.queryByText("演示数据 · 完全虚构")).not.toBeInTheDocument();
  });

  it("uses the production adapter and renders a real empty archive", async () => {
    production.load.mockResolvedValueOnce({
      provenanceLabel: "Connected 数据 · 当前项目",
      candidates: [],
      records: [],
    });
    render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({ mode: "connected", project: "22222222-2222-4222-8222-222222222222" }),
      }),
    );

    expect(production.create).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(production.load).toHaveBeenCalledOnce();
    expect(screen.getByText("暂无待审阅的决策候选")).toBeVisible();
    expect(screen.getByText("暂无正式决策记录")).toBeVisible();
  });

  it("rejects unknown modes rather than defaulting", async () => {
    render(
      await DecisionArchivePage({
        searchParams: Promise.resolve({ mode: "surprise" }),
      }),
    );

    expect(screen.getByText("面板模式无效。")).toBeVisible();
    expect(screen.queryByText("Preview Mode")).not.toBeInTheDocument();
  });
});
