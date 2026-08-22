import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  fetchContainerLogs,
  fetchOrgContainerLogSettings,
  saveOrgContainerLogSettings,
  type ContainerLogEventRecord,
  type ContainerLogPageResponse,
  type ContainerLogQueryFilter,
  type OrgContainerLogSettings,
} from '@/lib/instance-api'
import {
  resolveContainerLogTimeWindow,
  toContainerLogLiveQueryKey,
  toContainerLogQueryKey,
  withContainerLogTimeWindow,
  type ContainerLogRangeId,
} from '@/lib/container-log-query'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Live-tail cadence. Slower than the 1 s command-transcript poll on purpose:
 * this is a fleet-wide columnar scan, not a cursor read of one spooled file.
 */
export const CONTAINER_LOG_LIVE_POLL_MS = 5000

/**
 * Whether the last read could see container output at all.
 *
 * `disabled` and `unavailable` are *local* explorer state, exactly like the
 * transcript viewer's `forbidden`. Both arrive as **503**, which React Query
 * would otherwise retry forever, and neither is a session-level failure worth
 * routing through the global recovery path.
 */
export type ContainerLogAvailability = 'ok' | 'disabled' | 'unavailable'

/**
 * Classify a failed container-log read.
 *
 * The control plane answers 503 with a code rather than an empty page so that
 * "you never turned this on" and "your containers printed nothing" cannot look
 * alike. `apiFetch` keeps that code in the error message. Anything else returns
 * `null` so the query keeps its normal retry/error behaviour.
 */
export function classifyContainerLogFailure(
  error: unknown,
): Exclude<ContainerLogAvailability, 'ok'> | null {
  if (!(error instanceof Error)) return null
  if (error.message.includes('container_logs_disabled')) return 'disabled'
  if (error.message.includes('container_logs_unavailable')) return 'unavailable'
  return null
}

/** One page plus how the feature answered — see {@link ContainerLogAvailability}. */
export type ContainerLogPageResult = ContainerLogPageResponse &
  Readonly<{ availability: ContainerLogAvailability }>

/** Organization retention switch. Manage-gated route — pass `enabled` accordingly. */
export function useContainerLogSettings(
  orgId: string,
  enabled: boolean,
): UseQueryResult<OrgContainerLogSettings> {
  return useQuery({
    queryKey: queryKeys.org(orgId).containerLogs.settings,
    queryFn: () => fetchOrgContainerLogSettings(orgId),
    enabled: enabled && orgId.length > 0,
  })
}

/**
 * Save the retention switch.
 *
 * Turning it off also invalidates every read: the next explorer query has to
 * come back as `disabled` rather than serving a cached page from a window the
 * organization no longer retains.
 */
export function useSaveContainerLogSettings(
  orgId: string,
  onFailure: (message: string) => void,
  fallbackMessage: string,
) {
  const queryClient = useQueryClient()
  const settingsKey = queryKeys.org(orgId).containerLogs.settings
  return useApiMutation({
    mutationFn: (patch: Readonly<{ containerLogsEnabled: boolean | null }>) =>
      saveOrgContainerLogSettings(orgId, patch),
    onSuccess: (data) => {
      queryClient.setQueryData<OrgContainerLogSettings>(settingsKey, {
        containerLogsEnabled: data.containerLogsEnabled,
        retentionDays: data.retentionDays,
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).containerLogs.all,
      })
    },
    onError: (err) =>
      onFailure(err instanceof Error ? err.message : fallbackMessage),
  })
}

export type ContainerLogsQueryOptions = Readonly<{
  enabled?: boolean
  /**
   * Live tail. React Query owns the cadence (`refetchInterval`); the window is
   * re-resolved inside the query function on every fetch.
   */
  live?: boolean
  /** Range the live window is re-resolved from. Required when `live`. */
  liveRangeId?: ContainerLogRangeId
  /** Injectable clock and cadence (tests). */
  now?: () => number
  pollMs?: number
}>

/**
 * Poll cadence for a live tail, as React Query's `refetchInterval` callback
 * shape: a number keeps polling, `false` stops.
 *
 * Stops on `disabled` / `unavailable`. Both are 503s the query function folded
 * into a successful empty page, so nothing else would ever stop the timer —
 * and re-asking a feature that is switched off, every few seconds, forever, is
 * a fleet-wide columnar scan nobody asked for.
 */
export function containerLogLivePollInterval(
  pages: readonly ContainerLogPageResult[] | undefined,
  pollMs: number = CONTAINER_LOG_LIVE_POLL_MS,
): number | false {
  return containerLogAvailability(pages) === 'ok' ? pollMs : false
}

/**
 * Cursor-paginated container-log read for one composed filter.
 *
 * The cache key is the filter **minus its cursor**, so pages of one window
 * accumulate in a single entry and changing any predicate starts a fresh one.
 *
 * A 503 never escapes the query function: it is folded into `availability` on
 * an empty page, which both keeps it away from the app-wide 403/error handling
 * and stops React Query from retrying a feature that is simply switched off.
 *
 * **Live mode** is a query mode, not a component timer. React Query drives the
 * cadence with `refetchInterval` and each refetch re-resolves `[from, to)` from
 * `liveRangeId` — a pinned `to` bound could never grow to include a line
 * written after it, so re-reading the *same* window would show nothing new. The
 * key drops the absolute bounds for the same reason (see
 * `toContainerLogLiveQueryKey`), the cache is capped at the newest page, and
 * polling is focus-aware: it never runs in the background, and a refocus
 * refetches immediately instead of waiting out the interval.
 */
export function useContainerLogsQuery(
  orgId: string,
  filter: ContainerLogQueryFilter,
  options?: ContainerLogsQueryOptions,
) {
  const liveRangeId = options?.liveRangeId
  const live = (options?.live ?? false) && liveRangeId !== undefined
  const now = options?.now ?? Date.now
  const pollMs = options?.pollMs ?? CONTAINER_LOG_LIVE_POLL_MS
  return useInfiniteQuery({
    queryKey: queryKeys.org(orgId).containerLogs.query(
      live && liveRangeId
        ? toContainerLogLiveQueryKey(filter, liveRangeId)
        : toContainerLogQueryKey(filter),
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ContainerLogPageResult> => {
      // Re-resolved per fetch in live mode: this is what makes a tail a tail.
      const windowed =
        live && liveRangeId
          ? withContainerLogTimeWindow(
              filter,
              resolveContainerLogTimeWindow(liveRangeId, now()),
            )
          : filter
      try {
        const page = await fetchContainerLogs(orgId, {
          ...windowed,
          // A live tail is always the newest page; a cursor would pin it to a
          // window that has already moved on.
          ...(pageParam && !live ? { cursor: pageParam } : {}),
        })
        return { ...page, availability: 'ok' }
      } catch (err) {
        const availability = classifyContainerLogFailure(err)
        if (!availability) throw err
        return { events: [], nextCursor: null, availability }
      }
    },
    getNextPageParam: (last: ContainerLogPageResult) =>
      live ? undefined : (last.nextCursor ?? undefined),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: live
      ? (query) => containerLogLivePollInterval(query.state.data?.pages, pollMs)
      : false,
    // A backgrounded app must not keep a fleet-wide scan running on a timer.
    refetchIntervalInBackground: false,
    // Only while tailing: outside live mode a window is pinned, so refetching
    // on focus would re-read bytes the operator already paid for.
    refetchOnWindowFocus: live,
    // A live tail keeps only the newest page; a fresh window supersedes the
    // older ones anyway, and holding them would refetch history every tick.
    ...(live ? { maxPages: 1 } : {}),
    // Windows are re-resolved rather than re-read, so cached pages of a stale
    // window are dead weight.
    gcTime: live ? 0 : 60_000,
  })
}

/** Flatten loaded pages into one newest-first event list. */
export function flattenContainerLogPages(
  pages: readonly ContainerLogPageResult[] | undefined,
): ContainerLogEventRecord[] {
  if (!pages) return []
  return pages.flatMap((page) => page.events)
}

/** Availability is a property of the feature, so the first page decides it. */
export function containerLogAvailability(
  pages: readonly ContainerLogPageResult[] | undefined,
): ContainerLogAvailability {
  return pages?.[0]?.availability ?? 'ok'
}
