import { describe, expect, expectTypeOf, it } from "vitest";

import type { PanelMode } from "@/shared/panel-query";

import {
  createDecisionArchiveViewModel,
  type DecisionArchiveSource,
  type DecisionArchiveViewModel,
  type DecisionCandidate,
  type DecisionRecord,
} from "./decision-archive-view-model";

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    id: "candidate-z",
    proposedDecision: "采用虚构的按需发布窗口",
    rationale: "虚构活动显示发布节奏需要人工确认。",
    alternatives: ["保持固定周更"],
    references: [
      {
        id: "ref-pr-17",
        kind: "pull_request",
        label: "虚构 PR #17",
        originalUrl: "https://github.example.test/fictional/odyssey/pull/17",
      },
    ],
    unknowns: "系统不知道线下讨论与本地未提交内容。",
    sourceLabel: "本地 Candidate stub · 完全虚构",
    generatedAt: "2026-08-16T10:00:00.000Z",
    status: "pending",
    confirmedRecordId: null,
    revisitCondition: "连续两个发布窗口未达成目标时重新审视",
    ...overrides,
  };
}

function record(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "record-z",
    decision: "保留虚构 Preview 披露",
    confirmationReason: "避免将演示数据误认为真实连接。",
    alternatives: ["仅使用颜色区分"],
    references: [],
    status: "active",
    revisitCondition: null,
    createdVia: "manual",
    confirmedBy: "preview-captain",
    confirmedAt: "2026-08-15T09:00:00.000Z",
    sourceCandidateId: null,
    ...overrides,
  };
}

function source(): DecisionArchiveSource {
  return {
    provenanceLabel: "演示数据 · 完全虚构",
    candidates: [candidate(), candidate({ id: "candidate-a" })],
    records: [record(), record({ id: "record-a", decision: "相同标题" })],
  };
}

describe("Decision Archive View Model", () => {
  it("uses distinct Candidate and Record contracts in distinct collections", () => {
    const result = createDecisionArchiveViewModel(source(), "preview");

    expectTypeOf(result).toEqualTypeOf<DecisionArchiveViewModel>();
    expectTypeOf(result.mode).toEqualTypeOf<PanelMode>();
    expectTypeOf(result.candidates).toEqualTypeOf<readonly DecisionCandidate[]>();
    expectTypeOf(result.records).toEqualTypeOf<readonly DecisionRecord[]>();
    expect(Object.keys(result.candidates[0] ?? {})).not.toEqual(
      Object.keys(result.records[0] ?? {}),
    );
    expect(result.candidates.map(({ id }) => id)).toEqual(["candidate-a", "candidate-z"]);
    expect(result.records.map(({ id }) => id)).toEqual(["record-a", "record-z"]);
  });

  it("keeps same-title items separate by stable ID rather than merging", () => {
    const result = createDecisionArchiveViewModel(
      {
        provenanceLabel: "演示数据 · 完全虚构",
        candidates: [
          candidate({ id: "candidate-one", proposedDecision: "相同决定" }),
          candidate({ id: "candidate-two", proposedDecision: "相同决定" }),
        ],
        records: [record({ id: "record-one", decision: "相同决定" })],
      },
      "preview",
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.records).toHaveLength(1);
  });

  it("sanitizes references to credential-free https links", () => {
    const result = createDecisionArchiveViewModel(
      {
        provenanceLabel: "演示数据 · 完全虚构",
        candidates: [
          candidate({
            references: [
              {
                id: "safe",
                kind: "issue",
                label: "安全引用",
                originalUrl: "https://github.example.test/issues/1",
              },
              {
                id: "unsafe",
                kind: "document",
                label: "不安全引用",
                originalUrl: "javascript:alert(1)",
              },
            ],
          }),
        ],
        records: [],
      },
      "preview",
    );

    expect(result.candidates[0]?.references.map(({ originalUrl }) => originalUrl)).toEqual([
      "https://github.example.test/issues/1",
      null,
    ]);
  });
});
