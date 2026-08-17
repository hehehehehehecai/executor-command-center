import type { FlightLogSource } from "@/features/flight-log";

const defaultSource = {
  provenanceLabel: "演示数据 · 完全虚构",
  lastSuccessfulAt: "2026-08-17T11:00:00.000Z",
  events: [
    {
      id: "demo-commit-aurora",
      eventType: "commit",
      occurredAt: "2026-08-17T11:20:00.000Z",
      summary: "提交虚构的时间线排序合同",
      sourceLabel: "demo/aurora-cartography",
      originalUrl: "https://github.example.test/demo/commit/aurora",
    },
    {
      id: "demo-issue-42",
      eventType: "issue",
      occurredAt: "2026-08-17T10:40:00.000Z",
      summary: "关闭虚构 Issue #42：移动端筛选复核",
      sourceLabel: "demo/aurora-cartography#42",
      originalUrl: "https://github.example.test/demo/issues/42",
    },
    {
      id: "demo-pr-17",
      eventType: "pull_request",
      occurredAt: "2026-08-17T10:10:00.000Z",
      summary: "合并虚构 Pull Request #17",
      sourceLabel: "demo/aurora-cartography#17",
      originalUrl: "https://github.example.test/demo/pull/17",
    },
    {
      id: "demo-release-v0-4",
      eventType: "release",
      occurredAt: "2026-08-17T09:30:00.000Z",
      summary: "发布虚构版本 v0.4.0",
      sourceLabel: "demo/aurora-cartography@v0.4.0",
      originalUrl: "https://github.example.test/demo/releases/v0.4.0",
    },
    {
      id: "demo-workflow-805",
      eventType: "workflow",
      occurredAt: "2026-08-17T09:00:00.000Z",
      summary: "虚构 CI 工作流完成",
      sourceLabel: "demo-ci / run 805",
      originalUrl: "https://github.example.test/demo/actions/runs/805",
    },
    {
      id: "demo-sync-301",
      eventType: "sync_event",
      occurredAt: "2026-08-17T08:30:00.000Z",
      summary: "虚构活动同步完成",
      sourceLabel: "demo sync run 301",
      originalUrl: null,
    },
  ],
} as const satisfies FlightLogSource;

const sameTimestampSource = {
  ...defaultSource,
  events: [
    {
      ...defaultSource.events[5],
      id: "same-sync",
      occurredAt: "2026-08-17T09:00:00.000Z",
    },
    {
      ...defaultSource.events[1],
      id: "same-issue",
      occurredAt: "2026-08-17T09:00:00.000Z",
    },
    {
      ...defaultSource.events[0],
      id: "same-commit",
      occurredAt: "2026-08-17T09:00:00.000Z",
    },
  ],
} as const satisfies FlightLogSource;

const boundarySource = {
  ...defaultSource,
  events: [
    {
      ...defaultSource.events[1],
      id: "boundary-at-start",
      occurredAt: "2026-08-10T12:00:00.000Z",
    },
    {
      ...defaultSource.events[0],
      id: "boundary-at-now",
      occurredAt: "2026-08-17T12:00:00.000Z",
    },
    {
      ...defaultSource.events[3],
      id: "boundary-outside",
      occurredAt: "2026-08-10T11:59:59.999Z",
    },
  ],
} as const satisfies FlightLogSource;

const invalidLinkSource = {
  ...defaultSource,
  events: [
    {
      ...defaultSource.events[0],
      id: "unsafe-http",
      originalUrl: "http://github.example.test/unsafe",
    },
    {
      ...defaultSource.events[1],
      id: "unsafe-invalid",
      originalUrl: "not a url",
    },
    {
      ...defaultSource.events[5],
      id: "link-missing",
      originalUrl: null,
    },
  ],
} as const satisfies FlightLogSource;

export const flightLogPreviewFixture = {
  fixtureId: "flight-log-preview",
  fixtureVersion: "1.0.0",
  fixtureKind: "fictional-demo",
  provenance: "hand-authored-fictional",
  authoringMethod: "manually-authored-static-fixture",
  containsRealUserData: false,
  derivedFromRealUserData: false,
  networkSource: "none",
  disclosure: "演示数据 · 完全虚构",
  now: "2026-08-17T12:00:00.000Z",
  cases: {
    default: defaultSource,
    empty: { ...defaultSource, events: [] },
    sameTimestamp: sameTimestampSource,
    stale: {
      ...defaultSource,
      lastSuccessfulAt: "2026-08-16T11:59:59.999Z",
    },
    boundary: boundarySource,
    invalidLink: invalidLinkSource,
  },
} as const satisfies {
  readonly fixtureId: "flight-log-preview";
  readonly fixtureVersion: "1.0.0";
  readonly fixtureKind: "fictional-demo";
  readonly provenance: "hand-authored-fictional";
  readonly authoringMethod: "manually-authored-static-fixture";
  readonly containsRealUserData: false;
  readonly derivedFromRealUserData: false;
  readonly networkSource: "none";
  readonly disclosure: "演示数据 · 完全虚构";
  readonly now: "2026-08-17T12:00:00.000Z";
  readonly cases: Readonly<Record<string, FlightLogSource>>;
};

export type FlightLogPreviewCaseId = keyof typeof flightLogPreviewFixture.cases;

export async function loadFlightLogPreviewFixture(
  caseId: FlightLogPreviewCaseId = "default",
): Promise<FlightLogSource> {
  return flightLogPreviewFixture.cases[caseId];
}
