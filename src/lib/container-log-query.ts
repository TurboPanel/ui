/**
 * Presentation helpers for the organization container-log explorer.
 *
 * Two jobs, both pure:
 *
 * 1. Turn the filter bar's draft into the **closed** predicate set the read
 *    route accepts ({@link ContainerLogQueryFilter}). That set is the store's
 *    `ORDER BY` prefix, so the UI must never offer — or emit — a filter the
 *    backend cannot answer. Everything unset is simply omitted.
 * 2. Adapt `ContainerLogEvent` rows to the shared transcript row shape so the
 *    explorer reuses `log-transcript-view.tsx` verbatim rather than forking a
 *    second log renderer (see `design-system/turbopanel/pages/container-logs.md`).
 *
 * Container logs carry no `phase` and no per-command sequence — they are an
 * analytics table across the whole fleet, not one command's transcript — so
 * rows get `phase: null` and a synthetic ascending sequence.
 */

import { stripAnsi, type LogTranscriptLine } from '@/lib/execution-log-lines'
import type {
  ContainerLogEventRecord,
  ContainerLogQueryFilter,
  ContainerLogStream,
} from '@/lib/instance-api'
import type { ContainerLogQueryKeyFilter } from '@/lib/query-keys'

/**
 * Selectable windows. Short by default: container output is high volume and a
 * wide window is a scan the store charges for, not a free convenience.
 */
export const CONTAINER_LOG_RANGE_IDS = ['15m', '1h', '6h', '24h'] as const

export type ContainerLogRangeId = (typeof CONTAINER_LOG_RANGE_IDS)[number]

export const CONTAINER_LOG_RANGE_MS: Readonly<
  Record<ContainerLogRangeId, number>
> = {
  '15m': 900_000,
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
}

export const CONTAINER_LOG_RANGE_LABELS: Readonly<
  Record<ContainerLogRangeId, string>
> = {
  '15m': '15m',
  '1h': '1h',
  '6h': '6h',
  '24h': '24h',
}

/** Opening the explorer must not fan out a day-wide scan. */
export const DEFAULT_CONTAINER_LOG_RANGE_ID: ContainerLogRangeId = '15m'

/** Page size. The route clamps at 1000; ask for a screenful-plus, not the cap. */
export const CONTAINER_LOG_PAGE_LIMIT = 200

/** `all` means "do not send `stream`" — not a third value the store knows. */
export type ContainerLogStreamFilter = 'all' | ContainerLogStream

/** What the filter bar holds. Every field maps 1:1 onto the closed predicate set. */
export type ContainerLogFilterDraft = Readonly<{
  rangeId: ContainerLogRangeId
  serverId: string | null
  environmentId: string | null
  serviceId: string | null
  containerId: string | null
  stream: ContainerLogStreamFilter
  search: string
}>

export const DEFAULT_CONTAINER_LOG_FILTER_DRAFT: ContainerLogFilterDraft = {
  rangeId: DEFAULT_CONTAINER_LOG_RANGE_ID,
  serverId: null,
  environmentId: null,
  serviceId: null,
  containerId: null,
  stream: 'all',
  search: '',
}

/** Resolved read window. Both bounds are absolute so a page is reproducible. */
export type ContainerLogTimeWindow = Readonly<{
  fromIso: string
  toIso: string
  fromMs: number
  toMs: number
}>

/**
 * Pin a range id to absolute bounds.
 *
 * `now` is a parameter rather than a `Date.now()` call inside the caller's
 * render: a window that drifts every render would restart pagination on each
 * re-render. The live tail re-resolves it deliberately, on a tick.
 */
export function resolveContainerLogTimeWindow(
  rangeId: ContainerLogRangeId,
  now: number,
): ContainerLogTimeWindow {
  const toMs = now
  const fromMs = toMs - CONTAINER_LOG_RANGE_MS[rangeId]
  return {
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromMs,
    toMs,
  }
}

function optionalPredicate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

/**
 * Serialize the draft into the read route's query filter.
 *
 * Only keys in the closed predicate set are ever emitted, and an unset filter
 * is omitted rather than sent empty — an empty `serverId=` would be a 400 on a
 * stricter backend and is meaningless on this one.
 */
export function toContainerLogQueryFilter(
  draft: ContainerLogFilterDraft,
  window: ContainerLogTimeWindow,
  cursor?: string,
): ContainerLogQueryFilter {
  const filter: ContainerLogQueryFilter = {
    from: window.fromIso,
    to: window.toIso,
    limit: CONTAINER_LOG_PAGE_LIMIT,
  }
  const serverId = optionalPredicate(draft.serverId)
  if (serverId) filter.serverId = serverId
  const environmentId = optionalPredicate(draft.environmentId)
  if (environmentId) filter.environmentId = environmentId
  const serviceId = optionalPredicate(draft.serviceId)
  if (serviceId) filter.serviceId = serviceId
  const containerId = optionalPredicate(draft.containerId)
  if (containerId) filter.containerId = containerId
  const search = optionalPredicate(draft.search)
  if (search) filter.search = search
  if (draft.stream !== 'all') filter.stream = draft.stream
  const trimmedCursor = optionalPredicate(cursor)
  if (trimmedCursor) filter.cursor = trimmedCursor
  return filter
}

/**
 * Cache identity for one composed filter — the query filter minus its cursor,
 * so every page of one window shares a single infinite-query entry.
 */
export function toContainerLogQueryKey(
  filter: ContainerLogQueryFilter,
): ContainerLogQueryKeyFilter {
  const { cursor: _cursor, ...rest } = filter
  return rest
}

/**
 * Cache identity for a **live tail**.
 *
 * A live tail's `[from, to)` moves on every refetch — that movement is the
 * whole point, since a pinned `to` bound can never grow to include a line
 * written after it. So the absolute bounds must not be part of its cache
 * identity, or every tick would allocate a new entry and refetch from scratch.
 * The range id stands in for them: same range + same predicates → one entry
 * whose single page is replaced in place.
 */
export function toContainerLogLiveQueryKey(
  filter: ContainerLogQueryFilter,
  rangeId: ContainerLogRangeId,
): ContainerLogQueryKeyFilter {
  const { cursor: _cursor, from: _from, to: _to, ...rest } = filter
  return { ...rest, from: 'live', to: `live:${rangeId}` }
}

/** Replace a filter's window bounds with a freshly resolved one. */
export function withContainerLogTimeWindow(
  filter: ContainerLogQueryFilter,
  window: ContainerLogTimeWindow,
): ContainerLogQueryFilter {
  return { ...filter, from: window.fromIso, to: window.toIso }
}

/**
 * Adapt one page-flattened, **newest-first** event list to transcript rows.
 *
 * The viewer renders top-to-bottom and follows the tail at the bottom, so rows
 * are reversed into oldest-first here. Sequences are synthetic and ascending:
 * container lines carry no per-command sequence, and the row key
 * (`seq:stream`) only has to be unique within one render.
 */
export function containerLogEventsToTranscriptLines(
  events: readonly ContainerLogEventRecord[],
): LogTranscriptLine[] {
  const lines: LogTranscriptLine[] = []
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (!event) continue
    lines.push({
      seq: events.length - index,
      timestamp: event.timestamp,
      stream: event.stream === 'stderr' ? 'stderr' : 'stdout',
      // Phases belong to command transcripts; container output has none.
      phase: null,
      message: stripAnsi(event.message),
    })
  }
  return lines
}

/**
 * Whether the page came back at the scan ceiling — the window held at least a
 * full page, so what is on screen is the newest slice of it, not all of it.
 */
export function isContainerLogPageAtCeiling(
  eventCount: number,
  hasMore: boolean,
): boolean {
  return hasMore && eventCount >= CONTAINER_LOG_PAGE_LIMIT
}
