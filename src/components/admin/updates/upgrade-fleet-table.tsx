import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { HistoryPager } from '@/components/admin/updates/history-pager'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeServersPage } from '@/lib/instance-api'
import {
  fleetComponentLabel,
  fleetStatusBadge,
  installedBuildLabel,
  stepMessageText,
  upgradeServerLabel,
  upgradeStepOutcome,
} from '@/lib/upgrade-display'
import { colors, spacing } from '@/lib/theme'

const ALL_COLUMNS: readonly DataTableColumn[] = [
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 140 },
  { key: 'component', header: 'Component', width: 110 },
  { key: 'status', header: 'Status', width: 120 },
  { key: 'installed', header: 'Installed', flex: 1.2, minWidth: 130 },
  { key: 'target', header: 'Target', flex: 1, minWidth: 110 },
  { key: 'step', header: 'Step', width: 120 },
  { key: 'error', header: 'Error', flex: 1.2, minWidth: 160 },
]

/** Below this width the Component column folds into a prefix on the server name. */
const NARROW_WIDTH = 720

type FleetRow = UpgradeServersPage['servers'][number]

function stepLabel(step: FleetRow): string {
  return upgradeStepOutcome(step).label
}

/**
 * What the server runs now: its exact build (`0.1.4-canary.425 · ea1d63a`) when
 * it is the target build, else its version and commit. The Target column is the
 * build this update is moving it to, so a server that is already there reads
 * the same in both.
 */
function installedText(row: FleetRow): string {
  if (!row.installedVersion && !row.installedCommit) return 'Not reported'
  return installedBuildLabel(
    { version: row.installedVersion, commit: row.installedCommit },
    { commit: row.toCommit ?? '', version: row.toVersion ?? '' }
  )
}

export function UpgradeFleetTable({
  servers,
  total,
  offset,
  pageSize,
  onOffsetChange,
}: Readonly<{
  servers: readonly FleetRow[]
  total: number
  offset: number
  pageSize: number
  onOffsetChange: (offset: number) => void
}>) {
  const narrow = useWindowDimensions().width < NARROW_WIDTH
  const columns = narrow ? ALL_COLUMNS.filter((column) => column.key !== 'component') : ALL_COLUMNS
  const col = (key: string) => columns.find((column) => column.key === key) ?? columns[0]

  return (
    <View style={styles.root}>
      <DataTable columns={columns} minWidth={narrow ? 650 : 860}>
        {servers.length === 0 ? (
          <DataTableEmpty>No servers in this update yet.</DataTableEmpty>
        ) : (
          servers.map((row, index) => (
            <DataTableRow key={row.id} last={index === servers.length - 1}>
              <DataTableCell column={col('server')}>
                <Text style={styles.cell}>
                  {narrow ? `${fleetComponentLabel(row)}: ` : ''}
                  {upgradeServerLabel(row).primary}
                </Text>
              </DataTableCell>
              {narrow ? null : (
                <DataTableCell column={col('component')}>
                  <Text style={styles.cell}>{fleetComponentLabel(row)}</Text>
                </DataTableCell>
              )}
              <DataTableCell column={col('status')}>
                <Badge {...fleetStatusBadge(row.status, row.errorCode)} />
              </DataTableCell>
              <DataTableCell column={col('installed')}>
                <Text style={styles.cell}>{installedText(row)}</Text>
              </DataTableCell>
              <DataTableCell column={col('target')}>
                <Text style={styles.cell}>
                  {row.toVersion ?? row.toCommit?.slice(0, 12) ?? '—'}
                </Text>
              </DataTableCell>
              <DataTableCell column={col('step')}>
                <Text style={styles.cell}>{stepLabel(row)}</Text>
              </DataTableCell>
              <DataTableCell column={col('error')}>
                <Text style={panelStyles.muted} numberOfLines={2}>
                  {stepMessageText(row) ?? upgradeStepOutcome(row).detail ?? '—'}
                </Text>
              </DataTableCell>
            </DataTableRow>
          ))
        )}
      </DataTable>
      <HistoryPager
        offset={offset}
        pageSize={pageSize}
        shown={servers.length}
        total={total}
        onOffsetChange={onOffsetChange}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  cell: {
    color: colors.text,
  },
})
