import Link from "next/link";

import { PanelDemoDisclosure } from "@/shared/demo-disclosure";

import styles from "./flight-log.module.css";
import {
  flightLogEventTypes,
  flightLogTimeRanges,
  type FlightLogEventType,
  type FlightLogTimeRange,
  type FlightLogViewModel,
} from "./flight-log-view-model";

const eventTypeLabels = {
  commit: "Commit",
  issue: "Issue",
  pull_request: "Pull Request",
  release: "Release",
  workflow: "Workflow",
  sync_event: "Sync Event",
} as const satisfies Readonly<Record<FlightLogEventType, string>>;

const timeRangeLabels = {
  all: "全部时间",
  "24h": "最近 24 小时",
  "7d": "最近 7 天",
  "30d": "最近 30 天",
} as const satisfies Readonly<Record<FlightLogTimeRange, string>>;

function formatUtc(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "时间未知";

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export interface FlightLogPanelProps {
  readonly viewModel: FlightLogViewModel;
}

export function FlightLogPanel({ viewModel }: FlightLogPanelProps) {
  const selectedTypes = new Set(viewModel.filters.eventTypes);

  return (
    <main
      id="main-content"
      className={styles.shell}
      tabIndex={-1}
      aria-labelledby="flight-log-title"
    >
      <header className={styles.header}>
        <div>
          <p className="section-kicker">Flight Log · 航行日志</p>
          <h1 id="flight-log-title" className={styles.title}>
            Flight Log
          </h1>
          <p className={styles.intro}>
            将代码活动、协作记录、发布、工作流与同步事件汇入统一时间线。
          </p>
        </div>
        <PanelDemoDisclosure
          className={styles.provenance}
          mode={viewModel.mode}
          provenanceLabel={viewModel.provenanceLabel}
        />
      </header>

      <section
        className={styles.freshness}
        role="status"
        aria-label="Flight Log 数据新鲜度"
        data-freshness-status={viewModel.freshness.status}
      >
        <div>
          <p className={styles.metaLabel}>数据新鲜度</p>
          <strong>{viewModel.freshness.label}</strong>
        </div>
        <p>{viewModel.freshness.description}</p>
        <p>
          {viewModel.freshness.lastSuccessfulAt === null
            ? "最近成功同步：无记录"
            : `最近成功同步：${formatUtc(viewModel.freshness.lastSuccessfulAt)}`}
        </p>
      </section>

      <form
        className={styles.filters}
        method="get"
        aria-label="筛选航行日志"
        role="search"
      >
        <input type="hidden" name="apply" value="1" />
        <input type="hidden" name="mode" value={viewModel.mode} />
        <fieldset className={styles.typeFieldset}>
          <legend>事件类型</legend>
          <div className={styles.typeOptions}>
            {flightLogEventTypes.map((eventType) => (
              <label key={eventType}>
                <input
                  type="checkbox"
                  name="type"
                  value={eventType}
                  defaultChecked={selectedTypes.has(eventType)}
                />
                <span>{eventTypeLabels[eventType]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className={styles.timeFilter}>
          <span>时间范围</span>
          <select name="range" defaultValue={viewModel.filters.timeRange}>
            {flightLogTimeRanges.map((timeRange) => (
                <option key={timeRange} value={timeRange}>
                  {timeRangeLabels[timeRange]}
                </option>
              ))}
          </select>
        </label>
        <button type="submit">应用筛选</button>
      </form>

      <section
        className={styles.timelineSection}
        aria-labelledby="flight-log-timeline-title"
      >
        <div className={styles.timelineHeading}>
          <div>
            <p className={styles.metaLabel}>Unified activity stream</p>
            <h2 id="flight-log-timeline-title">Flight Log 时间线</h2>
          </div>
          <p aria-label="事件数量">
            {viewModel.events.length} / {viewModel.sourceEventCount} 条
          </p>
        </div>

        {viewModel.sourceEventCount === 0 ? (
          <p className={styles.emptyState}>尚无航行记录</p>
        ) : viewModel.events.length === 0 ? (
          <p className={styles.emptyState}>当前筛选没有匹配事件</p>
        ) : (
          <ol className={styles.timeline}>
            {viewModel.events.map((event) => (
              <li key={`${event.eventType}:${event.id}`}>
                <article
                  className={styles.eventCard}
                  data-event-type={event.eventType}
                >
                  <div className={styles.eventMeta}>
                    <span className={styles.eventType}>
                      {eventTypeLabels[event.eventType]}
                    </span>
                    <time dateTime={event.occurredAt}>
                      {formatUtc(event.occurredAt)}
                    </time>
                  </div>
                  <h3>{event.summary}</h3>
                  <p className={styles.sourceLabel}>{event.sourceLabel}</p>
                  {event.originalUrl === null ? (
                    <span className={styles.unavailableLink}>
                      原始链接不可用
                    </span>
                  ) : (
                    <a href={event.originalUrl}>查看原始记录</a>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className={styles.footer}>
        <Link href="/">返回 Command Deck</Link>
      </footer>
    </main>
  );
}
