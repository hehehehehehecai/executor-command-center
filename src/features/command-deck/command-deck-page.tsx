import Link from "next/link";
import { commandDeckPreviewFixture } from "@/content/demo-data/command-deck-preview-fixture";
import { GitHubSignInLink } from "@/features/onboarding";
import { SyncStatusBadge } from "@/features/project-galaxy";
import { featureRegistry } from "@/shared/features/feature-registry";

import { CommandDeckNavigation } from "./command-deck-navigation";

export function CommandDeckPage(input: { readonly authenticated?: boolean } = {}) {
  const { project } = commandDeckPreviewFixture;

  return (
    <div className="command-deck-shell">
      <header className="command-deck-header">
        <div className="brand-intro">
          <p className="brand-kicker">舰桥预览</p>
          <h1 id="executor-title">EXECUTOR</h1>
          <p className="brand-tagline">Command Your Projects</p>
        </div>

        <div className="preview-contract" aria-label="Preview 数据说明">
          <strong>{commandDeckPreviewFixture.disclosure}</strong>
          <span>
            演示数据版本 {commandDeckPreviewFixture.fixtureVersion}
          </span>
        </div>
        {input.authenticated ? (
          <aside className="auth-entry" aria-label="GitHub 身份登录">
            <strong>GitHub 身份已登录</strong>
            <Link className="auth-entry-link" href="/onboarding">
              查看 GitHub App 状态
            </Link>
          </aside>
        ) : (
          <GitHubSignInLink />
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="workspace-shell">
        <CommandDeckNavigation />

        <section className="workspace-main" aria-label="Command Deck 工作区">
          <section
            className="project-summary"
            aria-labelledby="command-deck-title"
          >
            <div>
              <p className="section-kicker">Preview project</p>
              <h2 id="command-deck-title">Command Deck</h2>
              <p className="project-name">{project.name}</p>
            </div>

            <dl className="project-metadata">
              <div>
                <dt>Repository</dt>
                <dd>{project.repositoryLabel}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{project.officialStatus}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{project.freshnessLabel}</dd>
              </div>
            </dl>
          </section>

          <SyncStatusBadge input={project.freshness} />

          <nav className="panel-navigation" aria-label="Command Deck 面板入口">
            <ol className="panel-grid">
              {featureRegistry.map((feature) => {
                const panel = commandDeckPreviewFixture.panels[feature.id];
                const titleId = `${feature.id}-title`;

                return (
                  <li key={feature.id}>
                    <article
                      className="command-panel"
                      data-feature-id={feature.id}
                      aria-labelledby={titleId}
                    >
                      <div className="panel-heading">
                        <span className="demo-marker">演示数据</span>
                        <span className="panel-order">
                          {String(feature.order).padStart(2, "0")}
                        </span>
                      </div>

                      <div>
                        <h3 id={titleId}>{feature.title}</h3>
                        <p className="panel-subtitle">{feature.subtitle}</p>
                      </div>

                      <p className="panel-status">{panel.status}</p>
                      <p className="panel-summary">{panel.summary}</p>
                      <p className="panel-detail">{panel.detail}</p>

                      <Link
                        className="panel-link"
                        href={feature.route}
                        prefetch={false}
                      >
                        打开{feature.subtitle}演示入口
                      </Link>
                    </article>
                  </li>
                );
              })}
            </ol>
          </nav>

          <p className="preview-note">
            这些入口展示稳定路由元数据；深度面板页面将在后续 Phase 实现。
          </p>
        </section>

        <aside className="workspace-inspector" aria-label="舰桥上下文">
          <p className="section-kicker">Context inspector</p>
          <h2>舰桥上下文</h2>
          <dl>
            <div>
              <dt>Mode</dt>
              <dd>Preview Shell</dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>{project.name}</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd>后续 Phase 实现</dd>
            </div>
          </dl>
          <p>
            当前仅提供布局、导航与演示上下文，不代表五个 Feature
            的深度能力已经完成。
          </p>
        </aside>
        </div>
      </main>
    </div>
  );
}
