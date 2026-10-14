import Link from "next/link";
import type { WorkspaceEntryContext } from "@/infrastructure/workspace/workspace-entry";
import { AccountIdentity, WorkspaceSessionBoundary } from "@/features/onboarding";
import { featureRegistry } from "@/shared/features/feature-registry";
import { workspaceHref, workspaceProjectLabel, workspaceProjectParameter } from "@/shared/workspace-navigation";
import { CommandDeckNavigation } from "./command-deck-navigation";
import styles from "./workspace-entry-frame.module.css";

function ownedEntryProjectId(context: WorkspaceEntryContext) {
  const { entry, workspace } = context;
  if (entry.kind === "ready") return entry.project.id;
  const projects = workspace.status === "authenticated" && workspace.projects.status === "ready" ? workspace.projects.data : [];
  const requested = workspaceProjectParameter(entry.target, entry.query);
  if (requested === "invalid") return null;
  if (requested) return projects.some(project => project.id === requested) ? requested : null;
  return projects.length === 1 ? projects[0].id : null;
}

export function WorkspacePanelFrame({ context, children }: { readonly context: WorkspaceEntryContext; readonly children: React.ReactNode }) {
  const { entry, workspace } = context;
  // The server has already restricted preview to explicit local test mode.
  // Keep its inherited presentation separate from authenticated navigation.
  if (entry.kind === "preview") return <WorkspaceSessionBoundary workspace={workspace}>{children}</WorkspaceSessionBoundary>;
  const projectId = ownedEntryProjectId(context);
  const hasNavigation = entry.kind === "ready" || entry.kind === "choose";
  const content = <div className="command-deck-shell">
    <header className="command-deck-header"><AccountIdentity workspace={workspace} returnTo={entry.returnTo} /></header>
    <nav className={styles.breadcrumb} aria-label="面包屑"><Link href={workspaceHref("home", { projectId })} prefetch={false}>舰桥总览</Link><span aria-current="page">{entry.target === "home" ? "Command Deck" : featureRegistry.find(feature => feature.id === entry.target)?.title}</span></nav>
    <div className={`${styles.body} ${hasNavigation ? styles.withNavigation : ""}`}>
      {hasNavigation ? <CommandDeckNavigation projectId={projectId} current={entry.target} query={entry.query} /> : null}
      <div className={styles.content}>{children}</div>
    </div>
  </div>;
  return context.controlledFixture ? content : <WorkspaceSessionBoundary workspace={workspace} preserveWorkspaceQuery>{content}</WorkspaceSessionBoundary>;
}

export function WorkspaceEntryStatus({ context }: { readonly context: WorkspaceEntryContext }) {
  const { entry } = context;
  const title = entry.target === "home" ? "Command Deck" : featureRegistry.find(feature => feature.id === entry.target)?.title;
  const failed = ["invalid", "not_found", "unavailable", "revoked"].includes(entry.kind);
  return <WorkspacePanelFrame context={context}><main id="main-content" tabIndex={-1} className="auth-status-shell" data-ui-state={failed ? "failed" : undefined}>
    <h1>{entry.kind === "sign_in" ? "需要登录" : title}</h1>
    {entry.kind === "sign_in" ? <p>登录后可查看你的真实项目数据。</p> : entry.kind === "onboarding" ? <><p>当前账号还没有项目，请先接入仓库。</p><Link href="/onboarding" prefetch={false}>接入项目</Link></> : entry.kind === "choose" ? <>
      <p>请选择当前账号所属项目。</p><form method="get" action={workspaceHref(entry.target)} aria-label="选择工作区项目">
        {Object.entries(entry.query).filter(([key, value]) => !["project", "projectId"].includes(key) && value !== undefined).flatMap(([key, value]) => (typeof value === "string" ? [value] : value ?? []).map((item, index) => <input type="hidden" key={key + index} name={key} value={item} />))}
        <label>选择项目<select name={entry.target === "copilot" ? "projectId" : "project"} defaultValue="" required><option value="" disabled>请选择项目</option>{entry.projects.map(project => <option key={project.id} value={project.id}>{workspaceProjectLabel(project, entry.projects)}</option>)}</select></label>
        <button type="submit">进入项目</button>
      </form>
    </> : "reason" in entry ? <><p role="alert">原因：{entry.reason}</p><p>下一步：重试读取，或返回舰桥选择当前账号所属项目。</p><Link href={entry.returnTo} prefetch={false}>重试读取</Link>{entry.kind === "revoked" ? <Link href="/onboarding">检查 GitHub App 状态</Link> : null}</> : null}
    <Link href={workspaceHref("home", { projectId: ownedEntryProjectId(context) })} prefetch={false}>返回 Command Deck</Link>
  </main></WorkspacePanelFrame>;
}
