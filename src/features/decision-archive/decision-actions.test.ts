import { afterEach, describe, expect, it, vi } from "vitest";

import {
  confirmDecisionCandidate,
  createManualDecisionRecord,
  type DecisionActionContext,
} from "./decision-actions";
import {
  createDecisionArchiveViewModel,
  type DecisionArchiveSource,
} from "./decision-archive-view-model";

const context: DecisionActionContext = {
  recordId: "record-local-42",
  actorId: "preview-captain",
  occurredAt: "2026-08-17T14:00:00.000Z",
};

function source(): DecisionArchiveSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    candidates: [
      {
        id: "candidate-pending",
        proposedDecision: "采用虚构的分阶段发布策略",
        rationale: "虚构记录显示大批发布难以人工复核。",
        alternatives: ["继续整批发布", "暂停所有发布"],
        references: [
          {
            id: "ref-commit",
            kind: "commit",
            label: "虚构 Commit abc123",
            originalUrl: "https://github.example.test/fictional/commit/abc123",
          },
        ],
        unknowns: "系统不知道线下评审结果。",
        sourceLabel: "本地 Candidate stub · 完全虚构",
        generatedAt: "2026-08-16T10:00:00.000Z",
        status: "pending",
        confirmedRecordId: null,
        revisitCondition: "发布失败率连续上升时重新审视",
      },
      {
        id: "candidate-confirmed",
        proposedDecision: "保留虚构双轨验证",
        rationale: "虚构事实仅用于测试。",
        alternatives: [],
        references: [],
        unknowns: "无真实项目信息。",
        sourceLabel: "本地 Candidate stub · 完全虚构",
        generatedAt: "2026-08-15T10:00:00.000Z",
        status: "confirmed",
        confirmedRecordId: "record-existing",
        revisitCondition: null,
      },
    ],
    records: [
      {
        id: "record-existing",
        decision: "保留虚构双轨验证",
        confirmationReason: "用户已明确确认此演示决定。",
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
  };
}

function viewModel() {
  return createDecisionArchiveViewModel(source(), "preview");
}

afterEach(() => vi.restoreAllMocks());

describe("Decision Archive local actions", () => {
  it("creates a manual Record without requiring or changing a Candidate", () => {
    const initial = viewModel();
    const candidatesSnapshot = structuredClone(initial.candidates);

    const result = createManualDecisionRecord(
      initial,
      {
        decision: "  采用虚构的每周复盘  ",
        confirmationReason: "  保持   决策依据 可追溯。 ",
        alternatives: [" 月度复盘 ", "", "不复盘"],
        references: [],
        revisitCondition: "  当维护成本超过收益时  ",
      },
      context,
    );

    expect(result.candidates).toEqual(candidatesSnapshot);
    expect(result.records.at(-1)).toEqual({
      id: "record-local-42",
      decision: "采用虚构的每周复盘",
      confirmationReason: "保持 决策依据 可追溯。",
      alternatives: ["月度复盘", "不复盘"],
      references: [],
      status: "active",
      revisitCondition: "当维护成本超过收益时",
      createdVia: "manual",
      confirmedBy: "preview-captain",
      confirmedAt: "2026-08-17T14:00:00.000Z",
      sourceCandidateId: null,
    });
  });

  it("confirms one Candidate with a required user reason and complete lineage", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const initial = viewModel();
    const candidateSnapshot = structuredClone(initial.candidates[1]);

    const result = confirmDecisionCandidate(
      initial,
      {
        candidateId: "candidate-pending",
        confirmationReason: "  用户确认先降低   单次发布风险。 ",
      },
      context,
    );

    expect(result.candidates.find(({ id }) => id === "candidate-pending")).toEqual({
      ...candidateSnapshot,
      status: "confirmed",
      confirmedRecordId: "record-local-42",
    });
    expect(initial.candidates.find(({ id }) => id === "candidate-pending")).toEqual(
      candidateSnapshot,
    );
    expect(result.records.at(-1)).toMatchObject({
      id: "record-local-42",
      decision: "采用虚构的分阶段发布策略",
      confirmationReason: "用户确认先降低 单次发布风险。",
      alternatives: ["继续整批发布", "暂停所有发布"],
      status: "active",
      createdVia: "candidate_confirmation",
      confirmedBy: "preview-captain",
      confirmedAt: "2026-08-17T14:00:00.000Z",
      sourceCandidateId: "candidate-pending",
    });
    expect(result.records.at(-1)?.references).toEqual(candidateSnapshot?.references);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "\n\t"])("rejects a blank confirmation reason: %j", (reason) => {
    expect(() =>
      confirmDecisionCandidate(
        viewModel(),
        { candidateId: "candidate-pending", confirmationReason: reason },
        context,
      ),
    ).toThrow("decision_confirmation_reason_required");
  });

  it("fails duplicate and unknown Candidate confirmation closed", () => {
    expect(() =>
      confirmDecisionCandidate(
        viewModel(),
        {
          candidateId: "candidate-confirmed",
          confirmationReason: "再次确认不应成功",
        },
        { ...context, recordId: "record-another" },
      ),
    ).toThrow("decision_candidate_already_confirmed");
    expect(() =>
      confirmDecisionCandidate(
        viewModel(),
        { candidateId: "candidate-missing", confirmationReason: "未知候选" },
        context,
      ),
    ).toThrow("decision_candidate_not_found");
  });

  it("rejects blank manual fields, duplicate IDs and invalid injected context", () => {
    expect(() =>
      createManualDecisionRecord(
        viewModel(),
        {
          decision: " ",
          confirmationReason: "有效原因",
          alternatives: [],
          references: [],
          revisitCondition: null,
        },
        context,
      ),
    ).toThrow("decision_content_required");
    expect(() =>
      createManualDecisionRecord(
        viewModel(),
        {
          decision: "有效决定",
          confirmationReason: " ",
          alternatives: [],
          references: [],
          revisitCondition: null,
        },
        context,
      ),
    ).toThrow("decision_confirmation_reason_required");
    expect(() =>
      createManualDecisionRecord(
        viewModel(),
        {
          decision: "有效决定",
          confirmationReason: "有效原因",
          alternatives: [],
          references: [],
          revisitCondition: null,
        },
        { ...context, recordId: "record-existing" },
      ),
    ).toThrow("decision_record_id_conflict");
    expect(() =>
      createManualDecisionRecord(
        viewModel(),
        {
          decision: "有效决定",
          confirmationReason: "有效原因",
          alternatives: [],
          references: [],
          revisitCondition: null,
        },
        { ...context, occurredAt: "not-a-time" },
      ),
    ).toThrow("decision_action_context_invalid");
  });
});
