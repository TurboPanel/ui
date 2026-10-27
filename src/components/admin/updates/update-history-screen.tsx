import { StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { HistoryPager } from '@/components/admin/updates/history-pager'
import { useBackLink } from '@/components/admin/updates/use-back-link'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  SectionPanel,
  SegmentedControl,
  Select,
  TextLink,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { UpgradeHistoryEntry } from '@/lib/instance-api'
import { useUpgradeHistory } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import {
  countCellText,
  durationText,
  historyLoadError,
  RUN_STATUS_FILTERS,
  RUN_TRIGGER_FILTERS,
  updateRunHref,
  upgradeRunResultLabel,
  upgradeRunStatusBadge,
  upgradeRunTargetText,
  upgradeStartedByLabel,
  upgradeTriggerLabel,
  type RunStatusFilter,
} from '@/lib/upgrade-history-display'
import {
  historyParamsToUrl,
  readHistoryParams,
  type HistoryView,
} from '@/lib/upgrade-history-params'

export const UPDATE_HISTORY_PAGE_SIZE = 25

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'started', header: 'Started', flex: 1.2, minWidth: 150 },
  { key: 'trigger', header: 'Trigger', width: 140 },
  { key: 'target', header: 'Target', flex: 1, minWidth: 120 },
  { key: 'status', header: 'Status', flex: 1.4, minWidth: 180, gap: 4 },
  { key: 'updated', header: 'Updated', width: 76, align: 'end' },
  { key: 'failed', header: 'Failed', width: 64, align: 'end' },
  { key: 'skipped', header: 'Skipped', width: 72, align: 'end' },
  { key: 'total', header: 'Servers', width: 72, align: 'end' },
  { key: 'duration', header: 'Duration', width: 90 },
  { key: 'startedBy', header: 'Started By', flex: 1.2, minWidth: 160 },
]

/** An empty table: still loading, no runs at all, or none for the chosen filters. */
export function emptyHistoryText(
  loading: boolean,
  view: Readonly<Pick<HistoryView, 'status' | 'trigger'>>
): string {
  if (loading) return 'Loading updates…'
  const filtered = view.status !== 'any' || view.trigger !== ''
  return filtered ? 'No updates match these filters.' : 'No updates yet.'
}

const col = (key: string): DataTableColumn =>
  COLUMNS.find((column) => column.key === key) ?? COLUMNS[0]

/** When the run began: its start time, else when it was planned. */
function runStartedText(run: UpgradeHistoryEntry): string {
  return formatLocalDateTime(run.startedAt ?? run.createdAt ?? null, { includeSeconds: false })
}

function RunHistoryRow({
  run,
  index,
  last,
  onOpen,
}: Readonly<{ run: UpgradeHistoryEntry; index: number; last: boolean; onOpen: () => void }>) {
  const summary = run.summary
  const started = runStartedText(run)
  return (
    <DataTableRow
      onPress={onOpen}
      accessibilityLabel={`Open the update started ${started}`}
      alt={index % 2 === 1}
      last={last}
    >
      <DataTableCell column={col('started')}>
        <Text style={styles.cell}>{started}</Text>
      </DataTableCell>
      <DataTableCell column={col('trigger')}>
        <Text style={styles.cell}>{upgradeTriggerLabel(run.source)}</Text>
      </DataTableCell>
      <DataTableCell column={col('target')}>
        <Text style={styles.cell}>{upgradeRunTargetText(run.target, run.units)}</Text>
      </DataTableCell>
      <DataTableCell column={col('status')}>
        <Badge {...upgradeRunStatusBadge(run.status)} />
        <Text style={panelStyles.muted} numberOfLines={2}>
          {upgradeRunResultLabel(run)}
        </Text>
      </DataTableCell>
      <DataTableCell column={col('updated')}>
        <Text style={styles.cell}>{countCellText(summary?.updated)}</Text>
      </DataTableCell>
      <DataTableCell column={col('failed')}>
        <Text style={styles.cell}>{countCellText(summary?.failed)}</Text>
      </DataTableCell>
      <DataTableCell column={col('skipped')}>
        <Text style={styles.cell}>{countCellText(summary?.skipped)}</Text>
      </DataTableCell>
      <DataTableCell column={col('total')}>
        <Text style={styles.cell}>{countCellText(summary?.total)}</Text>
      </DataTableCell>
      <DataTableCell column={col('duration')}>
        <Text style={styles.cell}>{durationText(run.startedAt, run.finishedAt)}</Text>
      </DataTableCell>
      <DataTableCell column={col('startedBy')}>
        <Text style={styles.cell} numberOfLines={1}>
          {upgradeStartedByLabel(run)}
        </Text>
      </DataTableCell>
    </DataTableRow>
  )
}

/**
 * Update History: one row per update run, newest first, paged on the server.
 * Opening a row goes to that run's own screen.
 */
export function UpdateHistoryScreen() {
  const router = useRouter()
  const view = readHistoryParams(useLocalSearchParams())
  const back = useBackLink({ href: '/admin/updates', label: 'Back to Updates' })
  const update = (next: Partial<HistoryView>) => {
    router.setParams(historyParamsToUrl({ ...view, ...next }))
  }
  const history = useUpgradeHistory({
    offset: view.offset,
    limit: UPDATE_HISTORY_PAGE_SIZE,
    status: view.status,
    trigger: view.trigger,
  })
  const runs = history.data?.runs ?? []
  const total = history.data?.total ?? 0
  const failedEmpty = history.isError && runs.length === 0

  return (
    <View style={styles.root}>
      <TextLink label={back.label} size="sm" onPress={back.onPress} />
      <SectionPanel
        title="Update History"
        hint="Every update run, newest first. Open one to see each server."
      >
        <View style={styles.filters}>
          <View style={styles.statusFilter}>
            <Select
              value={view.status}
              options={RUN_STATUS_FILTERS}
              placeholder="Status"
              accessibilityLabel="Filter by status"
              onChange={(next) => update({ status: (next ?? 'any') as RunStatusFilter, offset: 0 })}
            />
          </View>
          <SegmentedControl
            options={RUN_TRIGGER_FILTERS}
            value={view.trigger}
            accessibilityLabel="Filter by trigger"
            onChange={(trigger) => update({ trigger, offset: 0 })}
          />
        </View>
        {history.isError ? (
          <InlineNotice
            tone="warning"
            title={historyLoadError(history.error, 'Update History could not be loaded')}
          />
        ) : null}
        {failedEmpty ? null : (
          <DataTable columns={COLUMNS} minWidth={1180}>
            {runs.length === 0 ? (
              <DataTableEmpty>{emptyHistoryText(history.isLoading, view)}</DataTableEmpty>
            ) : (
              runs.map((run, index) => (
                <RunHistoryRow
                  key={run.id}
                  run={run}
                  index={index}
                  last={index === runs.length - 1}
                  onOpen={() => router.push(updateRunHref(run.id) as Href)}
                />
              ))
            )}
          </DataTable>
        )}
        <HistoryPager
          offset={view.offset}
          pageSize={UPDATE_HISTORY_PAGE_SIZE}
          shown={runs.length}
          total={total}
          onOffsetChange={(offset) => update({ offset })}
        />
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusFilter: {
    minWidth: 180,
  },
  cell: {
    color: colors.text,
  },
})
