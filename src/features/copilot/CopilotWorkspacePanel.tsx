"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { WorkspaceProject } from "@/application/workspace/load-workspace-context";
import { ProjectBriefGenerationAction } from "@/features/project-galaxy";
import { PanelDemoDisclosure } from "@/shared/demo-disclosure";
import { featureRegistry } from "@/shared/features/feature-registry";
import type { PanelMode } from "@/shared/panel-query";
import { workspaceHref, workspaceProjectIdPattern, workspaceProjectLabel } from "@/shared/workspace-navigation";
import { projectBriefBoundaryNote } from "@/domain/project-brief/project-brief-contract";
import type { CopilotEvidenceViewModel } from "./copilot-project-brief-view-model";
import type { CopilotProjectBriefState, CopilotWorkspaceViewModel } from "./copilot-workspace-view-model";
import styles from "./copilot-workspace.module.css";

const transitionLabels: Record<CopilotWorkspaceViewModel["lastTransitionReason"], string> = {
  initialized: "本地 Shell 上下文已初始化",
  identity_unchanged: "身份未变化，引用已保留",
  feature_changed: "面板已切换，旧引用已清除",
  project_changed: "项目已切换，旧引用已清除",
  evidence_updated: "本地证据引用已更新",
};
const statusLabels: Record<string, string> = { idea: "构思中", planned: "计划中", in_development: "进行中", launched: "已上线", paused: "已暂停", archived: "已归档" };
const sourceLabels: Record<string, string> = { github_commit: "提交记录", github_issue: "问题记录", github_pull_request: "合并请求", github_release: "版本发布", github_workflow_run: "运行记录", github_document: "仓库文档", project_profile: "项目背景", confirmed_decision: "已确认决策", freshness: "同步记录" };
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
const readableTime = (value: string) => timeFormatter.format(new Date(value));
const briefStateMessages: Record<Exclude<CopilotProjectBriefState["status"], "ready">, string> = {
  not_found: "当前项目暂无已完成简报。", expired: "当前项目只有已过期简报。",
  invalid: "简报结构验证失败。", evidence_validation_failed: "简报证据重新验证失败。", unavailable: "简报读取暂时不可用。",
};
export interface CopilotWorkspaceFeedback { readonly kind: "error" | "success"; readonly message: string }
export interface CopilotWorkspacePanelProps {
  readonly returnHref?: string; readonly projects?: readonly WorkspaceProject[];
  readonly viewModel: CopilotWorkspaceViewModel; readonly feedback?: CopilotWorkspaceFeedback;
}

function EvidenceLinks({ evidence, mode, briefId }: { readonly evidence: readonly CopilotEvidenceViewModel[]; readonly mode: PanelMode; readonly briefId?: string }) {
  if (evidence.length === 0) return <span className={styles.noEvidence}>暂无可核验来源</span>;
  return <ul className={styles.inlineEvidence} aria-label="相关来源">{evidence.map(ref => <li key={ref.referenceId}>
    {ref.href === null || !workspaceProjectIdPattern.test(ref.projectId) ? <span>来源暂不可打开</span> :
      <Link prefetch={false} href={workspaceHref("copilot", { projectId: ref.projectId, mode, query: { selectedEvidence: ref.referenceId, briefId } }) + "#copilot-selected-evidence"}>查看证据 · {ref.summary ?? sourceLabels[ref.sourceKind] ?? "相关记录"}</Link>}
  </li>)}</ul>;
}

function BriefItems({ section, mode, briefId }: {
  readonly section: Extract<CopilotProjectBriefState, { status: "ready" }>["value"]["sections"][number]; readonly mode: PanelMode; readonly briefId?: string;
}) {
  return <section className={styles.briefSection} aria-label={section.title}>
    <h3>{section.title}</h3>
    {section.empty ? <p className={styles.emptyState}>{section.emptyMessage}</p> : <ul className={styles.briefItems}>{section.items.map(item => <li key={item.id}>
      <p>{item.text}</p>
      {item.missingEvidence.length ? <p className={styles.missingEvidence}>缺失证据：{item.missingEvidence.join("；")}</p> : null}
      <EvidenceLinks evidence={item.evidence} mode={mode} briefId={briefId} />
    </li>)}</ul>}
  </section>;
}

function ProjectBriefRegion({ state, mode }: { readonly state: CopilotProjectBriefState; readonly mode: PanelMode }) {
  const selectedEvidenceTarget = useRef<HTMLElement>(null);
  const selectedReferenceId = state.status === "ready" ? state.value.selectedEvidence?.referenceId : undefined;
  useEffect(() => {
    if (!selectedReferenceId) return;
    let pending = true;
    const observer = new MutationObserver(() => focusSelectedEvidence());
    const observeVisibility = () => {
      for (let ancestor = selectedEvidenceTarget.current?.parentElement; ancestor; ancestor = ancestor.parentElement) {
        observer.observe(ancestor, { attributes: true, attributeFilter: ["hidden"] });
      }
    };
    const focusSelectedEvidence = () => {
      const target = selectedEvidenceTarget.current;
      if (!pending || window.location.hash !== "#copilot-selected-evidence" || !target || target.closest("[hidden]")) return;
      target.focus({ preventScroll: true });
      if (document.activeElement === target) pending = false;
    };
    // Account revalidation temporarily hides this page and releases browser focus.
    // Restore only focus lost through that boundary, preserving deliberate moves.
    const preserveHiddenFocus = () => { if (selectedEvidenceTarget.current?.closest("[hidden]")) pending = true; };
    const restoreFocus = () => { pending = true; observeVisibility(); focusSelectedEvidence(); };
    const target = selectedEvidenceTarget.current;
    target?.addEventListener("blur", preserveHiddenFocus);
    observeVisibility();
    focusSelectedEvidence();
    const frame = window.requestAnimationFrame(focusSelectedEvidence);
    window.addEventListener("pageshow", restoreFocus);
    window.addEventListener("hashchange", restoreFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      target?.removeEventListener("blur", preserveHiddenFocus);
      window.removeEventListener("pageshow", restoreFocus);
      window.removeEventListener("hashchange", restoreFocus);
    };
  }, [selectedReferenceId]);

  if (state.status !== "ready") return <>
    <section className={styles.briefState} aria-label="简报状态"><p role="status">{briefStateMessages[state.status]}</p><p>完成仓库同步后，可在下方生成简报。未经验证的内容不会显示。</p></section>
    {([["recent", "最近发生什么"], ["attention", "需要关注什么"], ["next", "下一步建议"], ["sources", "来源与更新时间"]] as const).map(([id, title]) => <section className={styles.emptySection} aria-label={title} data-copilot-section={id} key={id}><h2>{title}</h2><p>暂无可显示的已验证简报内容。</p></section>)}
    <details className={styles.diagnostics} data-copilot-diagnostics><summary>简报读取详情</summary><aside role="note" aria-label="Brief 边界"><h3>读取边界</h3><p>{projectBriefBoundaryNote}</p></aside></details>
  </>;

  const brief = state.value;
  const linkedBriefId = mode === "connected" && brief.generatedAt ? brief.briefId : undefined;
  const completed = brief.sections.filter(x => x.id === "completedChanges");
  const attention = brief.sections.filter(x => ["openItems", "riskSignals", "unknowns"].includes(x.id));
  const ongoing = brief.sections.filter(x => x.id === "ongoingWork");
  return <section className={styles.briefRegion} aria-label="项目简报">
    <section className={styles.recentRegion} aria-label="最近发生什么" data-copilot-section="recent">
      <div className={styles.sectionHeading}><div><p className={styles.metaLabel}>项目进展</p><h2>最近发生什么</h2></div><span className={styles.statusBadge}>{statusLabels[brief.officialStatus.value ?? ""] ?? brief.officialStatus.value ?? "未确认"}</span></div>
      <section className={styles.briefSummary} aria-label="摘要"><h3>项目概况</h3><p>{brief.summary.text}</p><EvidenceLinks evidence={brief.summary.evidence} mode={mode} briefId={linkedBriefId} /></section>
      {completed.map(section => <BriefItems key={section.id} section={section} mode={mode} briefId={linkedBriefId} />)}
    </section>
    <div className={styles.briefColumns}>
      <section className={styles.attentionRegion} aria-label="需要关注什么" data-copilot-section="attention"><p className={styles.metaLabel}>待关注</p><h2>需要关注什么</h2>{attention.map(section => <BriefItems key={section.id} section={section} mode={mode} briefId={linkedBriefId} />)}</section>
      <section className={styles.nextRegion} aria-label="下一步建议" data-copilot-section="next"><p className={styles.metaLabel}>接下来</p><h2>下一步建议</h2><p className={styles.sectionNote}>仅列出简报记录的进行中工作；暂未提供额外行动建议。</p>{ongoing.map(section => <BriefItems key={section.id} section={section} mode={mode} briefId={linkedBriefId} />)}</section>
    </div>
    <section className={styles.evidenceRegion} aria-label="来源与更新时间" data-copilot-section="sources"><div className={styles.sectionHeading}><div><p className={styles.metaLabel}>核验依据</p><h2>来源与更新时间</h2></div><span className={styles.sourceCount}>{brief.evidenceSources.length} 项来源</span></div>
      <p className={styles.updateTime}>{brief.generatedAt ? <>生成于 <time dateTime={brief.generatedAt}>{readableTime(brief.generatedAt)}</time></> : "生成时间暂未提供"} · 最近同步 {brief.freshness.lastSuccessfulAt ? <time dateTime={brief.freshness.lastSuccessfulAt}>{readableTime(brief.freshness.lastSuccessfulAt)}</time> : "时间未知"}（北京时间）</p>
      <ul className={styles.evidenceList}>{brief.evidenceSources.map(ref => <li key={ref.referenceId}><Link prefetch={false} href={workspaceHref("copilot", { projectId: ref.projectId, mode, query: { selectedEvidence: ref.referenceId, briefId: linkedBriefId } }) + "#copilot-selected-evidence"}><span>{ref.summary ?? sourceLabels[ref.sourceKind] ?? "相关记录"}</span><span className={styles.sourceKind}>{sourceLabels[ref.sourceKind] ?? "来源"} →</span></Link></li>)}</ul>
    </section>
    {brief.selectedEvidence ? <aside ref={selectedEvidenceTarget} id="copilot-selected-evidence" className={styles.selectedEvidence} aria-label="来源详情" tabIndex={-1}><p className={styles.metaLabel}>已选择的来源</p><h3>来源详情</h3>{brief.selectedEvidence.summary ? <p>{brief.selectedEvidence.summary}</p> : null}{brief.selectedEvidence.occurredAt ? <p>发生时间：<time dateTime={brief.selectedEvidence.occurredAt}>{readableTime(brief.selectedEvidence.occurredAt)}</time>（北京时间）</p> : null}{brief.selectedEvidence.relationship ? <p>{brief.selectedEvidence.relationship}</p> : null}{brief.selectedEvidence.originalHref ? <a href={brief.selectedEvidence.originalHref} target="_blank" rel="noopener noreferrer">查看原始来源</a> : null}<details data-copilot-diagnostics><summary>来源标识</summary><dl><div><dt>sourceKind</dt><dd>{brief.selectedEvidence.sourceKind}</dd></div><div><dt>sourceId</dt><dd>{brief.selectedEvidence.sourceId}</dd></div><div><dt>projectId</dt><dd>{brief.selectedEvidence.projectId}</dd></div></dl></details></aside> : null}
    <details className={styles.diagnostics} data-copilot-diagnostics><summary>简报核验与技术详情</summary>
      <section aria-label="官方状态"><h3>官方状态</h3><p>{brief.officialStatus.value ?? "未确认"}</p><EvidenceLinks evidence={brief.officialStatus.evidence} mode={mode} briefId={linkedBriefId} /></section>
      <section className={styles.freshness} aria-label="Freshness"><h3>Freshness</h3><dl><div><dt>status</dt><dd>{brief.freshness.status}</dd></div><div><dt>evaluatedAt</dt><dd><time dateTime={brief.freshness.evaluatedAt}>{brief.freshness.evaluatedAt}</time></dd></div><div><dt>lastSuccessfulAt</dt><dd>{brief.freshness.lastSuccessfulAt ?? "未知"}</dd></div><div><dt>coverageComplete</dt><dd>{brief.freshness.coverageComplete ? "是" : "否"}</dd></div></dl><EvidenceLinks evidence={brief.freshness.evidence} mode={mode} briefId={linkedBriefId} /></section>
      <dl className={styles.briefMetadata} aria-label="Brief 元数据"><div><dt>Range</dt><dd>{brief.rangeStart} → {brief.rangeEnd}</dd></div><div><dt>Prompt</dt><dd>{brief.promptVersion}</dd></div><div><dt>Schema</dt><dd>{brief.schemaVersion}</dd></div><div><dt>Fingerprint</dt><dd>{brief.evidenceFingerprint}</dd></div></dl>
      <aside role="note" aria-label="Brief 边界"><h3>简报边界</h3><p>{brief.boundaryNote}</p></aside>
    </details>
  </section>;
}

function ContextStateFields({ viewModel }: { readonly viewModel: CopilotWorkspaceViewModel }) {
  return <><input type="hidden" name="mode" value={viewModel.mode} /><input type="hidden" name="fromFeatureId" value={viewModel.context.featureId} /><input type="hidden" name="fromProjectId" value={viewModel.context.projectId ?? ""} />{viewModel.context.evidenceReferenceIds.map(referenceId => <input key={referenceId} type="hidden" name="fromEvidence" value={referenceId} />)}</>;
}

export function CopilotWorkspacePanel({ returnHref="/", projects, viewModel, feedback }: CopilotWorkspacePanelProps) {
  const { context } = viewModel;
  const project = projects?.find(x => x.id === context.projectId);
  return <main id="main-content" className={styles.shell} tabIndex={-1} aria-labelledby="copilot-workspace-title">
    <header className={styles.header}><div><p className={styles.metaLabel}>探索者号 · 项目简报</p><h1 id="copilot-workspace-title">AI 副驾驶</h1><p className={styles.intro}>看清最近进展，找到需要关注的事。</p></div><span className={styles.modeLabel}>{viewModel.mode === "preview" ? "演示内容" : "本人项目"}</span></header>
    {feedback ? <p className={styles.feedback} role="status" data-feedback-kind={feedback.kind}>{feedback.message}</p> : null}
    <section className={styles.contextRegion} aria-label="项目选择" data-copilot-section="project"><div><p className={styles.metaLabel}>当前项目</p><h2 className={styles.projectName}>{project?.name ?? (context.projectId ? "演示项目" : "未选择项目")}</h2></div>
      <form className={styles.form} method="get" aria-label="切换项目"><ContextStateFields viewModel={viewModel} /><input type="hidden" name="action" value="switch" /><details className={styles.pageOptions} data-copilot-diagnostics><summary>更多页面选项</summary><label><span>面板</span><select name="featureId" defaultValue={context.featureId}>{featureRegistry.map(feature => <option key={feature.id} value={feature.id}>{feature.title} · {feature.subtitle}</option>)}</select></label></details>{projects ? <label><span>选择项目</span><select name="projectId" defaultValue={context.projectId ?? ""}>{projects.map(item => <option key={item.id} value={item.id}>{workspaceProjectLabel(item,projects)}</option>)}</select></label> : <details className={styles.pageOptions} data-copilot-diagnostics><summary>演示项目标识</summary><label><span>项目 ID</span><input name="projectId" defaultValue={context.projectId ?? ""} placeholder="留空表示 null" /></label></details>}<button type="submit">切换项目</button></form>
    </section>
    <ProjectBriefRegion state={viewModel.projectBrief} mode={viewModel.mode} />
    {viewModel.mode === "connected" && context.projectId ? <div className={styles.generationPanel}><ProjectBriefGenerationAction key={context.projectId} projectId={context.projectId} availableEnergy={viewModel.availableEnergy} verifiedRange={viewModel.projectBrief.status === "ready" ? viewModel.projectBrief.value : undefined} /></div> : null}
    <details className={styles.diagnostics} data-copilot-diagnostics><summary>数据与页面详情</summary><PanelDemoDisclosure className={styles.provenance} mode={viewModel.mode} note={viewModel.mode === "preview" ? "Brief 与追问均为完全虚构的离线演示。" : "只显示重新验证通过的 Connected Brief。"} provenanceLabel={viewModel.provenanceLabel} />
      <section aria-label="当前上下文"><h2>当前上下文</h2><p>{transitionLabels[viewModel.lastTransitionReason]}</p><dl className={styles.contextDetails}><div><dt>Feature ID</dt><dd>{context.featureId}</dd></div><div><dt>Project ID</dt><dd>{context.projectId ?? "未选择项目（null）"}</dd></div></dl></section>
      <section aria-label="证据引用"><h2>证据引用</h2>{context.evidenceReferenceIds.length ? <ul>{context.evidenceReferenceIds.map(id => <li key={id}>{id}</li>)}</ul> : <p>暂无证据引用</p>}{viewModel.mode === "preview" || projects === undefined ? <form className={styles.evidenceForm} method="get" aria-label="添加证据引用"><ContextStateFields viewModel={viewModel} /><input type="hidden" name="action" value="evidence" /><label><span>证据引用 ID</span><textarea name="evidenceReferenceIds" rows={4} aria-label="证据引用 ID" placeholder="每行一个引用 ID" /></label><button type="submit">更新本地引用</button></form> : null}</section>
      <section className={styles.followUpRegion} aria-label="受约束追问"><h2>受约束追问</h2><p>{viewModel.followUp.message}</p><p>追问暂未启用</p><small>无聊天历史、无外部搜索、无工具调用，也不会产生额外计费。</small></section>
    </details>
    <footer className={styles.footer}><p>以已核验记录为依据，不替你确认项目状态或决定行动。</p><Link href={returnHref}>返回项目总览</Link></footer>
  </main>;
}
