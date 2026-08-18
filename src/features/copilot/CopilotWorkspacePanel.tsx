import Link from "next/link";

import { PanelDemoDisclosure } from "@/shared/demo-disclosure";
import { featureRegistry } from "@/shared/features/feature-registry";
import { projectBriefBoundaryNote } from "@/domain/project-brief/project-brief-contract";

import styles from "./copilot-workspace.module.css";
import type {
  CopilotProjectBriefState,
  CopilotWorkspaceViewModel,
} from "./copilot-workspace-view-model";
import type { CopilotEvidenceViewModel } from "./copilot-project-brief-view-model";

const transitionLabels: Record<
  CopilotWorkspaceViewModel["lastTransitionReason"],
  string
> = {
  initialized: "本地 Shell 上下文已初始化",
  identity_unchanged: "身份未变化，引用已保留",
  feature_changed: "面板已切换，旧引用已清除",
  project_changed: "项目已切换，旧引用已清除",
  evidence_updated: "本地证据引用已更新",
};

export interface CopilotWorkspaceFeedback {
  readonly kind: "error" | "success";
  readonly message: string;
}

export interface CopilotWorkspacePanelProps {
  readonly viewModel: CopilotWorkspaceViewModel;
  readonly feedback?: CopilotWorkspaceFeedback;
}

const briefStateMessages: Record<Exclude<CopilotProjectBriefState["status"], "ready">, string> = {
  not_found: "当前项目暂无已完成简报。",
  expired: "当前项目只有已过期简报。",
  invalid: "简报结构验证失败。",
  evidence_validation_failed: "简报证据重新验证失败。",
  unavailable: "简报读取暂时不可用。",
};

function EvidenceLinks({ evidence }: { readonly evidence: readonly CopilotEvidenceViewModel[] }) {
  if (evidence.length === 0) return <span className={styles.noEvidence}>无 Evidence 引用</span>;
  return (
    <ul className={styles.inlineEvidence} aria-label="Evidence 引用">
      {evidence.map((ref) => (
        <li key={ref.referenceId}>
          {ref.href === null ? (
            <span>不可导航 · {ref.sourceKind}</span>
          ) : (
            <Link href={ref.href}>
              查看证据 · {ref.sourceKind} · {ref.sourceId}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProjectBriefRegion({ state }: { readonly state: CopilotProjectBriefState }) {
  if (state.status !== "ready") {
    return (
      <section className={styles.briefRegion} aria-label="Brief 状态">
        <p className={styles.briefState} role="status">{briefStateMessages[state.status]}</p>
        <aside className={styles.boundary} role="note" aria-label="Brief 边界">
          <h3>Boundary</h3>
          <p>{projectBriefBoundaryNote}</p>
        </aside>
      </section>
    );
  }
  const brief = state.value;
  return (
    <section className={styles.briefRegion} aria-labelledby="project-brief-title" aria-label="Project Brief">
      <div className={styles.briefHeader}>
        <div>
          <p className={styles.metaLabel}>Validated Project Brief</p>
          <h2 id="project-brief-title">项目简报</h2>
        </div>
        <span className={styles.statusBadge}>{brief.officialStatus.value}</span>
      </div>

      <section className={styles.briefSummary} aria-labelledby="brief-summary-title">
        <h3 id="brief-summary-title">摘要</h3>
        <p>{brief.summary.text}</p>
        <EvidenceLinks evidence={brief.summary.evidence} />
      </section>

      <section className={styles.officialStatus} aria-labelledby="brief-status-title">
        <h3 id="brief-status-title">官方状态</h3>
        <p>{brief.officialStatus.value}</p>
        <EvidenceLinks evidence={brief.officialStatus.evidence} />
      </section>

      <div className={styles.briefSections}>
        {brief.sections.map((section) => (
          <section key={section.id} aria-labelledby={`brief-${section.id}-title`}>
            <h3 id={`brief-${section.id}-title`}>{section.title}</h3>
            {section.empty ? (
              <p className={styles.emptyState}>{section.emptyMessage}</p>
            ) : (
              <ul className={styles.briefItems}>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <p>{item.text}</p>
                    {item.missingEvidence.length > 0 ? (
                      <p className={styles.missingEvidence}>
                        缺失证据：{item.missingEvidence.join("；")}
                      </p>
                    ) : null}
                    <EvidenceLinks evidence={item.evidence} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className={styles.freshness} aria-labelledby="brief-freshness-title">
        <h3 id="brief-freshness-title">Freshness</h3>
        <dl>
          <div><dt>status</dt><dd>{brief.freshness.status}</dd></div>
          <div><dt>evaluatedAt</dt><dd><time dateTime={brief.freshness.evaluatedAt}>{brief.freshness.evaluatedAt}</time></dd></div>
          <div><dt>lastSuccessfulAt</dt><dd>{brief.freshness.lastSuccessfulAt ?? "未知"}</dd></div>
          <div><dt>coverageComplete</dt><dd>{brief.freshness.coverageComplete ? "是" : "否"}</dd></div>
        </dl>
        <EvidenceLinks evidence={brief.freshness.evidence} />
      </section>

      {brief.selectedEvidence ? (
        <aside className={styles.selectedEvidence} aria-label="已聚焦 Evidence">
          <h3>已聚焦 Evidence</h3>
          <dl>
            <div><dt>sourceKind</dt><dd>{brief.selectedEvidence.sourceKind}</dd></div>
            <div><dt>sourceId</dt><dd>{brief.selectedEvidence.sourceId}</dd></div>
            <div><dt>projectId</dt><dd>{brief.selectedEvidence.projectId}</dd></div>
          </dl>
        </aside>
      ) : null}

      <dl className={styles.briefMetadata} aria-label="Brief 元数据">
        <div><dt>Range</dt><dd>{brief.rangeStart} → {brief.rangeEnd}</dd></div>
        <div><dt>Prompt</dt><dd>{brief.promptVersion}</dd></div>
        <div><dt>Schema</dt><dd>{brief.schemaVersion}</dd></div>
        <div><dt>Fingerprint</dt><dd>{brief.evidenceFingerprint}</dd></div>
      </dl>

      <aside className={styles.boundary} role="note" aria-label="Brief 边界">
        <h3>Boundary</h3>
        <p>{brief.boundaryNote}</p>
      </aside>
    </section>
  );
}

function ContextStateFields({
  viewModel,
}: {
  readonly viewModel: CopilotWorkspaceViewModel;
}) {
  return (
    <>
      <input type="hidden" name="mode" value={viewModel.mode} />
      <input
        type="hidden"
        name="fromFeatureId"
        value={viewModel.context.featureId}
      />
      <input
        type="hidden"
        name="fromProjectId"
        value={viewModel.context.projectId ?? ""}
      />
      {viewModel.context.evidenceReferenceIds.map((referenceId) => (
        <input
          key={referenceId}
          type="hidden"
          name="fromEvidence"
          value={referenceId}
        />
      ))}
    </>
  );
}

export function CopilotWorkspacePanel({
  viewModel,
  feedback,
}: CopilotWorkspacePanelProps) {
  const { context } = viewModel;

  return (
    <main className={styles.shell} aria-labelledby="copilot-workspace-title">
      <header className={styles.header}>
        <div>
          <p className="section-kicker">Copilot · AI 副驾驶</p>
          <h1 id="copilot-workspace-title" className={styles.title}>
            Copilot Workspace
          </h1>
          <p className={styles.intro}>
            这是显式上下文工作区 Shell：只校准面板、项目和证据引用。
          </p>
        </div>
        <PanelDemoDisclosure
          className={styles.provenance}
          mode={viewModel.mode}
          note={
            viewModel.mode === "preview"
              ? "Brief 与追问均为完全虚构的离线演示。"
              : "只显示重新验证通过的 Connected Brief。"
          }
          provenanceLabel={viewModel.provenanceLabel}
        />
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

      <div className={styles.workspace}>
        <section
          className={styles.contextRegion}
          aria-labelledby="copilot-context-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.metaLabel}>Explicit identity</p>
              <h2 id="copilot-context-title">当前上下文</h2>
            </div>
            <span className={styles.reason}>
              {transitionLabels[viewModel.lastTransitionReason]}
            </span>
          </div>

          <dl className={styles.contextDetails}>
            <div>
              <dt>Feature ID</dt>
              <dd>{context.featureId}</dd>
            </div>
            <div>
              <dt>Project ID</dt>
              <dd>{context.projectId ?? "未选择项目（null）"}</dd>
            </div>
          </dl>

          <form
            className={styles.form}
            method="get"
            aria-label="切换 Copilot 上下文"
          >
            <ContextStateFields viewModel={viewModel} />
            <input type="hidden" name="action" value="switch" />
            <label>
              <span>面板</span>
              <select name="featureId" defaultValue={context.featureId}>
                {featureRegistry.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.title} · {feature.subtitle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>项目 ID</span>
              <input
                name="projectId"
                defaultValue={context.projectId ?? ""}
                placeholder="留空表示 null"
              />
            </label>
            <button type="submit">切换并校准上下文</button>
            <small>
              任一身份字段变化都会同步清除旧证据引用；同一身份则保留。
            </small>
          </form>
        </section>

        <section
          className={styles.evidenceRegion}
          aria-labelledby="copilot-evidence-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.metaLabel}>Reference IDs only</p>
              <h2 id="copilot-evidence-title">证据引用</h2>
            </div>
            <span>{context.evidenceReferenceIds.length} 项</span>
          </div>

          {context.evidenceReferenceIds.length === 0 ? (
            <p className={styles.emptyState}>暂无证据引用</p>
          ) : (
            <ul className={styles.evidenceList}>
              {context.evidenceReferenceIds.map((referenceId) => (
                <li key={referenceId}>{referenceId}</li>
              ))}
            </ul>
          )}

          <form
            className={styles.form}
            method="get"
            aria-label="添加证据引用"
          >
            <ContextStateFields viewModel={viewModel} />
            <input type="hidden" name="action" value="evidence" />
            <label>
              <span>证据引用 ID</span>
              <textarea
                name="evidenceReferenceIds"
                rows={4}
                aria-label="证据引用 ID"
                placeholder="每行一个引用 ID"
              />
            </label>
            <button type="submit">更新本地引用</button>
            <small>
              只保存稳定引用 ID，不内嵌证据内容，也不声明任何模型结论。
            </small>
          </form>
        </section>
      </div>

      <ProjectBriefRegion state={viewModel.projectBrief} />

      <section className={styles.followUpRegion} aria-labelledby="brief-follow-up-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.metaLabel}>Single turn · Current Brief only</p>
            <h2 id="brief-follow-up-title">受约束追问</h2>
          </div>
        </div>
        <p>{viewModel.followUp.message}</p>
        <p className={styles.emptyState}>追问暂未启用</p>
        <small>无聊天历史、无外部搜索、无工具调用，也不会产生额外计费。</small>
      </section>

      <footer className={styles.footer}>
        <p>Shell 状态仅随本次页面请求传递，不会持久化或发送到外部服务。</p>
        <Link href="/">返回 Command Deck</Link>
      </footer>
    </main>
  );
}
