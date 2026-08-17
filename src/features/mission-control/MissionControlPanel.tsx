import Link from "next/link";

import { createIssueDraft } from "./issue-draft";
import styles from "./mission-control.module.css";
import type {
  MissionControlViewModel,
  MissionSuggestion,
  MissionSuggestionStatus,
  RecordedTaskState,
  RecordedTaskType,
} from "./mission-control-view-model";

const taskTypeLabels = {
  issue: "Issue",
  pull_request: "Pull Request",
  review_request: "Review Request",
  workflow_failure: "Workflow Failure",
} as const satisfies Readonly<Record<RecordedTaskType, string>>;

const taskStateLabels = {
  open: "Open",
  pending: "Pending",
  failed: "Failed",
  unknown: "Unknown",
} as const satisfies Readonly<Record<RecordedTaskState, string>>;

const suggestionStatusLabels = {
  suggested: "待确认",
  accepted: "已在本地接受",
  snoozed: "已稍后处理",
  dismissed: "已忽略",
  completed: "已完成（本地状态）",
} as const satisfies Readonly<Record<MissionSuggestionStatus, string>>;

function issueDraftFor(suggestion: MissionSuggestion) {
  try {
    return createIssueDraft(suggestion);
  } catch {
    return null;
  }
}

function IssueDraftFields({ suggestion }: { readonly suggestion: MissionSuggestion }) {
  if (suggestion.status !== "accepted") return null;

  const draft = issueDraftFor(suggestion);
  if (draft === null) {
    return <p className={styles.draftError}>Issue 草稿不可用：缺少必要字段。</p>;
  }

  return (
    <div className={styles.draft} aria-label="本地 Issue 草稿">
      <p className={styles.metaLabel}>GitHub Issue 草稿</p>
      <p>只生成本地草稿，不会创建 GitHub Issue。</p>
      <label>
        <span>标题</span>
        <input aria-label="Issue 草稿标题" value={draft.title} readOnly />
      </label>
      <label>
        <span>正文</span>
        <textarea aria-label="Issue 草稿正文" value={draft.body} readOnly rows={5} />
      </label>
      <small>来源建议 ID：{draft.sourceSuggestionId}</small>
    </div>
  );
}

export interface MissionControlPanelProps {
  readonly viewModel: MissionControlViewModel;
}

export function MissionControlPanel({ viewModel }: MissionControlPanelProps) {
  return (
    <main className={styles.shell} aria-labelledby="mission-control-title">
      <header className={styles.header}>
        <div>
          <p className="section-kicker">Mission Control · 任务中枢</p>
          <h1 id="mission-control-title" className={styles.title}>
            Mission Control
          </h1>
          <p className={styles.intro}>
            GitHub 已记录事实与系统候选行动严格分区；所有建议状态仅在本地表达。
          </p>
        </div>
        <div className={styles.provenance} aria-label="数据来源">
          <strong>{viewModel.provenanceLabel}</strong>
          <span>
            {viewModel.mode === "preview" ? "Preview Mode" : "Connected Mode"}
          </span>
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.region} aria-labelledby="recorded-tasks-title">
          <div className={styles.regionHeading}>
            <div>
              <p className={styles.metaLabel}>Read-only GitHub facts</p>
              <h2 id="recorded-tasks-title">已记录任务</h2>
            </div>
            <span>{viewModel.recordedTasks.length} 项</span>
          </div>
          <p className={styles.boundaryNote}>
            只读展示，不会修改、关闭或创建 GitHub 对象。
          </p>

          {viewModel.recordedTasks.length === 0 ? (
            <p className={styles.emptyState}>暂无 GitHub 已记录任务</p>
          ) : (
            <ul className={styles.taskList}>
              {viewModel.recordedTasks.map((task) => (
                <li key={task.id}>
                  <article className={styles.taskCard} data-task-state={task.state}>
                    <div className={styles.cardMeta}>
                      <span>{taskTypeLabels[task.taskType]}</span>
                      <span>{taskStateLabels[task.state]}</span>
                    </div>
                    <h3>{task.title}</h3>
                    <p>{task.sourceLabel}</p>
                    {task.originalUrl === null ? (
                      <span className={styles.unavailableLink}>原始链接不可用</span>
                    ) : (
                      <a href={task.originalUrl}>查看 GitHub 原始记录</a>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.region} aria-labelledby="suggestions-title">
          <div className={styles.regionHeading}>
            <div>
              <p className={styles.metaLabel}>Local candidate actions</p>
              <h2 id="suggestions-title">系统建议</h2>
            </div>
            <span>{viewModel.suggestions.length} 项</span>
          </div>
          <p className={styles.boundaryNote}>
            建议不会静默变成已记录任务；Accepted 和 Completed 均不代表远端状态。
          </p>

          {viewModel.suggestions.length === 0 ? (
            <p className={styles.emptyState}>暂无系统建议</p>
          ) : (
            <div className={styles.suggestionList}>
              {viewModel.suggestions.map((suggestion) => (
                <article
                  key={suggestion.id}
                  className={styles.suggestionCard}
                  data-suggestion-card-status={suggestion.status}
                >
                  <div className={styles.cardMeta}>
                    <span
                      className={styles.statusBadge}
                      data-suggestion-status={suggestion.status}
                    >
                      {suggestion.status}
                    </span>
                    <span>{suggestionStatusLabels[suggestion.status]}</span>
                  </div>
                  <h3>{suggestion.title}</h3>
                  <dl className={styles.details}>
                    <div>
                      <dt>建议依据</dt>
                      <dd>{suggestion.rationale}</dd>
                    </div>
                    <div>
                      <dt>系统不知道什么</dt>
                      <dd>{suggestion.unknowns}</dd>
                    </div>
                    <div>
                      <dt>规则版本</dt>
                      <dd>{suggestion.ruleVersion}</dd>
                    </div>
                    <div>
                      <dt>来源</dt>
                      <dd>{suggestion.provenanceLabel}</dd>
                    </div>
                  </dl>
                  <div className={styles.evidence}>
                    <h4>证据引用</h4>
                    {suggestion.evidence.length === 0 ? (
                      <p>无可用证据引用</p>
                    ) : (
                      <ul>
                        {suggestion.evidence.map((item, index) => (
                          <li key={`${suggestion.id}:evidence:${index}`}>
                            {item.originalUrl === null ? (
                              item.label
                            ) : (
                              <a href={item.originalUrl}>{item.label}</a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <IssueDraftFields suggestion={suggestion} />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className={styles.footer}>
        <Link href="/">返回 Command Deck</Link>
      </footer>
    </main>
  );
}
