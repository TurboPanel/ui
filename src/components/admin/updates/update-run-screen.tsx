import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { HistoryPager } from '@/components/admin/updates/history-pager'
import {
  UpdateRunServersTable,
  type RunServerLinks,
} from '@/components/admin/updates/update-run-servers-table'
import { useBackLink } from '@/components/admin/updates/use-back-link'
import {
  Badge,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
  TextField,
  TextLink,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type {
  UpgradeHistoryEntry,
  UpgradeRunServerSort,
  UpgradeRunServersPage,
} from '@/lib/instance-api'
import { useUpgradeRunServers } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { upgradeChannelTitle, upgradeRunErrorLabel } from '@/lib/upgrade-display'
import {
  countCellText,
  durationText,
  historyLoadError,
  SERVER_OUTCOME_FILTERS,
  serverOutcomeFilterLabel,
  serverPageHref,
  serverUpdateLogHref,
  UPDATE_HISTORY_HREF,
  upgradeRunResultLabel,
  upgradeRunStatusBadge,
  upgradeRunTargetText,
  upgradeStartedByLabel,
  upgradeTriggerLabel,
} from '@/lib/upgrade-history-display'
import {
  DEFAULT_RUN_SERVER_VIEW,
  readRunServerParams,
  runServerParamsToUrl,
  withQuery,
  type RunServerView,
  type SortDir,
} from '@/lib/upgrade-history-params'
import { useDebouncedValue } from '@/lib/use-debounced-value'

export const UPDATE_RUN_PAGE_SIZE = 50

const SEARCH_DEBOUNCE_MS = 300

/** Sorts that read best newest or largest first when picked. */
const DESC_FIRST = new Set<UpgradeRunServerSort>(['started', 'finished', 'duration', 'attempts'])

/** The next sort: the same column flips direction, a new one starts in its natural order. */
export function nextSort(
  current: Readonly<{ sort: UpgradeRunServerSort; dir: SortDir }>,
  picked: UpgradeRunServerSort
): { sort: UpgradeRunServerSort; dir: SortDir } {
  if (current.sort === picked) return { sort: picked, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { sort: picked, dir: DESC_FIRST.has(picked) ? 'desc' : 'asc' }
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.fact}>
      <Text style={panelStyles.detailLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

function timeText(iso: string | null | undefined): string {
  return formatLocalDateTime(iso ?? null, { includeSeconds: false })
}

/** The server totals line of the run header; a pruned run says its per-server detail is gone. */
function serverTotalsText(run: UpgradeHistoryEntry): string {
  const summary = run.summary
  if (!summary) return '—'
  const updated = countCellText(summary.updated)
  const current = countCellText(summary.alreadyCurrent)
  return `${updated} updated · ${current} already up to date · ${summary.skipped} skipped · ${summary.failed} failed · ${summary.inProgress} in progress · ${summary.total} total`
}

/** The run summary header: what ran, who started it, and how it ended. */
export function UpdateRunSummary({ run }: Readonly<{ run: UpgradeHistoryEntry }>) {
  const runError = upgradeRunErrorLabel(run.error)
  return (
    <SectionPanel title="Update Run" hint={upgradeRunResultLabel(run)}>
      <View style={styles.statusRow}>
        <Badge {...upgradeRunStatusBadge(run.status)} />
        {runError ? <Text style={panelStyles.error}>{runError}</Text> : null}
      </View>
      <View style={styles.facts}>
        <Fact label="Trigger" value={upgradeTriggerLabel(run.source)} />
        <Fact label="Started by" value={upgradeStartedByLabel(run)} />
        <Fact label="Channel" value={upgradeChannelTitle(run.channel)} />
        <Fact label="Target" value={upgradeRunTargetText(run.target)} />
        <Fact label="Started" value={timeText(run.startedAt ?? run.createdAt)} />
        <Fact label="Finished" value={timeText(run.finishedAt)} />
        <Fact label="Duration" value={durationText(run.startedAt, run.finishedAt)} />
      </View>
      <Fact label="Servers" value={serverTotalsText(run)} />
      {run.summary?.detail === 'pruned' ? (
        <Text style={panelStyles.muted}>
          The per-server detail of this update was removed after the retention window. The totals
          above are kept.
        </Text>
      ) : null}
    </SectionPanel>
  )
}

function ServerFiltersBar({
  page,
  view,
  searchText,
  onSearchText,
  onChange,
}: Readonly<{
  page: UpgradeRunServersPage | undefined
  view: RunServerView
  searchText: string
  onSearchText: (text: string) => void
  onChange: (next: Partial<RunServerView>) => void
}>) {
  const organizations = (page?.organizations ?? []).map((org) => ({
    value: org.id,
    label: org.name?.trim() || org.id.slice(0, 8),
    detail: `${org.servers} servers`,
  }))
  return (
    <View style={styles.filters}>
      <SegmentedControl
        options={SERVER_OUTCOME_FILTERS.map((value) => ({
          value,
          label: serverOutcomeFilterLabel(value, page?.statusCounts),
        }))}
        value={view.status}
        accessibilityLabel="Filter servers by status"
        onChange={(status) => onChange({ status, offset: 0 })}
      />
      <View style={styles.filterRow}>
        <View style={styles.filterField}>
          <Select
            value={view.organizationId}
            options={organizations}
            noneLabel="All organizations"
            placeholder="All organizations"
            accessibilityLabel="Filter by organization"
            onChange={(organizationId) => onChange({ organizationId, offset: 0 })}
          />
        </View>
        <View style={styles.filterField}>
          <TextField
            label="Search"
            value={searchText}
            placeholder="Server or organization name or id"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onSearchText}
          />
        </View>
      </View>
    </View>
  )
}

/**
 * Update Run: one run's summary and a server-paged table of every server it
 * touched. Filters, sorting and paging all go to the control plane, so a run
 * over thousands of servers never loads more than one page. The view (status,
 * organization, search, sort, page) lives in the URL, so back, reload and a
 * shared link land on the same rows.
 */
export function UpdateRunScreen({ runId }: Readonly<{ runId: string }>) {
  const router = useRouter()
  const view = readRunServerParams(useLocalSearchParams())
  const [searchText, setSearchText] = useState(view.q)
  const [search] = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)
  const back = useBackLink({ href: UPDATE_HISTORY_HREF, label: 'Back to Update History' })
  const query = useUpgradeRunServers(runId, {
    offset: view.offset,
    limit: UPDATE_RUN_PAGE_SIZE,
    sort: view.sort,
    dir: view.dir,
    status: view.status,
    organizationId: view.organizationId,
    q: view.q,
  })
  const update = (next: Partial<RunServerView>) => {
    router.setParams(runServerParamsToUrl({ ...view, ...next }))
  }
  const currentQ = view.q
  useEffect(() => {
    const q = search.trim()
    if (q !== currentQ) router.setParams({ q: q || undefined, offset: undefined })
  }, [search, currentQ, router])
  // A filter the control plane refused (a hand-edited link) must not strand
  // the person on the error: this puts the view back to its defaults.
  const clearFilters = () => {
    setSearchText('')
    router.setParams(runServerParamsToUrl(DEFAULT_RUN_SERVER_VIEW))
  }
  const page = query.data
  const links: RunServerLinks = {
    onOpenLog: (row) =>
      router.push(
        withQuery(serverUpdateLogHref(runId, row.serverId), runServerParamsToUrl(view)) as Href
      ),
    serverPageFor: (row) => {
      const href = serverPageHref(row)
      return href ? () => router.push(href as Href) : null
    },
  }

  return (
    <View style={styles.root}>
      <TextLink label={back.label} size="sm" onPress={back.onPress} />
      {query.isLoading && !page ? <LoadingState label="Loading the update" /> : null}
      {query.isError && !page ? (
        <InlineNotice
          tone="warning"
          title={historyLoadError(query.error, 'This update could not be loaded')}
          actions={
            isHttpStatusError(query.error, 400) ? (
              <TextLink label="Clear filters" size="sm" onPress={clearFilters} />
            ) : undefined
          }
        />
      ) : null}
      {page ? (
        <>
          <UpdateRunSummary run={page.run} />
          <SectionPanel title="Servers" hint="One row per server. Sort by a column heading.">
            <ServerFiltersBar
              page={page}
              view={view}
              searchText={searchText}
              onSearchText={setSearchText}
              onChange={update}
            />
            <UpdateRunServersTable
              run={page.run}
              units={page.units}
              rows={page.servers}
              sort={view.sort}
              dir={view.dir}
              onSort={(picked) => update({ ...nextSort(view, picked), offset: 0 })}
              links={links}
              loading={query.isFetching}
            />
            <HistoryPager
              offset={view.offset}
              pageSize={UPDATE_RUN_PAGE_SIZE}
              shown={page.servers.length}
              total={page.total}
              onOffsetChange={(offset) => update({ offset })}
            />
          </SectionPanel>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  fact: {
    minWidth: 150,
    flexShrink: 1,
    gap: 2,
  },
  value: {
    color: colors.text,
  },
  filters: {
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  filterField: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
  },
})
