import Link from "next/link";

import styles from "./decision-archive.module.css";
import type {
  DecisionArchiveViewModel,
  DecisionCandidate,
  DecisionReference,
} from "./decision-archive-view-model";

const referenceLabels = {
  commit: "Commit",
  pull_request: "Pull Request",
  issue: "Issue",
  document: "Document",
} as const;

function formatUtc(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "时间未知";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function References({ references }: { readonly references: readonly DecisionReference[] }) {
  if (references.length === 0) return <p>暂无关联引用</p>;

  return (
    <ul className={styles.referenceList}>
      {references.map((reference) => (
        <li key={reference.id}>
          <span>{referenceLabels[reference.kind]} · </span>
          {reference.originalUrl === null ? (
            reference.label
          ) : (
            <a href={reference.originalUrl}>{reference.label}</a>
          )}
        </li>
      ))}
    </ul>
  );
}

function CandidateConfirmationForm({
  candidate,
  mode,
}: {
  readonly candidate: DecisionCandidate;
  readonly mode: DecisionArchiveViewModel["mode"];
}) {
  if (candidate.status === "confirmed") {
    return (
      <p className={styles.confirmedLineage}>
        已确认记录 ID：{candidate.confirmedRecordId ?? "记录 ID 不可用"}
      </p>
    );
  }

  return (
    <form
      className={styles.confirmForm}
      method="get"
      aria-label={`确认候选：${candidate.proposedDecision}`}
    >
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="action" value="confirm" />
      <input type="hidden" name="candidateId" value={candidate.id} />
      <label>
        <span>用户确认原因</span>
        <textarea name="reason" rows={3} required aria-label="用户确认原因" />
      </label>
      <button type="submit">确认并生成本地记录</button>
      <small>本次操作仅生成页面内预览，不会持久化，也不会调用 AI 模型。</small>
    </form>
  );
}

export interface DecisionArchiveFeedback {
  readonly kind: "success" | "error";
  readonly message: string;
}

export interface DecisionArchivePanelProps {
  readonly viewModel: DecisionArchiveViewModel;
  readonly feedback?: DecisionArchiveFeedback;
}

export function DecisionArchivePanel({
  viewModel,
  feedback,
}: DecisionArchivePanelProps) {
  return (
    <main className={styles.shell} aria-labelledby="decision-archive-title">
      <header className={styles.header}>
        <div>
          <p className="section-kicker">Decision Archive · 决策档案</p>
          <h1 id="decision-archive-title" className={styles.title}>
            Decision Archive
          </h1>
          <p className={styles.intro}>
            候选只是待审阅线索；只有用户明确确认并补充原因后，才能形成正式记录。
          </p>
        </div>
        <div className={styles.provenance} aria-label="数据来源">
          <strong>{viewModel.provenanceLabel}</strong>
          <span>
            {viewModel.mode === "preview" ? "Preview Mode" : "Connected Mode"}
          </span>
        </div>
      </header>

      {feedback ? (
        <p
          className={styles.feedback}
          role="status"
          data-feedback-kind={feedback.kind}
        >
          {feedback.message}
        </p>
      ) : null}

      <section className={styles.manualSection} aria-labelledby="manual-decision-title">
        <div>
          <p className={styles.metaLabel}>User-authored record</p>
          <h2 id="manual-decision-title">手动创建记录</h2>
          <p>无需 Candidate；决定内容和用户确认原因均由用户明确填写。</p>
        </div>
        <form
          className={styles.manualForm}
          method="get"
          aria-label="手动创建决策记录"
        >
          <input type="hidden" name="mode" value={viewModel.mode} />
          <input type="hidden" name="action" value="manual" />
          <label>
            <span>决定内容</span>
            <textarea name="decision" rows={3} required aria-label="决定内容" />
          </label>
          <label>
            <span>确认原因</span>
            <textarea name="reason" rows={3} required aria-label="确认原因" />
          </label>
          <label>
            <span>替代方案（每行一项）</span>
            <textarea name="alternatives" rows={3} />
          </label>
          <label>
            <span>重新审视条件（可选）</span>
            <input name="revisitCondition" />
          </label>
          <button type="submit">生成本地记录预览</button>
          <small>页面只展示本次本地结果，刷新后不会持久化。</small>
        </form>
      </section>

      <div className={styles.columns}>
        <section className={styles.region} aria-labelledby="decision-candidates-title">
          <div className={styles.regionHeading}>
            <div>
              <p className={styles.metaLabel}>Unconfirmed findings</p>
              <h2 id="decision-candidates-title">决策候选</h2>
            </div>
            <span>{viewModel.candidates.length} 项</span>
          </div>
          <p className={styles.boundaryNote}>
            Candidate 不代表用户动机，也不会静默成为正式记录。
          </p>

          {viewModel.candidates.length === 0 ? (
            <p className={styles.emptyState}>暂无待审阅的决策候选</p>
          ) : (
            <div className={styles.cardList}>
              {viewModel.candidates.map((candidate) => (
                <article
                  key={candidate.id}
                  className={styles.candidateCard}
                  data-candidate-status={candidate.status}
                >
                  <div className={styles.cardMeta}>
                    <span>Candidate 状态：{candidate.status}</span>
                    <time dateTime={candidate.generatedAt}>
                      {formatUtc(candidate.generatedAt)}
                    </time>
                  </div>
                  <h3>{candidate.proposedDecision}</h3>
                  <dl className={styles.details}>
                    <div>
                      <dt>候选依据</dt>
                      <dd>{candidate.rationale}</dd>
                    </div>
                    <div>
                      <dt>系统不知道什么</dt>
                      <dd>{candidate.unknowns}</dd>
                    </div>
                    <div>
                      <dt>候选来源</dt>
                      <dd>{candidate.sourceLabel}</dd>
                    </div>
                    <div>
                      <dt>重新审视条件</dt>
                      <dd>{candidate.revisitCondition ?? "未提供"}</dd>
                    </div>
                  </dl>
                  <div className={styles.references}>
                    <h4>关联引用</h4>
                    <References references={candidate.references} />
                  </div>
                  <CandidateConfirmationForm candidate={candidate} mode={viewModel.mode} />
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.region} aria-labelledby="decision-records-title">
          <div className={styles.regionHeading}>
            <div>
              <p className={styles.metaLabel}>User-confirmed facts</p>
              <h2 id="decision-records-title">正式决策记录</h2>
            </div>
            <span>{viewModel.records.length} 项</span>
          </div>
          <p className={styles.boundaryNote}>
            每条 Record 均展示用户原因与创建 lineage；本阶段不声明持久化成功。
          </p>

          {viewModel.records.length === 0 ? (
            <p className={styles.emptyState}>暂无正式决策记录</p>
          ) : (
            <div className={styles.cardList}>
              {viewModel.records.map((record) => (
                <article key={record.id} className={styles.recordCard}>
                  <div className={styles.cardMeta}>
                    <span>当前状态：{record.status}</span>
                    <time dateTime={record.confirmedAt}>
                      {formatUtc(record.confirmedAt)}
                    </time>
                  </div>
                  <h3>{record.decision}</h3>
                  <p className={styles.creationLabel}>
                    创建方式：
                    {record.createdVia === "manual"
                      ? "手动创建"
                      : "用户确认 Candidate"}
                  </p>
                  <dl className={styles.details}>
                    <div>
                      <dt>用户确认原因</dt>
                      <dd>{record.confirmationReason}</dd>
                    </div>
                    <div>
                      <dt>确认者</dt>
                      <dd>{record.confirmedBy}</dd>
                    </div>
                    <div>
                      <dt>来源 Candidate</dt>
                      <dd>{record.sourceCandidateId ?? "无（手动创建）"}</dd>
                    </div>
                    <div>
                      <dt>重新审视条件</dt>
                      <dd>{record.revisitCondition ?? "未提供"}</dd>
                    </div>
                  </dl>
                  {record.sourceCandidateId ? (
                    <p>来源 Candidate：{record.sourceCandidateId}</p>
                  ) : null}
                  <div className={styles.alternatives}>
                    <h4>替代方案</h4>
                    {record.alternatives.length === 0 ? (
                      <p>未记录替代方案</p>
                    ) : (
                      <ul>
                        {record.alternatives.map((alternative) => (
                          <li key={`${record.id}:${alternative}`}>{alternative}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className={styles.references}>
                    <h4>关联引用</h4>
                    <References references={record.references} />
                  </div>
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
