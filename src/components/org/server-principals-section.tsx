import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
} from '@/components/ui'
import type { DataTableColumn } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { ServerPrincipalRecord } from '@/lib/instance-api'
import {
  PRINCIPAL_SERVER_TAB_HINT,
  principalStateLabel,
  principalStateTone,
  principalUsageLines,
} from '@/lib/principal-words'
import { useServerPrincipals } from '@/lib/queries/servers'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const COLUMNS = [
  { key: 'name', header: 'System user', flex: 1.4, minWidth: 170, gap: 2 },
  { key: 'ids', header: 'User and group id', flex: 0.9, minWidth: 120 },
  { key: 'home', header: 'Home', flex: 1.4, minWidth: 170 },
  { key: 'usedBy', header: 'Also used by', flex: 1.4, minWidth: 180, gap: 2 },
  { key: 'state', header: 'State', flex: 0.9, minWidth: 110 },
] as const satisfies readonly DataTableColumn[]

const [C_NAME, C_IDS, C_HOME, C_USED_BY, C_STATE] = COLUMNS

const SOURCE_LABELS: Record<ServerPrincipalRecord['source'], string> = {
  compose: 'From a project file',
  manual: 'Added by hand',
  storage: 'Owns storage',
}

function idsLine(row: ServerPrincipalRecord): string {
  if (row.uid === null) return 'Not reported yet'
  return row.gid === null || row.gid === row.uid ? String(row.uid) : `${row.uid} / ${row.gid}`
}

/** Server detail > Principals: the principals placed on this server, as system users. */
export function ServerPrincipalsSection({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const query = useServerPrincipals(orgId, serverId)
  const rows = query.data?.principals ?? []

  return (
    <View style={styles.stack}>
      <SectionPanel title="Principals" hint={PRINCIPAL_SERVER_TAB_HINT}>
        {query.isLoading && !query.data ? <LoadingState label="Loading principals…" /> : null}
        {query.error && !query.data ? (
          <InlineNotice
            tone="warning"
            title="Could not load the principals on this server"
            body={userErrorMessage(query.error, 'Try again in a moment.')}
          />
        ) : null}
        {query.data ? (
          <DataTable columns={COLUMNS} minWidth={760} bordered>
            {rows.length === 0 ? (
              <DataTableEmpty>No principals are placed on this server.</DataTableEmpty>
            ) : null}
            {rows.map((row, index) => {
              const usage = principalUsageLines(row.usedBy)
              return (
                <DataTableRow
                  key={row.placementId}
                  alt={index % 2 === 1}
                  last={index === rows.length - 1}
                  accessibilityLabel={`Principal ${row.username} on this server`}
                >
                  <DataTableCell column={C_NAME}>
                    <MonoText>{row.appliedUsername}</MonoText>
                    {row.username !== row.appliedUsername ? (
                      <Text style={panelStyles.muted}>Named {row.username}</Text>
                    ) : null}
                    <Text style={panelStyles.muted}>{SOURCE_LABELS[row.source]}</Text>
                  </DataTableCell>
                  <DataTableCell column={C_IDS}>
                    <Text style={panelStyles.detailLine}>{idsLine(row)}</Text>
                  </DataTableCell>
                  <DataTableCell column={C_HOME}>
                    <MonoText>{row.home}</MonoText>
                  </DataTableCell>
                  <DataTableCell column={C_USED_BY}>
                    {usage.length === 0 ? (
                      <Text style={panelStyles.muted}>Only this server</Text>
                    ) : (
                      usage.map((line) => (
                        <Text key={line} style={panelStyles.detailLine}>
                          {line}
                        </Text>
                      ))
                    )}
                  </DataTableCell>
                  <DataTableCell column={C_STATE}>
                    <Badge label={principalStateLabel(row.state)} tone={principalStateTone(row.state)} />
                  </DataTableCell>
                </DataTableRow>
              )
            })}
          </DataTable>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
    gap: spacing.lg,
  },
})
