import Link from "next/link";
import type { WorkspaceContext } from "@/application/workspace/load-workspace-context";
import { AccountIdentity } from "@/features/onboarding";
import { featureRegistry } from "@/shared/features/feature-registry";
import { workspaceHref, workspaceProjectLabel } from "@/shared/workspace-navigation";
import { CommandDeckNavigation } from "./command-deck-navigation";
import styles from "./command-deck.module.css";
import type { CommandDeckOverview } from "./command-deck-connected-query";
import { ConnectedReadNote } from "@/shared/connected-read-note";

export function CommandDeckPage({ workspace = { status: "signed_out", reason: "missing_session" }, projectId, overview }: {
  readonly workspace?: WorkspaceContext;
  readonly projectId?: string | null;
  readonly overview?: CommandDeckOverview;
} = {}) {
  const projects = workspace.status === "authenticated" && workspace.projects.status === "ready" ? workspace.projects.data : [];
  const project = projectId ? projects.find(item => item.id === projectId) : projects.length === 1 ? projects[0] : undefined;
  const failed = workspace.status === "unavailable" || (workspace.status === "authenticated" && (workspace.identity.status === "failed" || workspace.installation.status === "failed" || workspace.projects.status !== "ready"));
  const unavailableProject = Boolean(projectId && !project);
  const active = workspace.status === "authenticated" && !failed && !unavailableProject;
  const data = overview?.kind === "ready" && workspace.status === "authenticated" && overview.userId === workspace.userId && overview.projectId === project?.id ? overview : null;
  const message = workspace.status === "unavailable" ? "暂时无法读取当前账号，请重试。" : unavailableProject ? "没有可显示的项目，请重新选择当前账号所属项目。" : "项目读取暂时无法完成，请检查账号与 GitHub App 状态后重试。";
  return <div className="command-deck-shell" data-visual-zone="command-deck-shell">
    <header className="command-deck-header">
      <div className="brand-intro"><p className="brand-kicker">项目舰桥</p><h1 id="executor-title">EXECUTOR</h1><p className="brand-tagline">Command Your Projects</p></div>
      <AccountIdentity workspace={workspace} />
    </header>
    <main id="main-content" tabIndex={-1}><div className="workspace-shell">
      {active ? <CommandDeckNavigation projectId={project?.id} /> : null}
      <section className={"workspace-main " + styles.workspaceMain} aria-label="Command Deck 工作区" data-visual-zone="command-deck-main">
        <h2>Command Deck</h2>
        {failed || unavailableProject ? <>
          <p role={workspace.status === "unavailable" ? "status" : "alert"}>{message}</p>
          <Link href={workspaceHref("home", { projectId: unavailableProject ? null : projectId })} prefetch={false}>重试读取</Link>
          {workspace.status === "authenticated" && workspace.projects.status === "blocked" ? <Link href="/onboarding">检查 GitHub App 状态</Link> : null}
        </> : workspace.status === "signed_out" ? <p>连接 GitHub 身份并选择你的仓库，在五个面板查看项目背景、活动、任务、决策和简报。登录后可接入项目。</p>
          : projects.length === 0 ? <><p>当前账号还没有项目。</p><Link href="/onboarding" prefetch={false}>接入项目</Link></> : <>
            <form method="get" action="/" aria-label="选择工作区项目">
              <label>选择项目<select name="project" defaultValue={project?.id ?? ""} required>
                <option value="" disabled>请选择项目</option>
                {projects.map(item => <option key={item.id} value={item.id}>{workspaceProjectLabel(item, projects)}</option>)}
              </select></label><button type="submit">进入项目</button>
            </form>
            {project ? <section className="project-summary" aria-label="当前项目"><p className="project-name">{project.name}</p><p>{project.status ?? "项目背景可稍后填写"}</p></section> : <p>请选择当前账号所属项目，面板入口会保留你的选择。</p>}
            {data ? <ConnectedReadNote state={data.readState} /> : overview && project ? <p role="status">项目统计暂时无法读取，请刷新或重试读取。</p> : null}
            <nav className="panel-navigation" aria-label="Command Deck 面板入口"><ol className="panel-grid">
              {featureRegistry.map(feature => <li key={feature.id}><article className={"command-panel " + styles.panel} data-feature-id={feature.id} aria-labelledby={feature.id + "-title"}>
                <h3 id={feature.id + "-title"}>{feature.title}</h3><p className="panel-subtitle">{feature.subtitle}</p>
                {data ? <p data-project-statistic={feature.id}>{data.cards[feature.id]}</p> : null}
                <Link className="panel-link" href={workspaceHref(feature.id, { projectId: project?.id })} prefetch={false}>打开{feature.subtitle}</Link>
              </article></li>)}
            </ol></nav>
          </>}
      </section>
      {active && projects.length ? <aside className={"workspace-inspector " + styles.support} aria-label="舰桥上下文" data-visual-zone="command-deck-support"><h2>舰桥上下文</h2><p>{project?.name ?? "尚未选择项目"}</p><p>面板数据来自当前账号所属项目。</p></aside> : null}
    </div></main>
  </div>;
}
