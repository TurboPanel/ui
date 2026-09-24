import { StyleSheet, Text } from 'react-native'
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
import type { UpgradeStepRow } from '@/lib/instance-api'
import { mapStepStatusToPipeline } from '@/lib/upgrade-display'
import { colors } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 140 },
  { key: 'status', header: 'Status', width: 120 },
  { key: 'version', header: 'Version', flex: 1, minWidth: 100 },
  { key: 'step', header: 'Step', width: 120 },
  { key: 'error', header: 'Error', flex: 1.2, minWidth: 160 },
  { key: 'action', header: '', width: 88 },
]

function stepLabel(step: UpgradeStepRow): string {
  const pipeline = mapStepStatusToPipeline(step.status)
  return pipeline.charAt(0).toUpperCase() + pipeline.slice(1)
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
  servers: readonly UpgradeStepRow[]
  total: number
  offset: number
  pageSize: number
  onOffsetChange: (offset: number) => void
  onRetry: (stepId: string) => void
  retryingId: string | null
}>) {
  const page = pageSize > 0 ? Math.floor(offset / pageSize) : 0
  const pageCount = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))

  return (
    <DataTable columns={COLUMNS} minWidth={720}>
      {servers.length === 0 ? (
        <DataTableEmpty>No fleet servers in this upgrade yet.</DataTableEmpty>
      ) : (
        servers.map((row, index) => (
          <DataTableRow key={row.id} last={index === servers.length - 1}>
            <DataTableCell column={COLUMNS[0]}>
              <Text style={styles.cell}>
                {row.serverName?.trim() || row.hostname?.trim() || row.serverId.slice(0, 8)}
              </Text>
            </DataTableCell>
            <DataTableCell column={COLUMNS[1]}>
              <Badge tone="muted" label={row.status.replaceAll('_', ' ')} />
            </DataTableCell>
            <DataTableCell column={COLUMNS[2]}>
              <Text style={styles.cell}>{row.toVersion ?? row.toCommit?.slice(0, 12) ?? '—'}</Text>
            </DataTableCell>
            <DataTableCell column={COLUMNS[3]}>
              <Text style={styles.cell}>{stepLabel(row)}</Text>
            </DataTableCell>
            <DataTableCell column={COLUMNS[4]}>
              <Text style={panelStyles.muted} numberOfLines={2}>
                {row.errorMessage ?? '—'}
              </Text>
            </DataTableCell>
            <DataTableCell column={COLUMNS[5]}>
              {row.status === 'needs_attention' || row.status === 'failed' ? (
                <Button
                  label="Retry"
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
          <DataTableCell column={COLUMNS[0]}>
            <Text style={panelStyles.muted}>
              Page {page + 1} of {pageCount}
            </Text>
          </DataTableCell>
          <DataTableCell column={COLUMNS[5]}>
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
