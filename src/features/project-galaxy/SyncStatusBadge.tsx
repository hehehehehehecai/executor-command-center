import {
  createProjectFreshnessPresentation,
  type ProjectFreshnessPresentationInput,
} from "./freshness-presentation";

export interface SyncStatusBadgeProps {
  readonly input: ProjectFreshnessPresentationInput;
}

export function SyncStatusBadge({ input }: SyncStatusBadgeProps) {
  const presentation = createProjectFreshnessPresentation(input);

  return (
    <section
      className="freshness-card"
      data-freshness-status={presentation.freshnessStatus}
      aria-labelledby="project-freshness-title"
    >
      <div className="freshness-heading">
        <div>
          <p className="section-kicker">Project data</p>
          <h3 id="project-freshness-title">数据新鲜度</h3>
        </div>
        <span
          className={`freshness-badge freshness-badge--${presentation.freshnessStatus}`}
        >
          {presentation.label}
        </span>
      </div>

      <p className="freshness-provenance">{presentation.provenanceLabel}</p>
      <p className="freshness-description">{presentation.description}</p>

      <dl className="freshness-details">
        <div>
          <dt>最后成功同步</dt>
          <dd>
            {presentation.lastSuccessful === null ? (
              "无"
            ) : (
              <time dateTime={presentation.lastSuccessful.dateTime}>
                {presentation.lastSuccessful.label}
              </time>
            )}
          </dd>
        </div>

        {presentation.currentRun === null ? null : (
          <div>
            <dt>当前 SyncRun</dt>
            <dd>
              {presentation.currentRun.status} · {presentation.currentRun.safeId}
            </dd>
          </div>
        )}

        {presentation.safeErrorCode === null ? null : (
          <div>
            <dt>安全错误码</dt>
            <dd>
              <code>{presentation.safeErrorCode}</code>
            </dd>
          </div>
        )}
      </dl>

      {presentation.showStaleWarning ? (
        <p className="freshness-warning">数据已超过 24 小时未成功同步。</p>
      ) : null}
    </section>
  );
}
