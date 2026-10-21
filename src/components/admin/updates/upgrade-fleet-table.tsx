import { StyleSheet, Text, useWindowDimensions } from 'react-native'
import {
  Badge,
  Button,
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
  upgradeStepOutcome,
} from '@/lib/upgrade-display'
import { plainStepFailureMessage } from '@/lib/user-error'
import { colors } from '@/lib/theme'

const ALL_COLUMNS: readonly DataTableColumn[] = [
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 140 },
  { key: 'component', header: 'Component', width: 110 },
  { key: 'status', header: 'Status', width: 120 },
  { key: 'installed', header: 'Installed', flex: 1.2, minWidth: 130 },
  { key: 'target', header: 'Target', flex: 1, minWidth: 110 },
  { key: 'step', header: 'Step', width: 120 },
  { key: 'error', header: 'Error', flex: 1.2, minWidth: 160 },
  { key: 'action', header: '', width: 110 },
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
  onRetry,
  retryingId,
}: Readonly<{
  servers: readonly FleetRow[]
  total: number
  offset: number
  pageSize: number
  onOffsetChange: (offset: number) => void
  onRetry: (stepId: string) => void
  retryingId: string | null
}>) {
  const narrow = useWindowDimensions().width < NARROW_WIDTH
  const columns = narrow ? ALL_COLUMNS.filter((column) => column.key !== 'component') : ALL_COLUMNS
  const col = (key: string) => columns.find((column) => column.key === key) ?? columns[0]
  const page = pageSize > 0 ? Math.floor(offset / pageSize) : 0
  const pageCount = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))

  return (
    <DataTable columns={columns} minWidth={narrow ? 760 : 970}>
      {servers.length === 0 ? (
        <DataTableEmpty>No servers in this update yet.</DataTableEmpty>
      ) : (
        servers.map((row, index) => (
          <DataTableRow key={row.id} last={index === servers.length - 1}>
            <DataTableCell column={col('server')}>
              <Text style={styles.cell}>
                {narrow ? `${fleetComponentLabel(row)}: ` : ''}
                {row.serverName?.trim() || row.hostname?.trim() || row.serverId.slice(0, 8)}
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
              <Text style={styles.cell}>{row.toVersion ?? row.toCommit?.slice(0, 12) ?? '—'}</Text>
            </DataTableCell>
            <DataTableCell column={col('step')}>
              <Text style={styles.cell}>{stepLabel(row)}</Text>
            </DataTableCell>
            <DataTableCell column={col('error')}>
              <Text style={panelStyles.muted} numberOfLines={2}>
                {plainStepFailureMessage(row.errorMessage) ?? upgradeStepOutcome(row).detail ?? '—'}
              </Text>
            </DataTableCell>
            <DataTableCell column={col('action')}>
              {row.status === 'needs_attention' || row.status === 'failed' ? (
                <Button
                  label="Retry step"
                  size="sm"
                  busy={retryingId === row.id}
                  onPress={() => {
                    onRetry(row.id)
                  }}
                />
              ) : null}
            </DataTableCell>
          </DataTableRow>
        ))
      )}
      {total > pageSize ? (
        <DataTableRow last>
          <DataTableCell column={col('server')}>
            <Text style={panelStyles.muted}>
              Page {page + 1} of {pageCount}
            </Text>
          </DataTableCell>
          <DataTableCell column={col('action')}>
            <Button
              label="Previous"
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onPress={() => {
                onOffsetChange(Math.max(0, offset - pageSize))
              }}
            />
            <Button
              label="Next"
              size="sm"
              variant="secondary"
              disabled={page + 1 >= pageCount}
              onPress={() => {
                onOffsetChange(offset + pageSize)
              }}
            />
          </DataTableCell>
        </DataTableRow>
      ) : null}
    </DataTable>
  )
}

const styles = StyleSheet.create({
  cell: {
    color: colors.text,
  },
})
