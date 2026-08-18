import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
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
import { useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'

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

function DatacenterCountryCell({ datacenter }: Readonly<{ datacenter: DatacenterRecord }>) {
  const geo = datacenterGeoFromMetadata(datacenter.metadata)
  const flag = countryCodeToFlagEmoji(geo?.country)
  const country = formatServerGeoCountryName(geo)

  if (!country && !flag) {
    return (
      <View style={[styles.tableCell, styles.colCountry]}>
        <Text style={styles.mutedValue}>—</Text>
      </View>
    )
  }

  return (
    <View style={[styles.tableCell, styles.colCountry]}>
      <View style={styles.countryRow}>
        {flag ? <Text style={styles.countryFlag}>{flag}</Text> : null}
        <Text style={styles.countryText} numberOfLines={1}>
          {country || '—'}
        </Text>
      </View>
    </View>
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
  const [rowHovered, setRowHovered] = useState(false)
  const title = datacenterDisplayName(datacenter)
  const description = datacenter.description?.trim()

  return (
    <Pressable
      onPress={() => router.push(datacenterHref(orgId, datacenter.id))}
      onPointerEnter={() => setRowHovered(true)}
      onPointerLeave={() => setRowHovered(false)}
      style={({ pressed }) => [
        styles.tableRow,
        rowIndex % 2 === 1 ? styles.tableRowEven : null,
        rowHovered ? styles.tableRowHovered : null,
        pressed && styles.rowPressed,
        webPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View style={[styles.tableCell, styles.colName]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.descriptionText} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      <DatacenterCountryCell datacenter={datacenter} />
      <View style={[styles.tableCell, styles.colServers]}>
        <Text style={styles.countText}>{formatDatacenterServerCount(serverCount)}</Text>
      </View>
      <View style={[styles.tableCell, styles.colCidrs]}>
        <Text style={styles.monoText} numberOfLines={1}>
          {formatDatacenterSubnetSummary(datacenter.privateCidrs)}
        </Text>
      </View>
      <View style={[styles.tableCell, styles.colTimezone]}>
        <Text style={styles.monoText} numberOfLines={1}>
          {datacenterTimezoneLabel(datacenter.options)}
        </Text>
      </View>
    </Pressable>
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
    <ScrollView
      horizontal
      nestedScrollEnabled
      style={styles.tableScroll}
      contentContainerStyle={styles.tableScrollContent}
    >
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <View style={[styles.tableCell, styles.colName]}>
            <Text style={styles.tableHeaderText}>Datacenter</Text>
          </View>
          <View style={[styles.tableCell, styles.colCountry]}>
            <Text style={styles.tableHeaderText}>Country</Text>
          </View>
          <View style={[styles.tableCell, styles.colServers]}>
            <Text style={styles.tableHeaderText}>Servers</Text>
          </View>
          <View style={[styles.tableCell, styles.colCidrs]}>
            <Text style={styles.tableHeaderText}>Subnets</Text>
          </View>
          <View style={[styles.tableCell, styles.colTimezone]}>
            <Text style={styles.tableHeaderText}>Timezone</Text>
          </View>
        </View>
        {datacenters.map((datacenter, index) => (
          <DatacenterTableRow
            key={datacenter.id}
            orgId={orgId}
            datacenter={datacenter}
            serverCount={serverCountByDatacenter.get(datacenter.id) ?? 0}
            rowIndex={index}
          />
        ))}
      </View>
    </ScrollView>
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
    return <Text style={orgPanelStyles.muted}>Loading datacenters…</Text>
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
    <View style={orgPanelStyles.statePanel}>
      <Text style={orgPanelStyles.statePanelTitle}>No datacenters yet</Text>
      <Text style={orgPanelStyles.muted}>{reason ?? 'Create one from a server IP.'}</Text>
    </View>
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
      <Pressable
        style={({ pressed }) => [
          orgPanelStyles.toolbarBtnPrimary,
          !canAdd && styles.buttonDisabled,
          pressed && canAdd && styles.rowPressed,
          webPointer,
        ]}
        disabled={!canAdd}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add datacenter"
        accessibilityState={{ disabled: !canAdd }}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>+ Datacenter</Text>
      </Pressable>
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
  const servers = serversQuery.data?.servers ?? []
  const eligibleCount = listServersWithReportedPrivateNetworks(servers).length
  const serverCounts = useMemo(() => countServersByDatacenterId(servers), [servers])
  const eligibility = resolveDatacenterAddEligibility({
    serversWithPrivateAddress: eligibleCount,
    serverCount: servers.length,
  })
  const canAdd = canManage && eligibility.canAdd

  const loading = (datacentersQuery.isLoading || serversQuery.isLoading) && datacenters.length === 0
  const error =
    datacentersErrorMessage(datacentersQuery.error) ?? datacentersErrorMessage(serversQuery.error)

  const listHint = datacentersListHint(loading, datacenters.length)

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Datacenters</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Private networks. A datacenter can hold several routable subnets.
      </Text>

      {error && datacenters.length === 0 ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <SectionPanel title="Datacenters" hint={listHint}>
        <DatacentersToolbar
          canManage={canManage}
          canAdd={canAdd}
          onAdd={() => router.push(datacenterNewHref(orgId))}
        />
        {canManage && !eligibility.canAdd && eligibility.reason ? (
          <Text style={styles.capacityHint}>{eligibility.reason}</Text>
        ) : null}
        {error && datacenters.length > 0 ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
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
  buttonDisabled: {
    opacity: 0.5,
  },
  tableScroll: {
    width: '100%',
    alignSelf: 'stretch',
  },
  tableScrollContent: {
    flexGrow: 1,
    minWidth: '100%',
  },
  table: {
    flexGrow: 1,
    width: '100%',
    minWidth: 760,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  tableRowEven: {
    backgroundColor: colors.bgInset,
  },
  tableRowHovered: {
    backgroundColor: colors.bgSecondary,
  },
  tableHeaderRow: {
    backgroundColor: colors.bgSecondary,
    paddingVertical: spacing.xs,
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 2,
        } as unknown as ViewStyle)
      : null),
  },
  rowPressed: {
    opacity: 0.88,
  },
  tableCell: {
    justifyContent: 'center',
    minWidth: 0,
  },
  tableHeaderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colName: {
    flex: 2.2,
    minWidth: 180,
    gap: 2,
  },
  colCountry: {
    flex: 1.2,
    minWidth: 120,
    alignItems: 'flex-start',
  },
  colServers: {
    flex: 0.9,
    minWidth: 90,
  },
  colCidrs: {
    flex: 1.6,
    minWidth: 140,
  },
  colTimezone: {
    flex: 1.2,
    minWidth: 130,
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
