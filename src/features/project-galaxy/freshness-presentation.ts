import {
  deriveFreshnessStatus,
  type FreshnessStatus,
  type SyncStatus,
} from "@/domain/synchronization/synchronization-state";

export const projectDataFreshnessUiContract =
  "project-data-freshness-ui.v1" as const;

const safeErrorCodes = new Set([
  "github_activity_authorization_revoked",
  "github_activity_rate_limited",
  "github_activity_not_found",
  "github_activity_timeout",
  "github_activity_invalid_response",
  "github_activity_pagination_invalid",
  "github_activity_unavailable",
  "github_activity_snapshot_write_failed",
]);

const labels = {
  fresh: "Fresh",
  stale: "Stale",
  partial: "Partial",
  syncing: "Syncing",
  failed: "Failed",
  authorization_revoked: "Authorization revoked",
} as const satisfies Readonly<Record<FreshnessStatus, string>>;

const descriptions = {
  fresh: "数据在 24 小时新鲜窗口内。",
  stale: "上次成功同步已离开新鲜窗口。",
  partial: "部分数据尚未完整同步。",
  syncing: "同步正在进行。",
  failed: "最近一次同步失败。",
  authorization_revoked: "GitHub 授权已撤销，同步已停止。",
} as const satisfies Readonly<Record<FreshnessStatus, string>>;

export interface ProjectFreshnessPresentationInput {
  readonly provenance: "demo" | "real";
  readonly authorizationRevoked: boolean;
  readonly latestRun: {
    readonly id: string;
    readonly status: SyncStatus;
    readonly finishedAt: string | null;
    readonly errorCode: string | null;
  } | null;
  readonly lastSuccessfulAt: string | null;
  readonly coverageComplete: boolean;
  readonly now: string;
}

export interface ProjectFreshnessPresentation {
  readonly freshnessStatus: FreshnessStatus;
  readonly label: string;
  readonly description: string;
  readonly provenanceLabel: string;
  readonly lastSuccessful: {
    readonly dateTime: string;
    readonly label: string;
  } | null;
  readonly currentRun: {
    readonly status: "queued" | "running";
    readonly safeId: string;
  } | null;
  readonly safeErrorCode: string | null;
  readonly showStaleWarning: boolean;
}

function formatUtc(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("freshness_invalid_input");

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} UTC`;
}

function currentRun(
  latestRun: ProjectFreshnessPresentationInput["latestRun"],
): ProjectFreshnessPresentation["currentRun"] {
  if (latestRun?.status !== "queued" && latestRun?.status !== "running") {
    return null;
  }

  return {
    status: latestRun.status,
    safeId: `${latestRun.id.slice(0, 8)}…`,
  };
}

export function createProjectFreshnessPresentation(
  input: ProjectFreshnessPresentationInput,
): ProjectFreshnessPresentation {
  const freshnessStatus = deriveFreshnessStatus({
    authorizationRevoked: input.authorizationRevoked,
    latestRun: input.latestRun,
    lastSuccessfulAt: input.lastSuccessfulAt,
    coverageComplete: input.coverageComplete,
    now: input.now,
  });
  const failedErrorCode = input.latestRun?.errorCode ?? null;
  const safeErrorCode =
    freshnessStatus === "failed"
      ? failedErrorCode !== null && safeErrorCodes.has(failedErrorCode)
        ? failedErrorCode
        : "sync_error"
      : null;
  const lastSuccessful =
    input.lastSuccessfulAt === null
      ? null
      : {
          dateTime: input.lastSuccessfulAt,
          label: formatUtc(input.lastSuccessfulAt),
        };

  return {
    freshnessStatus,
    label: labels[freshnessStatus],
    description:
      freshnessStatus === "stale" && lastSuccessful === null
        ? "尚无成功同步记录。"
        : descriptions[freshnessStatus],
    provenanceLabel:
      input.provenance === "demo" ? "演示数据 · 完全虚构" : "真实项目数据",
    lastSuccessful,
    currentRun: currentRun(input.latestRun),
    safeErrorCode,
    showStaleWarning: freshnessStatus === "stale" && lastSuccessful !== null,
  };
}
