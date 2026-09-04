import type { PanelMode } from "@/shared/panel-query";

export const flightLogEventTypes = [
  "commit",
  "issue",
  "pull_request",
  "release",
  "workflow",
  "sync_event",
] as const;

export const flightLogTimeRanges = ["all", "24h", "7d", "30d"] as const;

export type FlightLogEventType = (typeof flightLogEventTypes)[number];
export type FlightLogTimeRange = (typeof flightLogTimeRanges)[number];

export interface FlightLogEvent {
  readonly id: string;
  readonly eventType: FlightLogEventType;
  readonly occurredAt: string;
  readonly summary: string;
  readonly sourceLabel: string;
  readonly originalUrl: string | null;
}

export interface FlightLogSource {
  readonly events: readonly FlightLogEvent[];
  readonly lastSuccessfulAt: string | null;
  readonly provenanceLabel: string;
}

export interface FlightLogFilterSelection {
  readonly eventTypes: readonly FlightLogEventType[];
  readonly timeRange: FlightLogTimeRange;
  readonly now: string;
}

export interface FlightLogFreshness {
  readonly status: "fresh" | "stale";
  readonly label: "Fresh" | "Stale";
  readonly description: string;
  readonly lastSuccessfulAt: string | null;
}

export interface FlightLogViewModel {
  readonly mode: PanelMode;
  readonly provenanceLabel: string;
  readonly filters: FlightLogFilterSelection;
  readonly freshness: FlightLogFreshness;
  readonly sourceEventCount: number;
  readonly events: readonly FlightLogEvent[];
}

const eventTypeOrder = new Map<FlightLogEventType, number>(
  flightLogEventTypes.map((eventType, index) => [eventType, index]),
);

const timeRangeMilliseconds = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const satisfies Readonly<
  Record<Exclude<FlightLogTimeRange, "all">, number>
>;

function timestamp(value: string) {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("flight_log_invalid_time");
  }

  return parsed;
}

function safeOriginalUrl(value: string | null) {
  if (value === null) return null;

  try {
    const parsed = new URL(value);

    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function canonicalEventTypes(
  eventTypes: readonly FlightLogEventType[],
): readonly FlightLogEventType[] {
  const selected = new Set(eventTypes);

  return flightLogEventTypes.filter((eventType) => selected.has(eventType));
}

function withinTimeRange(
  occurredAt: number,
  now: number,
  timeRange: FlightLogTimeRange,
) {
  if (timeRange === "all") return true;

  return (
    occurredAt >= now - timeRangeMilliseconds[timeRange] && occurredAt <= now
  );
}

function freshness(
  lastSuccessfulAt: string | null,
  now: number,
): FlightLogFreshness {
  const isFresh =
    lastSuccessfulAt !== null &&
    now - timestamp(lastSuccessfulAt) <= timeRangeMilliseconds["24h"];

  return {
    status: isFresh ? "fresh" : "stale",
    label: isFresh ? "Fresh" : "Stale",
    description: isFresh
      ? "活动数据在 24 小时新鲜窗口内。"
      : lastSuccessfulAt === null
        ? "尚无成功同步记录。"
        : "活动数据已离开 24 小时新鲜窗口。",
    lastSuccessfulAt,
  };
}

export function createFlightLogViewModel(
  source: FlightLogSource,
  mode: PanelMode,
  filterSelection: FlightLogFilterSelection,
): FlightLogViewModel {
  const now = timestamp(filterSelection.now);
  const eventTypes = canonicalEventTypes(filterSelection.eventTypes);
  const selectedTypes = new Set(eventTypes);
  const events = source.events
    .map((item) => ({
      event: {
        ...item,
        originalUrl: safeOriginalUrl(item.originalUrl),
      },
      timestamp: timestamp(item.occurredAt),
    }))
    .filter(
      (item) =>
        selectedTypes.has(item.event.eventType) &&
        withinTimeRange(item.timestamp, now, filterSelection.timeRange),
    )
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp ||
        (eventTypeOrder.get(left.event.eventType) ?? Number.MAX_SAFE_INTEGER) -
          (eventTypeOrder.get(right.event.eventType) ??
            Number.MAX_SAFE_INTEGER) ||
        left.event.id.localeCompare(right.event.id),
    )
    .map(({ event }) => event);

  return {
    mode,
    provenanceLabel: source.provenanceLabel,
    filters: {
      eventTypes,
      timeRange: filterSelection.timeRange,
      now: filterSelection.now,
    },
    freshness: freshness(source.lastSuccessfulAt, now),
    sourceEventCount: source.events.length,
    events,
  };
}
