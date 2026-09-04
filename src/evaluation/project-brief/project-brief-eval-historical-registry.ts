import { resolve } from "node:path";

export const historicalBriefSourceRegistryVersion =
  "project-brief-eval-historical-source-registry.v1" as const;

const commonSections = [
  "简报元数据", "Official Status", "Summary", "Completed Changes",
  "Ongoing Work", "Open Items", "Risk Signals", "Unknowns", "Freshness",
  "Boundary Note", "Evidence Refs", "人工确认收据",
] as const;

const withCompletionCheck = [...commonSections, "转为历史 Case 的完成检查"] as const;

const passingChecks = {
  schema: "pass",
  evidenceValidity: "pass",
  timeRange: "pass",
  requiredFacts: "pass",
  forbiddenAssertions: "pass",
  unknownHandling: "pass",
  readability: "pass",
} as const;

export type TrustedHistoricalBriefSource = {
  readonly caseId: string;
  readonly title: string;
  readonly fixturePath: string;
  readonly documentSha256: string;
  readonly sourceDocumentVersion: string;
  readonly project: string;
  readonly documentBriefId: string;
  readonly sourceBundleFingerprint: string;
  readonly sourceSubjectFingerprint: string;
  readonly receipt: {
    readonly contractVersion: "project-brief-human-confirmation.v1";
    readonly receiptId: string;
    readonly confirmerId: string;
    readonly confirmerRole: string;
    readonly confirmedAt: string;
    readonly confirmationSource: string;
    readonly briefId: string;
    readonly scopes: readonly ["source_and_redaction", "readability", "expected_outcomes"];
  };
  readonly expectedSectionOrder: readonly string[];
  readonly expectedFactCount: number;
  readonly expectedUnknownCount: number;
  readonly expectedChecks: {
    readonly schema: "pass" | "fail" | "blocked" | "not_applicable";
    readonly evidenceValidity: "pass" | "fail" | "blocked" | "not_applicable";
    readonly timeRange: "pass" | "fail" | "blocked" | "not_applicable";
    readonly requiredFacts: "pass" | "fail" | "blocked" | "not_applicable";
    readonly forbiddenAssertions: "pass" | "fail" | "blocked" | "not_applicable";
    readonly unknownHandling: "pass" | "fail" | "blocked" | "not_applicable";
    readonly readability: "pass" | "fail" | "blocked" | "not_applicable";
  };
};

function fixture(name: string): string {
  return resolve(
    process.cwd(),
    "src", "evaluation", "project-brief", "fixtures", "historical", name,
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const historicalBriefSourceRegistry = deepFreeze([
  {
    caseId: "eval-hist-01-explorer",
    title: "探索者号｜当前项目简报｜2026-08-19",
    fixturePath: fixture("eval-hist-01-explorer.md"),
    documentSha256: "2822254a3603b8248a7b2537cc48f2e2076ea0c35dafa99b9573ddd3125aa8c0",
    sourceDocumentVersion: "282225",
    project: "探索者号",
    documentBriefId: "explorer-current-2026-08-19",
    sourceBundleFingerprint: "8b65799c3946a5ad730e09b097b1ae13aaf061fa44c048ed932ab59c1d5e850d",
    sourceSubjectFingerprint: "f8a066c3f162a494b9ba97906b6753ca28ae8feef1d9709dc20dfaa78f999f88",
    receipt: {
      contractVersion: "project-brief-human-confirmation.v1",
      receiptId: "sha256:af8d3ab9094a756ac6383c7d5b48af58f489aa6c3bade3bdab6750a191a8af0b",
      confirmerId: "project-owner:explorer",
      confirmerRole: "项目所有者／最终确认人",
      confirmedAt: "2026-08-19T02:56:05Z",
      confirmationSource: "codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00",
      briefId: "explorer-current-2026-08-19",
      scopes: ["source_and_redaction", "readability", "expected_outcomes"],
    },
    expectedSectionOrder: commonSections,
    expectedFactCount: 21,
    expectedUnknownCount: 4,
    expectedChecks: {
      ...passingChecks,
      evidenceValidity: "blocked",
      timeRange: "blocked",
    },
  },
  {
    caseId: "eval-hist-02-idea-graveyard",
    title: "灵感公墓当前项目简报",
    fixturePath: fixture("eval-hist-02-idea-graveyard.md"),
    documentSha256: "b31f7bfafd8b81ed590a4db9cccefe5b935772eeef97b70ad8d0240f4fe1fd8f",
    sourceDocumentVersion: "b31f7b",
    project: "灵感公墓",
    documentBriefId: "idea-graveyard-current-2026-08-19",
    sourceBundleFingerprint: "5ab41adbb14e04d59c11a9254c364932080fd44a8e62d4301b12800c58717496",
    sourceSubjectFingerprint: "74905163ddf0ef7b9fb7f684d33186f31e17234df2dd22bbbf0eb713626237c1",
    receipt: {
      contractVersion: "project-brief-human-confirmation.v1",
      receiptId: "review-receipt:idea-graveyard:20260820T050333Z",
      confirmerId: "project-owner:idea-graveyard",
      confirmerRole: "项目所有者／最终确认人",
      confirmedAt: "2026-08-20T05:03:33Z",
      confirmationSource: "codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00",
      briefId: "idea-graveyard-current-2026-08-19",
      scopes: ["source_and_redaction", "readability", "expected_outcomes"],
    },
    expectedSectionOrder: withCompletionCheck,
    expectedFactCount: 18,
    expectedUnknownCount: 5,
    expectedChecks: passingChecks,
  },
  {
    caseId: "eval-hist-03-brave-tavern",
    title: "勇者酒馆｜当前项目简报｜2026-08-19",
    fixturePath: fixture("eval-hist-03-brave-tavern.md"),
    documentSha256: "ee15a77769d4e35abc08b1a05bafdcf2275af9514baab3733ebb25c7e357ec77",
    sourceDocumentVersion: "ee15a7",
    project: "勇者酒馆",
    documentBriefId: "brave-tavern-current-20260819T155616Z",
    sourceBundleFingerprint: "b78a0b65a55c4ccfbad5cb04dc1a6dea8af43f49f3568cf32525173fa365eb8e",
    sourceSubjectFingerprint: "54256ab2dcf56c0638c9d625a2c970f9015d250bd996e4b3e62ef438dff24f48",
    receipt: {
      contractVersion: "project-brief-human-confirmation.v1",
      receiptId: "review-receipt:brave-tavern:20260820T050333Z",
      confirmerId: "project-owner:brave-tavern",
      confirmerRole: "项目所有者／最终确认人",
      confirmedAt: "2026-08-20T05:03:33Z",
      confirmationSource: "codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00",
      briefId: "brave-tavern-current-2026-08-19",
      scopes: ["source_and_redaction", "readability", "expected_outcomes"],
    },
    expectedSectionOrder: withCompletionCheck,
    expectedFactCount: 15,
    expectedUnknownCount: 4,
    expectedChecks: passingChecks,
  },
  {
    caseId: "eval-hist-04-parallelmail",
    title: "平行信箱项目简报",
    fixturePath: fixture("eval-hist-04-parallelmail.md"),
    documentSha256: "39d72696094ab2f3c415be4ef545ba0cd40e01174d9c320e40b02e6f7bf65b10",
    sourceDocumentVersion: "39d726",
    project: "平行信箱",
    documentBriefId: "parallelmail-current-20260819",
    sourceBundleFingerprint: "860fd3e4106fc2500066cfe414c5482af08d89c0f5b951cf3b590fbf48db7a8d",
    sourceSubjectFingerprint: "a0edc32c74fe34395706ced44476c91bdd6aa5ce9579055adda7c187878a9d8b",
    receipt: {
      contractVersion: "project-brief-human-confirmation.v1",
      receiptId: "review-receipt:parallelmail:20260820T050333Z",
      confirmerId: "project-owner:parallelmail",
      confirmerRole: "项目所有者／最终确认人",
      confirmedAt: "2026-08-20T05:03:33Z",
      confirmationSource: "codex-thread:01a01279-96d1-77d0-8413-19905e8b1f00",
      briefId: "parallelmail-current-20260819",
      scopes: ["source_and_redaction", "readability", "expected_outcomes"],
    },
    expectedSectionOrder: withCompletionCheck,
    expectedFactCount: 17,
    expectedUnknownCount: 5,
    expectedChecks: passingChecks,
  },
] satisfies readonly TrustedHistoricalBriefSource[]);

export function getTrustedHistoricalBriefSource(caseId: string): TrustedHistoricalBriefSource {
  const source = historicalBriefSourceRegistry.find((item) => item.caseId === caseId);
  if (source === undefined) throw new Error("historical_brief_source_not_registered");
  return source;
}
