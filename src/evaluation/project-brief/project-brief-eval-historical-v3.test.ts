import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import * as historicalContracts from "./project-brief-eval-historical-contracts";
import * as historicalConverter from "./project-brief-eval-historical-converter";
import {
  historicalBriefSourceRegistry,
} from "./project-brief-eval-historical-registry";
import {
  evaluateProjectBriefDatasetV2,
  loadProjectBriefEvalManifestV2,
} from "./project-brief-eval-v2";
import { projectBriefEvalV2CaseRegistry } from "./project-brief-eval-v2-case-registry";

type Check = { readonly status: string; readonly reasonCode: string };
type Statement = {
  statementId: string;
  normalizedText: string;
  sourceSection: string;
  statementKind: "project_fact" | "workflow_note" | "unknown";
  evidenceIds: string[];
  sourceProvenance: {
    startLine: number;
    endLine: number;
    sourceTextHash: string;
  };
};
type TimeRange = {
  start: { precision: string; value: string; exactInstant: string };
  end: { precision: string; value: string; exactInstant: string };
  sourceTextHash: string;
};
type HistoricalCaseV3 = {
  caseId: string;
  contractVersion: string;
  sourceArtifact: { documentSha256: string };
  humanConfirmationReceipt: unknown;
  projection: {
    statements: Statement[];
    evidenceCatalog: { evidenceId: string }[];
    timeRange: TimeRange;
  };
  caseFingerprint: string;
  contentFingerprint: string;
};
type ConverterV3 = {
  classifyHistoricalStatement(input: { readonly sourceSection: string; readonly text: string }): string;
  validateHistoricalStatementEvidence(projection: HistoricalCaseV3["projection"]): Check;
  validateHistoricalTimeRange(input: unknown): Check;
  parseHistoricalTimeRange(metadata: string): TimeRange;
  loadRegisteredHistoricalBriefCaseV3(caseId: string): Promise<HistoricalCaseV3>;
  loadRegisteredHistoricalBriefCasesV3(): Promise<readonly HistoricalCaseV3[]>;
};
type DatasetV3 = {
  loadProjectBriefEvalManifestV3(): Promise<{
    cases: { caseId: string; contractVersion: string; contentFingerprint: string }[];
    counts: {
      includedTotal: number;
      syntheticContract: number;
      humanConfirmedHistorical: number;
      pendingHumanConfirmation: number;
    };
    datasetFingerprint: string;
  }>;
  evaluateProjectBriefDatasetV3(input: unknown): Promise<{
    readonly releaseGate: string;
    readonly blockedReasons: readonly string[];
    readonly resultFingerprint: string;
    readonly caseCounts: { readonly expectedOutcomesMatched: number };
    readonly cases: readonly {
      readonly caseId: string;
      readonly checks: Readonly<Record<string, Check>>;
      readonly expectationMatched: boolean;
    }[];
  }>;
};

const modulePath = "./project-brief-eval-v3";

async function loadDatasetV3(): Promise<DatasetV3 | null> {
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<DatasetV3 | null>;
}

function converterV3(): ConverterV3 | null {
  const candidate = historicalConverter as unknown as Partial<ConverterV3>;
  return typeof candidate.classifyHistoricalStatement === "function"
    && typeof candidate.validateHistoricalStatementEvidence === "function"
    && typeof candidate.validateHistoricalTimeRange === "function"
    && typeof candidate.parseHistoricalTimeRange === "function"
    && typeof candidate.loadRegisteredHistoricalBriefCaseV3 === "function"
    && typeof candidate.loadRegisteredHistoricalBriefCasesV3 === "function"
    ? candidate as ConverterV3
    : null;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("historical Brief semantic projection v3", () => {
  it("freezes explicit versions without changing the v2 contract", async () => {
    expect(historicalContracts.historicalBriefEvalCaseContractVersion)
      .toBe("project-brief-eval-case.v2");
    expect(Reflect.get(historicalContracts, "historicalBriefProjectionV2ContractVersion"))
      .toBe("project-brief-eval-historical-projection.v2");
    expect(Reflect.get(historicalContracts, "historicalBriefStatementClassificationVersion"))
      .toBe("project-brief-eval-historical-statement-classification.v1");
    expect(Reflect.get(historicalContracts, "historicalBriefTimePrecisionVersion"))
      .toBe("project-brief-eval-historical-time-precision.v1");
    expect(Reflect.get(historicalContracts, "historicalBriefEvalCaseV3ContractVersion"))
      .toBe("project-brief-eval-case.v3");
    expect(await loadDatasetV3()).not.toBeNull();
  });

  it("classifies statements by section and self-referential workflow semantics", () => {
    const converter = converterV3();
    expect(converter).not.toBeNull();
    if (converter === null) return;

    expect(converter.classifyHistoricalStatement({
      sourceSection: "Ongoing Work",
      text: "本简报作为当前快照候选，冻结后再转换为历史 Case。",
    })).toBe("workflow_note");
    expect(converter.classifyHistoricalStatement({
      sourceSection: "Ongoing Work",
      text: "Phase 9 已进入审核流程。[E-003]",
    })).toBe("project_fact");
    expect(converter.classifyHistoricalStatement({
      sourceSection: "Unknowns",
      text: "精确时间待确认。",
    })).toBe("unknown");
  });

  it("keeps the Explorer workflow note traceable without treating it as a project fact", async () => {
    const converter = converterV3();
    expect(converter).not.toBeNull();
    if (converter === null) return;

    const item = await converter.loadRegisteredHistoricalBriefCaseV3("eval-hist-01-explorer");
    const note = item.projection.statements.find(({ statementKind }) =>
      statementKind === "workflow_note");
    expect(note).toMatchObject({
      statementId: "ongoing-work-003",
      sourceSection: "Ongoing Work",
      statementKind: "workflow_note",
      evidenceIds: [],
    });
    expect(note?.normalizedText).toContain("第一个“待人工确认的当前快照”候选");
    expect(note?.sourceProvenance).toMatchObject({ startLine: 3, endLine: 3 });
    expect(note?.sourceProvenance.sourceTextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(item.projection.statements.filter(({ statementKind }) =>
      statementKind === "project_fact").every(({ evidenceIds }) => evidenceIds.length > 0))
      .toBe(true);
  });

  it("keeps project-fact Evidence strict and rejects classification or provenance drift", async () => {
    const converter = converterV3();
    expect(converter).not.toBeNull();
    if (converter === null) return;
    const item = await converter.loadRegisteredHistoricalBriefCaseV3("eval-hist-01-explorer");

    expect(converter.validateHistoricalStatementEvidence(item.projection)).toEqual({
      status: "pass",
      reasonCode: "historical_statement_evidence_valid",
    });
    const noteIndex = item.projection.statements.findIndex(({ statementKind }) =>
      statementKind === "workflow_note");
    const asFact = structuredClone(item.projection);
    asFact.statements[noteIndex]!.statementKind = "project_fact";
    expect(converter.validateHistoricalStatementEvidence(asFact)).toEqual({
      status: "blocked",
      reasonCode: "historical_project_fact_evidence_unavailable",
    });

    const factIndex = item.projection.statements.findIndex(({ statementKind }) =>
      statementKind === "project_fact");
    const missingEvidence = structuredClone(item.projection);
    missingEvidence.statements[factIndex]!.evidenceIds = [];
    expect(converter.validateHistoricalStatementEvidence(missingEvidence)).toEqual({
      status: "blocked",
      reasonCode: "historical_project_fact_evidence_unavailable",
    });

    const badUnknown = structuredClone(item.projection);
    const unknownIndex = badUnknown.statements.findIndex(({ statementKind }) =>
      statementKind === "unknown");
    badUnknown.statements[unknownIndex]!.statementKind = "project_fact";
    expect(converter.validateHistoricalStatementEvidence(badUnknown)).toEqual({
      status: "fail",
      reasonCode: "historical_statement_classification_invalid",
    });

    const badHash = structuredClone(item.projection);
    badHash.statements[noteIndex]!.sourceProvenance.sourceTextHash = "0".repeat(64);
    expect(converter.validateHistoricalStatementEvidence(badHash)).toEqual({
      status: "fail",
      reasonCode: "historical_statement_provenance_invalid",
    });
  });

  it("preserves date precision without borrowing confirmation, Git, mtime, or midnight", async () => {
    const converter = converterV3();
    expect(converter).not.toBeNull();
    if (converter === null) return;
    const item = await converter.loadRegisteredHistoricalBriefCaseV3("eval-hist-01-explorer");
    expect(item.projection.timeRange).toMatchObject({
      start: { precision: "date", value: "2026-08-18", exactInstant: "unknown" },
      end: {
        precision: "instant",
        value: "2026-08-19T02:40:21Z",
        exactInstant: "2026-08-19T02:40:21Z",
      },
    });
    expect(converter.validateHistoricalTimeRange(item.projection.timeRange)).toEqual({
      status: "pass",
      reasonCode: "historical_time_range_date_precision_preserved",
    });

    const metadata = [
      "- 时间范围起点：2026-08-18（精确 UTC 时间待确认）",
      "- 简报时间点：2026-08-19T02:40:21Z",
      "- 人工确认时间：2026-08-19T02:56:05Z",
      "- Git 时间：2026-08-18T02:46:33Z",
      "- mtime：2026-08-18T00:00:00Z",
    ].join("\n");
    expect(converter.parseHistoricalTimeRange(metadata).start).toEqual({
      precision: "date",
      value: "2026-08-18",
      exactInstant: "unknown",
    });

    const fabricatedMidnight = structuredClone(item.projection.timeRange);
    fabricatedMidnight.start.exactInstant = "2026-08-18T00:00:00Z";
    expect(converter.validateHistoricalTimeRange(fabricatedMidnight)).toEqual({
      status: "fail",
      reasonCode: "historical_time_range_precision_invalid",
    });
    const reversed = structuredClone(item.projection.timeRange);
    reversed.start.value = "2026-08-20";
    expect(converter.validateHistoricalTimeRange(reversed)).toEqual({
      status: "fail",
      reasonCode: "historical_time_range_order_invalid",
    });
  });

  it("keeps all source bytes and receipts unchanged while replaying four conversions", async () => {
    const converter = converterV3();
    expect(converter).not.toBeNull();
    if (converter === null) return;
    const expectedHashes = [
      "2822254a3603b8248a7b2537cc48f2e2076ea0c35dafa99b9573ddd3125aa8c0",
      "b31f7bfafd8b81ed590a4db9cccefe5b935772eeef97b70ad8d0240f4fe1fd8f",
      "ee15a77769d4e35abc08b1a05bafdcf2275af9514baab3733ebb25c7e357ec77",
      "39d72696094ab2f3c415be4ef545ba0cd40e01174d9c320e40b02e6f7bf65b10",
    ];
    const first = await converter.loadRegisteredHistoricalBriefCasesV3();
    const second = await converter.loadRegisteredHistoricalBriefCasesV3();
    expect(first).toEqual(second);
    expect(first.map(({ sourceArtifact }) => sourceArtifact.documentSha256)).toEqual(expectedHashes);
    expect(await Promise.all(historicalBriefSourceRegistry.map(async ({ fixturePath }) =>
      sha256(await readFile(fixturePath))))).toEqual(expectedHashes);
    expect(first.every((item, index) =>
      item.sourceArtifact.documentSha256 === historicalBriefSourceRegistry[index]!.documentSha256))
      .toBe(true);
  });

  it("leaves the frozen v2 acceptance set unchanged", async () => {
    expect(projectBriefEvalV2CaseRegistry.map(({ contentFingerprint }) => contentFingerprint))
      .toEqual([
        "2fc700e634333bde28030c0d86bc7b7fffda0f2614db9fc0ebc1d295012cf772",
        "3055e22532e77c8c628309528947e0789ab82aae3b4a2d31861ec45593142680",
        "c5358f035356d654266aadd9b45275f4b05f06f11b4efd8789b321d479b8eaa3",
        "d97b0e05ffdf94fb4d9881f71e275f92363e4f3e181aeaddf18e49a878d2a556",
        "5d2c86a005fa0bf6f0499f3721e7a0e3055ba25f88cff20492d4292220f4b9c0",
        "a3fcb206ca1c9cd4623f0cc172df9f0726bb9a4833f7f412963f7388e8cec66d",
        "2127c7faf93c4a17831d56fd57c7eb013a41da98ef161f1031453f17d44bdfca",
        "65f85b509c5c7405b38ff53d6f398c7d5a11c3ce5a0b1391f606fdcae3b8d48a",
        "2ab4c362dfdf1c03722f933db46e9db2af8aa37f06b4cf4c072e47d7cb9bb9b7",
        "15d8b3a9bef7a11f50a1f9f8bc9c7f585a8f39cc21da34ddc2767fa91c78ec98",
        "81188b7074c59ac19ea73ae6f207239e1eec7cdcc25c1aae70c81d343d3cf569",
        "3c7d4d14044f3d1d6ef784eacb209b357e85258e0932dbc4b1af7471c2d7a34c",
        "f0c84b0a0a07ca2452109a6faeee90fd0e6676403f5cc511dad140669b5ac601",
        "2bae622e09a3caff5c1c06fe72cff2b18f3a8c8aa08974cbf587783fefffd56a",
      ]);
    const v2Manifest = await loadProjectBriefEvalManifestV2();
    const v2Result = await evaluateProjectBriefDatasetV2(v2Manifest);
    expect(v2Manifest.datasetFingerprint)
      .toBe("49e91aed2c4b70f3eb37df0d8cc48dd2610be56b490c172b17683a72bfb4c6e0");
    expect(v2Result.resultFingerprint)
      .toBe("724d4cb66a876e7406ac8d37c7f6014893f4a5b965df87e1d292ecbca42b4b3a");
    expect(v2Result.releaseGate).toBe("blocked");
  });

  it("passes the exact 10 plus 4 v3 dataset only when all seven checks pass", async () => {
    const api = await loadDatasetV3();
    expect(api).not.toBeNull();
    if (api === null) return;
    const manifest = await api.loadProjectBriefEvalManifestV3();
    const result = await api.evaluateProjectBriefDatasetV3(manifest);
    expect(manifest.counts).toEqual({
      includedTotal: 14,
      syntheticContract: 10,
      humanConfirmedHistorical: 4,
      pendingHumanConfirmation: 0,
    });
    expect(new Set(manifest.cases.map(({ caseId }) => caseId)).size).toBe(14);
    expect(manifest.datasetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.resultFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.caseCounts.expectedOutcomesMatched).toBe(14);
    expect(result.cases.every(({ expectationMatched }) => expectationMatched)).toBe(true);
    expect(result.cases.filter(({ caseId }) => caseId.startsWith("eval-hist-"))
      .every(({ checks }) => Object.values(checks).every(({ status }) => status === "pass")))
      .toBe(true);
    expect(result.releaseGate).toBe("passed");
    expect(result.blockedReasons).toEqual([]);
  });

  it("fails closed on membership, content, classification, time-version, or fingerprint drift", async () => {
    const api = await loadDatasetV3();
    expect(api).not.toBeNull();
    if (api === null) return;
    const manifest = await api.loadProjectBriefEvalManifestV3();

    const removed = structuredClone(manifest);
    removed.cases.splice(0, 1);
    await expect(api.evaluateProjectBriefDatasetV3(removed))
      .rejects.toThrow("project_brief_eval_manifest_v3_invalid");

    const replaced = structuredClone(manifest);
    replaced.cases[0]!.contentFingerprint = "0".repeat(64);
    await expect(api.evaluateProjectBriefDatasetV3(replaced))
      .rejects.toThrow("project_brief_eval_manifest_v3_invalid");

    const historical = structuredClone(manifest);
    const item = historical.cases.find(({ caseId }) => caseId === "eval-hist-01-explorer") as
      | HistoricalCaseV3 | undefined;
    expect(item).toBeDefined();
    if (item === undefined) return;
    const note = item.projection.statements.find(({ statementKind }) =>
      statementKind === "workflow_note");
    expect(note).toBeDefined();
    if (note === undefined) return;
    note.statementKind = "project_fact";
    const tamperedResult = await api.evaluateProjectBriefDatasetV3(historical);
    expect(tamperedResult.releaseGate).toBe("failed");

    const versionDrift = structuredClone(manifest) as Record<string, unknown>;
    const fingerprintInput = versionDrift.fingerprintInput as Record<string, unknown>;
    fingerprintInput.historicalTimePrecisionVersion = "project-brief-eval-historical-time-precision.v2";
    await expect(api.evaluateProjectBriefDatasetV3(versionDrift))
      .rejects.toThrow("project_brief_eval_manifest_v3_invalid");
  });
});
