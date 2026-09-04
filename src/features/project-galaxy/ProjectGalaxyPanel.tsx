import Link from "next/link";

import type { ProjectStatus } from "@/domain/project-calibration/project-calibration";
import { PanelDemoDisclosure } from "@/shared/demo-disclosure";

import { SyncStatusBadge } from "./SyncStatusBadge";
import styles from "./project-galaxy.module.css";
import type { ProjectGalaxyViewModel } from "./project-galaxy-view-model";

const statusLabels = {
  in_planning: "规划中",
  in_development: "开发中",
  polishing: "打磨中",
  dormant: "暂缓",
  completed: "已完成",
  archived: "已归档",
} as const satisfies Readonly<Record<ProjectStatus, string>>;

function statusLabel(status: ProjectStatus | null) {
  return status === null ? "尚未提供" : statusLabels[status];
}

function formatUtc(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export interface ProjectGalaxyPanelProps {
  readonly viewModel: ProjectGalaxyViewModel;
}

export function ProjectGalaxyPanel({ viewModel }: ProjectGalaxyPanelProps) {
  return (
    <div
      className={styles.shell}
      aria-labelledby="project-galaxy-title"
    >
      <header className={styles.header}>
        <div>
          <p className="section-kicker">Project Galaxy · 项目星图</p>
          <h1 id="project-galaxy-title" className={styles.title}>
            Project Galaxy
          </h1>
          <p className={styles.intro}>
            将项目事实、状态建议与数据新鲜度分层呈现。
          </p>
        </div>
        <PanelDemoDisclosure
          className={styles.provenance}
          mode={viewModel.mode}
          provenanceLabel={viewModel.provenanceLabel}
        />
      </header>

      <section className={styles.identity} aria-label="项目身份">
        <div>
          <span>Project</span>
          <strong>{viewModel.project.name ?? "项目名称未提供"}</strong>
        </div>
        <div>
          <span>Project ID</span>
          <strong>{viewModel.project.id}</strong>
        </div>
        <div>
          <span>Repository</span>
          <strong>{viewModel.project.repositoryLabel ?? "仓库信息未提供"}</strong>
        </div>
      </section>

      <div className={styles.statusGrid}>
        <section
          className={styles.officialStatus}
          aria-labelledby="official-status-title"
          data-status-kind="fact"
        >
          <p className={styles.kindLabel}>官方事实</p>
          <h2 id="official-status-title">Official Status</h2>
          <strong className={styles.statusValue}>
            {statusLabel(viewModel.officialStatus)}
          </strong>
          <p>此状态来自项目正式记录。</p>
        </section>

        <section
          className={styles.suggestedStatus}
          aria-labelledby="suggested-status-title"
          data-status-kind="suggestion"
        >
          <p className={styles.kindLabel}>系统建议</p>
          <h2 id="suggested-status-title">Suggested Status</h2>
          {viewModel.suggestedStatus === null ? (
            <p className={styles.emptyState}>暂无状态建议</p>
          ) : (
            <>
              <strong className={styles.statusValue}>
                {statusLabel(viewModel.suggestedStatus.value)}
              </strong>
              <p>{viewModel.suggestedStatus.rationale}</p>
              <time dateTime={viewModel.suggestedStatus.generatedAt}>
                建议时间：{formatUtc(viewModel.suggestedStatus.generatedAt)}
              </time>
            </>
          )}
          <p className={styles.suggestionBoundary}>
            建议不会修改 Official Status。
          </p>
          <details className={styles.previewDetails}>
            <summary>查看演示建议边界</summary>
            <p>此交互只展开本地说明；不会接受建议或修改 Official Status。</p>
          </details>
        </section>
      </div>

      <div className={styles.contentGrid}>
        <section
          className={styles.contentCard}
          aria-labelledby="project-core-goal-title"
        >
          <h2 id="project-core-goal-title">核心目标</h2>
          <p>{viewModel.coreGoal ?? "尚未记录核心目标"}</p>
        </section>

        <section
          className={styles.contentCard}
          aria-labelledby="project-stage-goal-title"
        >
          <h2 id="project-stage-goal-title">当前阶段目标</h2>
          <p>{viewModel.currentStageGoal ?? "尚未记录当前阶段目标"}</p>
        </section>

        <section
          className={styles.contentCard}
          aria-labelledby="project-blockers-title"
        >
          <h2 id="project-blockers-title">当前阻碍</h2>
          {viewModel.currentBlockers.length === 0 ? (
            <p className={styles.emptyState}>当前没有记录的阻碍</p>
          ) : (
            <ul className={styles.blockerList}>
              {viewModel.currentBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        className={styles.activityCard}
        aria-labelledby="project-recent-activity-title"
      >
        <h2 id="project-recent-activity-title">最近活动</h2>
        {viewModel.recentActivity.length === 0 ? (
          <p className={styles.emptyState}>暂无最近活动</p>
        ) : (
          <ol className={styles.activityList}>
            {viewModel.recentActivity.map((activity) => (
              <li key={activity.id}>
                <span>{activity.summary}</span>
                <time dateTime={activity.occurredAt}>
                  {formatUtc(activity.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      {viewModel.freshness.kind === "known" ? (
        <SyncStatusBadge input={viewModel.freshness.input} />
      ) : (
        <section aria-label="数据新鲜度">
          <div
            className={`freshness-card ${styles.unknownFreshness}`}
            data-freshness-status="unknown"
          >
            <div className="freshness-heading">
              <div>
                <p className="section-kicker">Project data</p>
                <h2>数据新鲜度</h2>
              </div>
              <span className="freshness-badge">Unknown</span>
            </div>
            <p className="freshness-provenance">
              {viewModel.freshness.provenanceLabel}
            </p>
            <p className="freshness-description">
              {viewModel.freshness.description}
            </p>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <Link href="/">返回 Command Deck</Link>
      </footer>
    </div>
  );
}
