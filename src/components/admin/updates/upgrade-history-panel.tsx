import { Text } from 'react-native'
import {
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  SectionPanel,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { UpgradeHistoryEntry } from '@/lib/instance-api'
import { colors } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'when', header: 'Started', flex: 1, minWidth: 140 },
  { key: 'who', header: 'Started by', flex: 1, minWidth: 120 },
  { key: 'result', header: 'Result', width: 140 },
]

export function UpgradeHistoryPanel({
  runs,
}: Readonly<{ runs: readonly UpgradeHistoryEntry[] }>) {
  return (
    <SectionPanel title="Update history">
      <DataTable columns={COLUMNS} minWidth={480}>
        {runs.length === 0 ? (
          <DataTableEmpty>No upgrade runs recorded yet.</DataTableEmpty>
        ) : (
          runs.map((run, index) => (
            <DataTableRow key={run.id} last={index === runs.length - 1}>
              <DataTableCell column={COLUMNS[0]}>
                <Text style={{ color: colors.text }}>
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                </Text>
              </DataTableCell>
              <DataTableCell column={COLUMNS[1]}>
                <Text style={panelStyles.muted}>{run.startedByEmail ?? 'Automatic'}</Text>
              </DataTableCell>
              <DataTableCell column={COLUMNS[2]}>
                <Text style={panelStyles.muted}>{run.resultLabel ?? run.status}</Text>
              </DataTableCell>
            </DataTableRow>
          ))
        )}
      </DataTable>
    </SectionPanel>
  )
}
