import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { PrincipalDefaultsSettingsSection } from '@/components/org/principal-defaults-settings-section'
import {
  Badge,
  ConfirmButton,
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
import type { OrgPrincipalRecord } from '@/lib/instance-api'
import {
  PRINCIPAL_DEFINITION,
  principalDeleteBlockedReason,
  principalFormLabels,
  principalStateLabel,
  principalStateTone,
  principalUsageLines,
} from '@/lib/principal-words'
import { useDeleteOrgPrincipal, useOrgPrincipals } from '@/lib/queries/org-principals'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const COLUMNS = [
  { key: 'name', header: 'Principal', flex: 1.4, minWidth: 180, gap: 2 },
  { key: 'servers', header: 'Servers', flex: 1.2, minWidth: 140, gap: 2 },
  { key: 'usedBy', header: 'Used by', flex: 1.6, minWidth: 200, gap: 2 },
  { key: 'state', header: 'State', flex: 0.9, minWidth: 110 },
  { key: 'action', header: '', flex: 1.2, minWidth: 150, align: 'end' },
] as const satisfies readonly DataTableColumn[]

const [C_NAME, C_SERVERS, C_USED_BY, C_STATE, C_ACTION] = COLUMNS

function usedByLines(row: OrgPrincipalRecord): string[] {
  const lines: string[] = []
  if (row.projectName) lines.push(`Project ${row.projectName}`)
  else if (row.projectId) lines.push('A project')
  else lines.push('No project')
  for (const login of row.logins) lines.push(`Database login ${login.appliedUsername}`)
  const usage = principalUsageLines({ ...row.usedBy, logins: 0 })
  return [...lines, ...usage]
}

function deletePrompt(row: OrgPrincipalRecord): string {
  if (row.servers.length === 0) return `Delete ${row.name}? Nothing uses it.`
  const where = row.servers.length === 1 ? 'its server' : 'its servers'
  return `Delete ${row.name} and remove its system user from ${where}? Nothing uses it.`
}

function PrincipalRow({
  row,
  last,
  alt,
  canManage,
  deleting,
  onDelete,
}: Readonly<{
  row: OrgPrincipalRecord
  last: boolean
  alt: boolean
  canManage: boolean
  deleting: boolean
  onDelete: (principalId: string) => void
}>) {
  const blocked = principalDeleteBlockedReason(row)
  let actionCell: ReactNode = null
  if (canManage && row.canDelete) {
    actionCell = (
      <ConfirmButton
        label="Delete"
        confirmLabel="Confirm delete"
        prompt={deletePrompt(row)}
        busy={deleting}
        disabled={deleting}
        onConfirm={() => onDelete(row.id)}
      />
    )
  } else if (blocked) {
    actionCell = <Text style={panelStyles.muted}>{blocked}</Text>
  }
  return (
    <DataTableRow last={last} alt={alt} accessibilityLabel={`Principal ${row.name}`}>
      <DataTableCell column={C_NAME}>
        <MonoText>{row.name}</MonoText>
        {row.appliedUsername !== row.name ? (
          <Text style={panelStyles.muted}>Linux name {row.appliedUsername}</Text>
        ) : null}
        <Text style={panelStyles.muted}>{principalFormLabels(row.forms)}</Text>
      </DataTableCell>
      <DataTableCell column={C_SERVERS}>
        {row.servers.length === 0 ? (
          <Text style={panelStyles.muted}>None</Text>
        ) : (
          row.servers.map((server) => (
            <Text key={server.serverId} style={panelStyles.detailLine}>
              {server.serverName ?? 'Unnamed server'}
              {server.state === 'present' ? '' : ` (${principalStateLabel(server.state).toLowerCase()})`}
            </Text>
          ))
        )}
      </DataTableCell>
      <DataTableCell column={C_USED_BY}>
        {usedByLines(row).map((line, lineIndex) => (
           
          <Text key={`${lineIndex}-${line}`} style={panelStyles.detailLine}>
            {line}
          </Text>
        ))}
      </DataTableCell>
      <DataTableCell column={C_STATE}>
        {row.orphaned ? (
          <Badge label="Left behind" tone="pending" />
        ) : (
          <Badge label={principalStateLabel(row.state)} tone={principalStateTone(row.state)} />
        )}
      </DataTableCell>
      <DataTableCell column={C_ACTION}>
        {actionCell}
      </DataTableCell>
    </DataTableRow>
  )
}

/**
 * Manage organization > Principals: every principal in the organization, one
 * name pool across system users and database logins. A principal a deleted
 * project left behind shows as "Left behind" and can be deleted here once
 * nothing uses it. The name scheme for new principals sits below the list.
 */
export function OrgPrincipalsTab({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const query = useOrgPrincipals(orgId, { enabled: canManage })
  const deleteMutation = useDeleteOrgPrincipal(orgId)
  const rows = query.data?.principals ?? []

  return (
    <View style={styles.tab}>
      <SectionPanel
        title="Principals"
        hint="Every account in this organization, named once across servers and databases"
      >
        <Text style={panelStyles.muted}>{PRINCIPAL_DEFINITION}</Text>
        {deleteMutation.actionError ? (
          <Text style={panelStyles.error}>{deleteMutation.actionError}</Text>
        ) : null}
        {canManage ? null : (
          <Text style={panelStyles.muted}>
            Only organization owners and managers can see the list of principals.
          </Text>
        )}
        {canManage && query.isLoading ? <LoadingState label="Loading principals…" /> : null}
        {query.error && !query.data ? (
          <InlineNotice
            tone="warning"
            title="Could not load principals"
            body={userErrorMessage(query.error, 'Try again in a moment.')}
          />
        ) : null}
        {query.data ? (
          <DataTable columns={COLUMNS} minWidth={720} bordered>
            {rows.length === 0 ? (
              <DataTableEmpty>
                No principals yet. They appear when a project creates a system user or a database
                login.
              </DataTableEmpty>
            ) : null}
            {rows.map((row, index) => (
              <PrincipalRow
                key={row.id}
                row={row}
                alt={index % 2 === 1}
                last={index === rows.length - 1}
                canManage={canManage}
                deleting={deleteMutation.isPending && deleteMutation.variables === row.id}
                onDelete={(principalId) => deleteMutation.mutate(principalId)}
              />
            ))}
          </DataTable>
        ) : null}
      </SectionPanel>
      <PrincipalDefaultsSettingsSection orgId={orgId} />
    </View>
  )
}

const styles = StyleSheet.create({
  tab: {
    width: '100%',
    gap: spacing.lg,
  },
})
