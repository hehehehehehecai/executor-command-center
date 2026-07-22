import Link from "next/link";
import { commandDeckPreviewFixture } from "@/content/demo-data/command-deck-preview-fixture";
import { GitHubSignInLink } from "@/features/onboarding";
import { featureRegistry } from "@/shared/features/feature-registry";

export function CommandDeckPage() {
  const { project } = commandDeckPreviewFixture;

  return (
    <main className="command-deck-shell">
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
        <GitHubSignInLink />
      </header>

      <section className="project-summary" aria-labelledby="command-deck-title">
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
    </main>
  );
}
