import Link from "next/link";

import { PanelDemoDisclosure } from "@/shared/demo-disclosure";
import { featureRegistry } from "@/shared/features/feature-registry";

import styles from "./copilot-workspace.module.css";
import type { CopilotWorkspaceViewModel } from "./copilot-workspace-view-model";

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
          note="本阶段不生成答案，也不调用 AI 模型。"
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

      <footer className={styles.footer}>
        <p>Shell 状态仅随本次页面请求传递，不会持久化或发送到外部服务。</p>
        <Link href="/">返回 Command Deck</Link>
      </footer>
    </main>
  );
}
