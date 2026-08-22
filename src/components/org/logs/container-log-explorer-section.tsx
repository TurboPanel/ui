import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { ContainerLogFilterBar } from '@/components/org/logs/container-log-filter-bar'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { Button, EmptyState, LoadingState } from '@/components/ui'
import {
  CONTAINER_LOG_PAGE_LIMIT,
  DEFAULT_CONTAINER_LOG_FILTER_DRAFT,
  containerLogEventsToTranscriptLines,
  isContainerLogPageAtCeiling,
  resolveContainerLogTimeWindow,
  toContainerLogQueryFilter,
  type ContainerLogFilterDraft,
} from '@/lib/container-log-query'
import { containerLogsSettingsHref } from '@/lib/org-navigation'
import {
  CONTAINER_LOG_LIVE_POLL_MS,
  containerLogAvailability,
  flattenContainerLogPages,
  useContainerLogsQuery,
} from '@/lib/queries/container-logs'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Organization-wide container-output explorer.
 *
 * One filter bar, one shared transcript viewer, one cursor-paginated read. The
 * viewer is `log-transcript-view.tsx` unchanged — container output and command
 * transcripts render identically on purpose, so there is exactly one log
 * surface language in the console.
 */
export function ContainerLogExplorerSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const [draft, setDraft] = useState<ContainerLogFilterDraft>(
    DEFAULT_CONTAINER_LOG_FILTER_DRAFT,
  )
  const [live, setLive] = useState(false)
  // The window is pinned rather than recomputed each render: a `to` bound that
  // drifted every render would restart pagination continuously.
  const [nowMs, setNowMs] = useState(() => Date.now())

  const window = useMemo(
    () => resolveContainerLogTimeWindow(draft.rangeId, nowMs),
    [draft.rangeId, nowMs],
  )
  const filter = useMemo(
    () => toContainerLogQueryFilter(draft, window),
    [draft, window],
  )

  // Cadence and window movement both live in the hook: React Query schedules
  // the refetch and re-resolves `[from, to)` per fetch. This component only
  // toggles the flag and renders what comes back.
  const query = useContainerLogsQuery(orgId, filter, {
    live,
    liveRangeId: draft.rangeId,
  })

  // React Query's `refetchIntervalInBackground: false` already stops the timer
  // when the *browser tab* is hidden; this covers a native app leaving the
  // foreground, and additionally turns live mode off for good — it does not
  // auto-resume, the operator turns it back on deliberately.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') setLive(false)
    })
    return () => subscription.remove()
  }, [])

  const refresh = useCallback(() => setNowMs(Date.now()), [])

  const onFilterChange = useCallback((next: ContainerLogFilterDraft) => {
    setDraft(next)
    setNowMs(Date.now())
  }, [])

  const availability = containerLogAvailability(query.data?.pages)
  const events = useMemo(
    () => flattenContainerLogPages(query.data?.pages),
    [query.data?.pages],
  )
  const lines = useMemo(
    () => containerLogEventsToTranscriptLines(events),
    [events],
  )
  const atCeiling = isContainerLogPageAtCeiling(
    query.data?.pages?.[0]?.events.length ?? 0,
    Boolean(query.hasNextPage),
  )

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageEyebrow}>Organization</Text>
      <Text style={orgPanelStyles.pageTitle}>Logs</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Everything your containers printed, across every server in this
        organization. Narrow with the filters below — they are the whole query
        language, and each one is a predicate the store can answer directly.
      </Text>

      <SectionPanel title="Filters" hint="Server · environment · service · stream · text">
        <ContainerLogFilterBar
          orgId={orgId}
          draft={draft}
          window={window}
          disabled={live}
          onChange={onFilterChange}
        />
      </SectionPanel>

      <SectionPanel
        title="Container output"
        hint="Newest first · cursor-paginated"
        headerRight={
          <View style={styles.controls}>
            <Button
              label={live ? 'Live tail on' : 'Live tail'}
              variant={live ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => setLive((current) => !current)}
              accessibilityLabel={
                live ? 'Stop live tailing output' : 'Live tail output'
              }
            />
            <Button
              label="Refresh"
              size="sm"
              onPress={refresh}
              disabled={live || query.isFetching}
              accessibilityLabel="Re-read the current window"
            />
          </View>
        }
      >
        {live ? (
          <Text style={orgPanelStyles.muted}>
            Re-reading the newest {CONTAINER_LOG_LIVE_POLL_MS / 1000}s window.
            Filters are locked while tailing, and tailing stops when this app
            loses focus — it does not resume on its own.
          </Text>
        ) : null}

        <ContainerLogResults
          orgId={orgId}
          availability={availability}
          isPending={query.isPending}
          isError={query.isError}
          error={query.error}
          lineCount={lines.length}
          live={live}
          lines={lines}
          atCeiling={atCeiling}
        />

        {!live && query.hasNextPage ? (
          <Button
            label={query.isFetchingNextPage ? 'Loading…' : 'Load older'}
            size="sm"
            busy={query.isFetchingNextPage}
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
            accessibilityLabel="Load older container output"
          />
        ) : null}
      </SectionPanel>
    </View>
  )
}

/**
 * The state matrix. "Off for this organization", "the store is down", and "your
 * containers printed nothing in this window" are three different answers and
 * must never collapse into one empty state.
 *
 * The remediation link on the disabled state is gated by the same
 * `organization:manage` permission that guards `ContainerLogsSettingsSection`.
 * Offering a non-manager a link that dead-ends on a manager-only empty state is
 * worse than telling them plainly who can flip the switch.
 */
function ContainerLogResults({
  orgId,
  availability,
  isPending,
  isError,
  error,
  lineCount,
  live,
  lines,
  atCeiling,
}: Readonly<{
  orgId: string
  availability: 'ok' | 'disabled' | 'unavailable'
  isPending: boolean
  isError: boolean
  error: unknown
  lineCount: number
  live: boolean
  lines: ReturnType<typeof containerLogEventsToTranscriptLines>
  atCeiling: boolean
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')

  if (availability === 'disabled') {
    return (
      <EmptyState
        panel
        title="Container logs are off for this organization"
        hint={
          canManage
            ? 'Nothing is being retained, so there is nothing to search. Turn retention on in Logs → Settings.'
            : 'Nothing is being retained, so there is nothing to search. Ask an organization manager to turn retention on.'
        }
        action={
          canManage ? (
            <Link href={containerLogsSettingsHref(orgId)} style={styles.link}>
              Open log settings
            </Link>
          ) : undefined
        }
      />
    )
  }

  if (availability === 'unavailable') {
    return (
      <EmptyState
        panel
        title="Container log storage is unavailable"
        hint="Retention is on, but the log store did not answer. Recent output may still be buffered on the servers — try again shortly."
      />
    )
  }

  if (isError) {
    return (
      <Text style={orgPanelStyles.error}>
        {errorMessage(error, 'Failed to read container output')}
      </Text>
    )
  }

  if (isPending) {
    return <LoadingState label="Reading container output…" />
  }

  if (lineCount === 0) {
    return (
      <EmptyState
        panel
        title="No output in this window"
        hint="Retention is on and the store answered — these containers printed nothing matching these filters. Widen the time range or clear a filter."
      />
    )
  }

  return (
    <>
      {atCeiling ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            This window holds more than {CONTAINER_LOG_PAGE_LIMIT} lines — the
            newest are shown. Narrow the range or add a filter to see the rest
            in context, or load older pages below.
          </Text>
        </View>
      ) : null}
      <LogTranscriptView
        lines={lines}
        state={live ? 'streaming' : 'sealed'}
        downloadFileName="container-logs.log"
        maxHeight={480}
      />
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
})
