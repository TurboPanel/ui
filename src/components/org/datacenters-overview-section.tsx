import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  EmptyState,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import {
  countServersByDatacenterId,
  datacenterDisplayName,
  datacenterGeoFromMetadata,
  datacenterTimezoneLabel,
  formatDatacenterServerCount,
  formatDatacenterSubnetSummary,
  listServersWithReportedPrivateNetworks,
  resolveDatacenterAddEligibility,
  sortDatacentersByName,
} from '@/lib/datacenter-list'
import type { DatacenterRecord } from '@/lib/instance-api'
import { datacenterHref, datacenterNewHref } from '@/lib/org-navigation'
import { useOrgServers } from '@/lib/queries/servers'
import { useDatacenters } from '@/lib/queries/topology'
import { useCan } from '@/lib/query-client'
import { countryCodeToFlagEmoji, formatServerGeoCountryName } from '@/lib/server-geo'
import { colors, spacing } from '@/lib/theme'
import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

function datacentersListHint(loading: boolean, count: number): string {
  if (loading) return 'Loading…'
  if (count === 1) return '1 datacenter'
  return `${count} datacenters`
}

function datacentersErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  return 'Failed to load datacenters'
}

const DATACENTER_COLUMNS = [
  { key: 'name', header: 'Datacenter', flex: 2.2, minWidth: 180 },
  { key: 'country', header: 'Country', flex: 1.2, minWidth: 120 },
  { key: 'servers', header: 'Servers', flex: 0.9, minWidth: 90 },
  { key: 'cidrs', header: 'Subnets', flex: 1.6, minWidth: 140 },
  { key: 'timezone', header: 'Timezone', flex: 1.2, minWidth: 130 },
] as const satisfies readonly DataTableColumn[]

const [
  DC_COL_NAME,
  DC_COL_COUNTRY,
  DC_COL_SERVERS,
  DC_COL_CIDRS,
  DC_COL_TIMEZONE,
] = DATACENTER_COLUMNS

function DatacenterCountryCell({ datacenter }: Readonly<{ datacenter: DatacenterRecord }>) {
  const geo = datacenterGeoFromMetadata(datacenter.metadata)
  const flag = countryCodeToFlagEmoji(geo?.country)
  const country = formatServerGeoCountryName(geo)

  if (!country && !flag) {
    return (
      <DataTableCell column={DC_COL_COUNTRY}>
        <Text style={styles.mutedValue}>—</Text>
      </DataTableCell>
    )
  }

  return (
    <DataTableCell column={DC_COL_COUNTRY}>
      <View style={styles.countryRow}>
        {flag ? <Text style={styles.countryFlag}>{flag}</Text> : null}
        <Text style={styles.countryText} numberOfLines={1}>
          {country || '—'}
        </Text>
      </View>
    </DataTableCell>
  )
}

function DatacenterTableRow({
  orgId,
  datacenter,
  serverCount,
  rowIndex,
}: Readonly<{
  orgId: string
  datacenter: DatacenterRecord
  serverCount: number
  rowIndex: number
}>) {
  const router = useRouter()
  const title = datacenterDisplayName(datacenter)
  const description = datacenter.description?.trim()

  return (
    <DataTableRow
      onPress={() => router.push(datacenterHref(orgId, datacenter.id))}
      alt={rowIndex % 2 === 1}
      accessibilityLabel={`Open ${title}`}
    >
      <DataTableCell column={DC_COL_NAME}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.descriptionText} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </DataTableCell>
      <DatacenterCountryCell datacenter={datacenter} />
      <DataTableCell column={DC_COL_SERVERS}>
        <Text style={styles.countText}>{formatDatacenterServerCount(serverCount)}</Text>
      </DataTableCell>
      <DataTableCell column={DC_COL_CIDRS}>
        <Text style={styles.monoText} numberOfLines={1}>
          {formatDatacenterSubnetSummary(datacenter.privateCidrs)}
        </Text>
      </DataTableCell>
      <DataTableCell column={DC_COL_TIMEZONE}>
        <Text style={styles.monoText} numberOfLines={1}>
          {datacenterTimezoneLabel(datacenter.options)}
        </Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function DatacentersTable({
  orgId,
  datacenters,
  serverCountByDatacenter,
}: Readonly<{
  orgId: string
  datacenters: readonly DatacenterRecord[]
  serverCountByDatacenter: ReadonlyMap<string, number>
}>) {
  return (
    <DataTable columns={DATACENTER_COLUMNS} minWidth={760} bordered>
      {datacenters.map((datacenter, index) => (
        <DatacenterTableRow
          key={datacenter.id}
          orgId={orgId}
          datacenter={datacenter}
          serverCount={serverCountByDatacenter.get(datacenter.id) ?? 0}
          rowIndex={index}
        />
      ))}
    </DataTable>
  )
}

function DatacentersListBody({
  orgId,
  loading,
  eligibilityReason,
  datacenters,
  serverCountByDatacenter,
}: Readonly<{
  orgId: string
  loading: boolean
  eligibilityReason: string | null
  datacenters: readonly DatacenterRecord[]
  serverCountByDatacenter: ReadonlyMap<string, number>
}>) {
  if (loading) {
    return <LoadingState label="Loading datacenters…" />
  }
  if (datacenters.length === 0) {
    return <DatacentersEmptyState reason={eligibilityReason} />
  }
  return (
    <DatacentersTable
      orgId={orgId}
      datacenters={datacenters}
      serverCountByDatacenter={serverCountByDatacenter}
    />
  )
}

function DatacentersEmptyState({ reason }: Readonly<{ reason: string | null }>) {
  return (
    <EmptyState
      title="No datacenters yet"
      hint={reason ?? 'Create one from a server IP.'}
      panel
    />
  )
}

function DatacentersToolbar({
  canManage,
  canAdd,
  onAdd,
}: Readonly<{
  canManage: boolean
  canAdd: boolean
  onAdd: () => void
}>) {
  if (!canManage) return null
  return (
    <View style={styles.toolbarRow}>
      <Button
        label="+ Datacenter"
        variant="primary"
        disabled={!canAdd}
        onPress={onAdd}
        accessibilityLabel="Add datacenter"
      />
    </View>
  )
}

export function DatacentersOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const datacentersQuery = useDatacenters(orgId)
  const serversQuery = useOrgServers(orgId)

  const datacenters = useMemo(
    () => sortDatacentersByName(datacentersQuery.data?.datacenters ?? []),
    [datacentersQuery.data?.datacenters]
  )
  const serverList = serversQuery.data?.servers
  const eligibleCount = listServersWithReportedPrivateNetworks(serverList ?? []).length
  const serverCounts = useMemo(
    () => countServersByDatacenterId(serverList ?? []),
    [serverList],
  )
  const eligibility = resolveDatacenterAddEligibility({
    serversWithPrivateAddress: eligibleCount,
    serverCount: serverList?.length ?? 0,
  })
  const canAdd = canManage && eligibility.canAdd

  const loading = (datacentersQuery.isLoading || serversQuery.isLoading) && datacenters.length === 0
  const error =
    datacentersErrorMessage(datacentersQuery.error) ?? datacentersErrorMessage(serversQuery.error)

  const listHint = datacentersListHint(loading, datacenters.length)

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Datacenters</Text>
      <Text style={panelStyles.pageCopy}>
        Private networks. A datacenter can hold several routable subnets.
      </Text>

      {error && datacenters.length === 0 ? <Text style={panelStyles.error}>{error}</Text> : null}

      <SectionPanel title="Datacenters" hint={listHint}>
        <DatacentersToolbar
          canManage={canManage}
          canAdd={canAdd}
          onAdd={() => router.push(datacenterNewHref(orgId))}
        />
        {canManage && !eligibility.canAdd && eligibility.reason ? (
          <Text style={styles.capacityHint}>{eligibility.reason}</Text>
        ) : null}
        {error && datacenters.length > 0 ? <Text style={panelStyles.error}>{error}</Text> : null}
        <DatacentersListBody
          orgId={orgId}
          loading={loading}
          eligibilityReason={eligibility.reason}
          datacenters={datacenters}
          serverCountByDatacenter={serverCounts.byDatacenter}
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
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  capacityHint: {
    color: colors.pending,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  descriptionText: {
    color: colors.textDim,
    fontSize: 12,
    flexShrink: 1,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  countryFlag: {
    fontSize: 14,
    lineHeight: 16,
  },
  countryText: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  mutedValue: {
    color: colors.textDim,
    fontSize: 12,
  },
  countText: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '500',
  },
  monoText: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
})
