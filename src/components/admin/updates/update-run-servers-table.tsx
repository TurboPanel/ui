import { Pressable, StyleSheet, Text } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  MonoText,
  TextLink,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type {
  UpgradeHistoryEntry,
  UpgradeRunServerComponent,
  UpgradeRunServerRow,
  UpgradeRunServerSort,
  UpgradeRunUnit,
} from '@/lib/instance-api'
import { colors, spacing, webPointer } from '@/lib/theme'
import { stepMessageText, upgradeChannelTitle, upgradeStepErrorLabel } from '@/lib/upgrade-display'
import {
  componentChangeText,
  durationMsText,
  EMPTY_CELL,
  heartbeatText,
  shortId,
  upgradeServerOutcomeBadge,
  upgradeStartedByLabel,
  upgradeTriggerLabel,
  upgradeUnitLabel,
} from '@/lib/upgrade-history-display'
import type { SortDir } from '@/lib/upgrade-history-params'

/** Column key → the sort the control plane accepts for it. */
const SORTABLE: Readonly<Record<string, UpgradeRunServerSort>> = {
  organization: 'organization',
  server: 'server',
  status: 'status',
  started: 'started',
  finished: 'finished',
  duration: 'duration',
  attempts: 'attempts',
}

const LEAD_COLUMNS: readonly DataTableColumn[] = [
  { key: 'organization', header: 'Organization', flex: 1.2, minWidth: 170, gap: 2 },
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 170, gap: 2 },
  { key: 'datacenter', header: 'Datacenter', width: 130 },
  { key: 'from', header: 'From', width: 130 },
  { key: 'to', header: 'To', width: 130 },
  { key: 'status', header: 'Status', width: 160 },
  { key: 'started', header: 'Started', width: 170 },
  { key: 'finished', header: 'Finished', width: 170 },
  { key: 'duration', header: 'Duration', width: 90 },
  { key: 'error', header: 'Reason', flex: 1.4, minWidth: 220 },
]

const TAIL_COLUMNS: readonly DataTableColumn[] = [
  { key: 'trigger', header: 'Trigger', width: 140 },
  { key: 'startedBy', header: 'Started By', width: 180 },
  { key: 'channel', header: 'Channel', width: 90 },
  { key: 'attempts', header: 'Attempts', width: 90, align: 'end' },
  { key: 'heartbeat', header: 'Last Heartbeat', width: 200 },
  { key: 'links', header: 'Links', width: 130, gap: 2 },
]

const UNIT_COLUMN_WIDTH = 210

function unitColumn(unit: UpgradeRunUnit): DataTableColumn {
  return {
    key: `unit:${unit}`,
    header: upgradeUnitLabel(unit),
    width: UNIT_COLUMN_WIDTH,
    gap: 4,
  }
}

/** The run's columns: the fixed ones plus one per component the run updated. */
export function runServerColumns(units: readonly UpgradeRunUnit[]): DataTableColumn[] {
  return [...LEAD_COLUMNS, ...units.map(unitColumn), ...TAIL_COLUMNS]
}

function tableMinWidth(columns: readonly DataTableColumn[]): number {
  return columns.reduce((sum, column) => sum + (column.width ?? column.minWidth ?? 120) + 8, 16)
}

function timeText(iso: string | null | undefined): string {
  return formatLocalDateTime(iso ?? null, { includeSeconds: false })
}

function rowReason(row: UpgradeRunServerRow): string {
  return stepMessageText(row) ?? upgradeStepErrorLabel(row.errorCode) ?? EMPTY_CELL
}

function sortArrow(dir: SortDir): string {
  return dir === 'asc' ? ' ↑' : ' ↓'
}

/** "Sort by Duration", plus which way it is sorted now when this is the active column. */
export function sortHeaderLabel(header: string, active: boolean, dir: SortDir): string {
  if (!active) return `Sort by ${header}`
  return `Sort by ${header}, sorted ${dir === 'asc' ? 'ascending' : 'descending'}`
}

function SortableHeader({
  column,
  sort,
  dir,
  onSort,
}: Readonly<{
  column: DataTableColumn
  sort: UpgradeRunServerSort
  dir: SortDir
  onSort: (sort: UpgradeRunServerSort) => void
}>) {
  const key = SORTABLE[column.key]
  const active = key === sort
  const arrow = active ? sortArrow(dir) : ''
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sortHeaderLabel(column.header, active, dir)}
      accessibilityState={{ selected: active }}
      onPress={() => onSort(key)}
      style={webPointer}
    >
      <Text style={[styles.headerText, active && styles.headerActive]} numberOfLines={1}>
        {column.header}
        {arrow}
      </Text>
    </Pressable>
  )
}

function NamedCell({ name, id }: Readonly<{ name: string | null; id: string | null }>) {
  return (
    <>
      <Text style={styles.cell} numberOfLines={1}>
        {name?.trim() || EMPTY_CELL}
      </Text>
      <MonoText style={styles.id}>{shortId(id)}</MonoText>
    </>
  )
}

function ComponentCell({
  component,
}: Readonly<{ component: UpgradeRunServerComponent | undefined }>) {
  if (!component) return <Text style={panelStyles.muted}>Not part of this update</Text>
  return (
    <>
      <Badge {...upgradeServerOutcomeBadge(component.outcome)} />
      <Text style={styles.cell} numberOfLines={2}>
        {componentChangeText(component)}
      </Text>
    </>
  )
}

export type RunServerLinks = Readonly<{
  onOpenLog: (row: UpgradeRunServerRow) => void
  /** Null when the row's server has no organization page. */
  serverPageFor: (row: UpgradeRunServerRow) => (() => void) | null
}>

function RunServerRowView({
  row,
  run,
  units,
  columns,
  index,
  last,
  links,
}: Readonly<{
  row: UpgradeRunServerRow
  run: UpgradeHistoryEntry
  units: readonly UpgradeRunUnit[]
  columns: readonly DataTableColumn[]
  index: number
  last: boolean
  links: RunServerLinks
}>) {
  const col = (key: string) => columns.find((column) => column.key === key) ?? columns[0]
  const openServer = links.serverPageFor(row)
  return (
    <DataTableRow alt={index % 2 === 1} last={last}>
      <DataTableCell column={col('organization')}>
        <NamedCell name={row.organizationName} id={row.organizationId} />
      </DataTableCell>
      <DataTableCell column={col('server')}>
        <NamedCell name={row.serverName ?? row.hostname} id={row.serverId} />
      </DataTableCell>
      <DataTableCell column={col('datacenter')}>
        <Text style={styles.cell}>{row.datacenterName?.trim() || EMPTY_CELL}</Text>
      </DataTableCell>
      <DataTableCell column={col('from')}>
        <Text style={styles.cell}>{row.fromVersion ?? shortId(row.fromCommit)}</Text>
      </DataTableCell>
      <DataTableCell column={col('to')}>
        <Text style={styles.cell}>{row.toVersion ?? shortId(row.toCommit)}</Text>
      </DataTableCell>
      <DataTableCell column={col('status')}>
        <Badge {...upgradeServerOutcomeBadge(row.status)} />
      </DataTableCell>
      <DataTableCell column={col('started')}>
        <Text style={styles.cell}>{timeText(row.startedAt)}</Text>
      </DataTableCell>
      <DataTableCell column={col('finished')}>
        <Text style={styles.cell}>{timeText(row.finishedAt)}</Text>
      </DataTableCell>
      <DataTableCell column={col('duration')}>
        <Text style={styles.cell}>{durationMsText(row.durationMs)}</Text>
      </DataTableCell>
      <DataTableCell column={col('error')}>
        <Text style={panelStyles.muted} numberOfLines={2}>
          {rowReason(row)}
        </Text>
      </DataTableCell>
      {units.map((unit) => (
        <DataTableCell key={unit} column={col(`unit:${unit}`)}>
          <ComponentCell component={row.components[unit]} />
        </DataTableCell>
      ))}
      <DataTableCell column={col('trigger')}>
        <Text style={styles.cell}>{upgradeTriggerLabel(run.source)}</Text>
      </DataTableCell>
      <DataTableCell column={col('startedBy')}>
        <Text style={styles.cell} numberOfLines={1}>
          {upgradeStartedByLabel(run)}
        </Text>
      </DataTableCell>
      <DataTableCell column={col('channel')}>
        <Text style={styles.cell}>{upgradeChannelTitle(run.channel)}</Text>
      </DataTableCell>
      <DataTableCell column={col('attempts')}>
        <Text style={styles.cell}>{row.attempts}</Text>
      </DataTableCell>
      <DataTableCell column={col('heartbeat')}>
        <Text style={styles.cell} numberOfLines={2}>
          {heartbeatText(row, timeText)}
        </Text>
      </DataTableCell>
      <DataTableCell column={col('links')}>
        {openServer ? <TextLink label="Server page" size="sm" onPress={openServer} /> : null}
        <TextLink label="Update log" size="sm" onPress={() => links.onOpenLog(row)} />
      </DataTableCell>
    </DataTableRow>
  )
}

/**
 * One row per server in an update run, with a column per component it
 * updated. Sorting and paging happen on the control plane: the headings of
 * sortable columns ask for a new page instead of reordering this one.
 */
export function UpdateRunServersTable({
  run,
  units,
  rows,
  sort,
  dir,
  onSort,
  links,
  loading,
}: Readonly<{
  run: UpgradeHistoryEntry
  units: readonly UpgradeRunUnit[]
  rows: readonly UpgradeRunServerRow[]
  sort: UpgradeRunServerSort
  dir: SortDir
  onSort: (sort: UpgradeRunServerSort) => void
  links: RunServerLinks
  loading: boolean
}>) {
  const columns = runServerColumns(units)
  return (
    <DataTable
      columns={columns}
      minWidth={tableMinWidth(columns)}
      renderHeaderCell={(column) =>
        SORTABLE[column.key] ? (
          <SortableHeader column={column} sort={sort} dir={dir} onSort={onSort} />
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <DataTableEmpty>
          {loading ? 'Loading servers…' : 'No servers match these filters.'}
        </DataTableEmpty>
      ) : (
        rows.map((row, index) => (
          <RunServerRowView
            key={row.serverId}
            row={row}
            run={run}
            units={units}
            columns={columns}
            index={index}
            last={index === rows.length - 1}
            links={links}
          />
        ))
      )}
    </DataTable>
  )
}

const styles = StyleSheet.create({
  cell: {
    color: colors.text,
  },
  id: {
    color: colors.textMuted,
    fontSize: 12,
  },
  headerText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingVertical: spacing.xs,
  },
  headerActive: {
    color: colors.text,
  },
})
