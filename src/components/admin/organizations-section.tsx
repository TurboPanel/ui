import { useRouter, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { OrganizationDeleteButton } from '@/components/org/organization-delete-button'
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
import { formatShortDate, type AdminOrganizationRow } from '@/lib/instance-api'
import { getActiveOrganizationId, setActiveOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref, replaceOrganization } from '@/lib/org-navigation'
import { organizationDeleteGate } from '@/lib/organization-delete'
import { useAdminOrganizations } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const C_NAME: DataTableColumn = { key: 'name', header: 'Name', flex: 1.6, minWidth: 180 }
const C_OWNER: DataTableColumn = { key: 'owner', header: 'Owner', flex: 1.6, minWidth: 190 }
const C_MEMBERS: DataTableColumn = { key: 'members', header: 'Members', width: 84, align: 'end' }
const C_SERVERS: DataTableColumn = { key: 'servers', header: 'Servers', width: 84, align: 'end' }
const C_PROJECTS: DataTableColumn = {
  key: 'projects',
  header: 'Projects',
  width: 84,
  align: 'end',
}
const C_CREATED: DataTableColumn = { key: 'created', header: 'Created', flex: 1, minWidth: 110 }
const C_ACTIONS: DataTableColumn = { key: 'actions', header: '', flex: 1.4, minWidth: 190 }
const COLUMNS = [C_NAME, C_OWNER, C_MEMBERS, C_SERVERS, C_PROJECTS, C_CREATED, C_ACTIONS]

function OrganizationRow({
  row,
  last,
}: Readonly<{
  row: AdminOrganizationRow
  last: boolean
}>) {
  const router = useRouter()
  const gate = organizationDeleteGate(row)
  const owner = row.owner
  return (
    <DataTableRow last={last}>
      <DataTableCell column={C_NAME}>
        <Text style={styles.name}>{row.name}</Text>
        {row.isRoot ? (
          <View style={styles.badge}>
            <Badge label="Root" tone="info" />
          </View>
        ) : null}
      </DataTableCell>
      <DataTableCell column={C_OWNER}>
        {owner ? (
          <>
            <Text style={styles.cell}>{owner.name ?? owner.email ?? owner.id}</Text>
            {owner.name && owner.email ? <Text style={styles.sub}>{owner.email}</Text> : null}
          </>
        ) : (
          <Text style={styles.sub}>No owner</Text>
        )}
      </DataTableCell>
      <DataTableCell column={C_MEMBERS}>
        <Text style={styles.cell}>{row.memberCount}</Text>
      </DataTableCell>
      <DataTableCell column={C_SERVERS}>
        <Text style={styles.cell}>{row.serverCount}</Text>
      </DataTableCell>
      <DataTableCell column={C_PROJECTS}>
        <Text style={styles.cell}>{row.projectCount}</Text>
      </DataTableCell>
      <DataTableCell column={C_CREATED}>
        <Text style={styles.cell}>{formatShortDate(row.createdAt) ?? '—'}</Text>
      </DataTableCell>
      <DataTableCell column={C_ACTIONS}>
        <View style={styles.actions}>
          <Button
            label="Open"
            size="sm"
            accessibilityLabel={`Open ${row.name}`}
            onPress={() => {
              setActiveOrganizationId(row.id)
              replaceOrganization(router, defaultOrgDashboardHref(row.id) as Href)
            }}
          />
          <OrganizationDeleteButton
            orgId={row.id}
            orgName={row.name}
            label="Delete"
            disabled={gate.disabled}
            onDeleted={(deletedId) => {
              if (getActiveOrganizationId() === deletedId) setActiveOrganizationId(null)
            }}
          />
        </View>
        {gate.reason ? <Text style={styles.sub}>{gate.reason}</Text> : null}
      </DataTableCell>
    </DataTableRow>
  )
}

/** Platform Admin > Organizations: every organization on the install. Wide, so the table scrolls sideways on a phone. */
export function OrganizationsSection() {
  const query = useAdminOrganizations()
  const rows = query.data?.organizations ?? []
  let empty = 'No organizations yet.'
  if (query.isLoading) empty = 'Loading…'
  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Organizations</Text>
      <Text style={panelStyles.pageCopy}>
        Every organization on this control plane. Open one to work inside it. An organization can be
        deleted once it has no servers, tunnels or DNS records; the root organization never can.
      </Text>
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load organizations')}
        </Text>
      ) : null}
      <DataTable columns={COLUMNS} minWidth={940} bordered>
        {rows.length === 0 ? (
          <DataTableEmpty>{empty}</DataTableEmpty>
        ) : (
          rows.map((row, index) => (
            <OrganizationRow key={row.id} row={row} last={index === rows.length - 1} />
          ))
        )}
      </DataTable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  cell: { color: colors.text, fontSize: 13 },
  sub: { color: colors.textDim, fontSize: 11 },
  badge: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
})
