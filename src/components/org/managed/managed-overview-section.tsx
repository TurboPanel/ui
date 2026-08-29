import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  DataTable,
  DataTableCell,
  type DataTableColumn,
  DataTableRow,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  StatusDot,
  type StatusTone,
} from '@/components/ui'
import { type ManagedListRecord } from '@/lib/instance-api'
import {
  MANAGED_SERVICE_CATALOG,
  clusterHasUnhealthyMember,
  formatClusterTopologyLabel,
  managedCatalogEntryForCode,
  managedStatusLabel,
  type ManagedServiceEngine,
  type ManagedStatus,
} from '@/lib/managed-services'
import { useOrganizationManaged } from '@/lib/queries/managed'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

/** Restrained fleet refresh — one org list call, never per-row status polling. */
const MANAGED_REFRESH_MS = 30_000

const STATUS_FILTERS: readonly (ManagedStatus | 'all')[] = [
  'all',
  'ready',
  'stopped',
  'provisioning',
  'applying',
  'failed',
]

function serviceTitle(row: ManagedListRecord): string {
  return (
    row.name?.trim() ||
    row.projectName?.trim() ||
    row.engineDisplayName?.trim() ||
    'Managed service'
  )
}

function engineLabel(row: ManagedListRecord): string {
  if (row.engineDisplayName?.trim()) return row.engineDisplayName.trim()
  if (row.engine) {
    return managedCatalogEntryForCode(row.engine)?.label ?? row.engine
  }
  return 'Unknown'
}

function serverLabel(row: ManagedListRecord): string {
  return row.serverName?.trim() || (row.serverId ? row.serverId : '—')
}

function projectEnvironmentLabel(row: ManagedListRecord): string {
  const project = row.projectName?.trim() || 'Project'
  const environment = row.environmentName?.trim()
  if (environment) return `${project} / ${environment}`
  return project
}

function endpointLabel(row: ManagedListRecord): string {
  if (row.host && row.port != null) return `${row.host}:${row.port}`
  return 'Not exposed'
}

function topologyLabel(row: ManagedListRecord): string {
  return formatClusterTopologyLabel(row.members)
}

function statusFilterLabel(status: ManagedStatus | 'all'): string {
  if (status === 'all') return 'All'
  return managedStatusLabel(status)
}

const MANAGED_COLUMNS = [
  { key: 'engine', header: 'Engine', flex: 1.1, minWidth: 110 },
  { key: 'name', header: 'Name', flex: 1.6, minWidth: 140 },
  { key: 'project', header: 'Project', flex: 1.8, minWidth: 160 },
  { key: 'server', header: 'Server', flex: 1.3, minWidth: 120 },
  { key: 'status', header: 'Status', flex: 1.3, minWidth: 130 },
  { key: 'topology', header: 'Topology', flex: 1.5, minWidth: 140 },
  { key: 'endpoint', header: 'Shared listener', flex: 1.6, minWidth: 140 },
] as const satisfies readonly DataTableColumn[]

const [
  MG_ENGINE,
  MG_NAME,
  MG_PROJECT,
  MG_SERVER,
  MG_STATUS,
  MG_TOPOLOGY,
  MG_ENDPOINT,
] = MANAGED_COLUMNS

function statusTone(status: ManagedStatus) {
  switch (status) {
    case 'ready':
      return {
        badge: styles.statusReady,
        text: styles.statusTextReady,
        dot: 'online' as StatusTone,
      }
    case 'failed':
      return {
        badge: styles.statusFailed,
        text: styles.statusTextFailed,
        dot: 'failed' as StatusTone,
      }
    case 'stopped':
      return {
        badge: styles.statusStopped,
        text: styles.statusTextStopped,
        dot: 'offline' as StatusTone,
      }
    case 'provisioning':
    case 'applying':
      return {
        badge: styles.statusPending,
        text: styles.statusTextPending,
        dot: 'pending' as StatusTone,
      }
  }
}

function ManagedStatusCell({ status }: Readonly<{ status: ManagedStatus }>) {
  const tone = statusTone(status)
  return (
    <DataTableCell column={MG_STATUS}>
      <View style={[styles.statusBadge, tone.badge]}>
        <StatusDot size="sm" tone={tone.dot} />
        <Text style={[styles.statusText, tone.text]}>
          {managedStatusLabel(status)}
        </Text>
      </View>
    </DataTableCell>
  )
}

function ManagedTableRow({
  orgId,
  row,
  rowIndex,
}: Readonly<{
  orgId: string
  row: ManagedListRecord
  rowIndex: number
}>) {
  const router = useRouter()
  const title = serviceTitle(row)
  const href = `/${orgId}/projects/${row.projectId}` as Href

  return (
    <DataTableRow
      onPress={() => router.push(href)}
      alt={rowIndex % 2 === 1}
      accessibilityLabel={`Open ${title}`}
    >
      <DataTableCell column={MG_ENGINE}>
        <View style={styles.engineBadge}>
          <Text style={styles.engineBadgeText}>{engineLabel(row)}</Text>
        </View>
      </DataTableCell>
      <DataTableCell column={MG_NAME}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
      </DataTableCell>
      <DataTableCell column={MG_PROJECT}>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {projectEnvironmentLabel(row)}
        </Text>
      </DataTableCell>
      <DataTableCell column={MG_SERVER}>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {serverLabel(row)}
        </Text>
      </DataTableCell>
      <ManagedStatusCell status={row.status} />
      <DataTableCell column={MG_TOPOLOGY}>
        <View style={styles.topologyCell}>
          {clusterHasUnhealthyMember(row.members) ? (
            <View
              style={styles.topologyWarnDot}
              accessibilityLabel="Member needs attention"
            />
          ) : (
            <View style={styles.topologyDot} accessibilityLabel="Healthy topology" />
          )}
          <Text style={styles.secondaryText} numberOfLines={1}>
            {topologyLabel(row)}
          </Text>
        </View>
      </DataTableCell>
      <DataTableCell column={MG_ENDPOINT}>
        <Text
          style={
            row.host && row.port != null
              ? styles.endpointText
              : styles.endpointMuted
          }
          numberOfLines={1}
        >
          {endpointLabel(row)}
        </Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function filterManagedRows(
  rows: readonly ManagedListRecord[],
  engineFilter: ManagedServiceEngine | 'all',
  statusFilter: ManagedStatus | 'all',
  serverFilter: string,
): ManagedListRecord[] {
  return rows.filter((row) => {
    if (engineFilter !== 'all' && row.engine !== engineFilter) return false
    if (statusFilter !== 'all' && row.status !== statusFilter) return false
    if (serverFilter && row.serverId !== serverFilter) return false
    return true
  })
}

function uniqueEngines(
  rows: readonly ManagedListRecord[],
): ManagedServiceEngine[] {
  const found = new Set<ManagedServiceEngine>()
  for (const row of rows) {
    if (row.engine) found.add(row.engine)
  }
  return MANAGED_SERVICE_CATALOG.map((entry) => entry.engine).filter((engine) =>
    found.has(engine),
  )
}

function uniqueServers(
  rows: readonly ManagedListRecord[],
): { id: string; label: string }[] {
  const byId = new Map<string, string>()
  for (const row of rows) {
    if (!row.serverId) continue
    if (!byId.has(row.serverId)) {
      byId.set(row.serverId, serverLabel(row))
    }
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function managedListErrorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  return 'Failed to load managed services'
}

function ManagedFiltersPanel({
  engines,
  servers,
  engineFilter,
  statusFilter,
  serverFilter,
  onEngineFilter,
  onStatusFilter,
  onServerFilter,
}: Readonly<{
  engines: readonly ManagedServiceEngine[]
  servers: readonly { id: string; label: string }[]
  engineFilter: ManagedServiceEngine | 'all'
  statusFilter: ManagedStatus | 'all'
  serverFilter: string
  onEngineFilter: (value: ManagedServiceEngine | 'all') => void
  onStatusFilter: (value: ManagedStatus | 'all') => void
  onServerFilter: (value: string) => void
}>) {
  return (
    <SectionPanel title="Filters" hint="Narrow the loaded list">
      <FormField label="Engine">
        <SegmentedControl
          options={[
            { value: 'all', label: 'All' },
            ...engines.map((engine) => ({
              value: engine,
              label: managedCatalogEntryForCode(engine)?.label ?? engine,
            })),
          ]}
          value={engineFilter}
          onChange={(value) => onEngineFilter(value)}
          accessibilityLabel="Engine"
        />
      </FormField>

      <FormField label="Status">
        <SegmentedControl
          options={STATUS_FILTERS.map((status) => ({
            value: status,
            label: statusFilterLabel(status),
          }))}
          value={statusFilter}
          onChange={(value) => onStatusFilter(value)}
          accessibilityLabel="Status"
        />
      </FormField>

      <FormField label="Server">
        <SegmentedControl
          options={[
            { value: '', label: 'All servers' },
            ...servers.map((server) => ({
              value: server.id,
              label: server.label,
            })),
          ]}
          value={serverFilter}
          onChange={(value) => onServerFilter(value)}
          accessibilityLabel="Server"
        />
      </FormField>
    </SectionPanel>
  )
}

function ManagedEmptyState({
  canManage,
  onCreate,
}: Readonly<{ canManage: boolean; onCreate: () => void }>) {
  return (
    <EmptyState
      panel
      title="No managed services yet"
      hint="Provision a managed PostgreSQL, MySQL, or MariaDB engine from the create flow."
      action={
        canManage ? (
          <Button
            label="+ Managed service"
            variant="primary"
            accessibilityLabel="Create managed service"
            onPress={onCreate}
          />
        ) : undefined
      }
    />
  )
}

function ManagedFleetTable({
  orgId,
  rows,
}: Readonly<{ orgId: string; rows: readonly ManagedListRecord[] }>) {
  return (
    <DataTable columns={MANAGED_COLUMNS} minWidth={1080} bordered>
      {rows.map((row, index) => (
        <ManagedTableRow
          key={row.id}
          orgId={orgId}
          row={row}
          rowIndex={index}
        />
      ))}
    </DataTable>
  )
}

function ManagedFleetBody({
  orgId,
  loading,
  error,
  rows,
  filtered,
  filtersActive,
  canManage,
  onCreate,
}: Readonly<{
  orgId: string
  loading: boolean
  error: string | null
  rows: readonly ManagedListRecord[]
  filtered: readonly ManagedListRecord[]
  filtersActive: boolean
  canManage: boolean
  onCreate: () => void
}>) {
  if (loading) {
    return <LoadingState label="Loading managed services…" />
  }

  // Initial-load failure only — preserve cached fleet rows on background refresh errors.
  if (error && rows.length === 0) {
    return <Text style={panelStyles.error}>{error}</Text>
  }

  if (rows.length === 0) {
    return <ManagedEmptyState canManage={canManage} onCreate={onCreate} />
  }

  const refreshError = error ? (
    <Text style={panelStyles.error}>{error}</Text>
  ) : null

  if (filtered.length === 0) {
    return (
      <View style={styles.fleetBody}>
        {refreshError}
        <EmptyState
          panel
          title="No matches"
          hint={
            filtersActive
              ? 'No managed services match these filters.'
              : 'No managed services to show.'
          }
        />
      </View>
    )
  }

  return (
    <View style={styles.fleetBody}>
      {refreshError}
      <ManagedFleetTable orgId={orgId} rows={filtered} />
    </View>
  )
}

export function ManagedOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [engineFilter, setEngineFilter] = useState<ManagedServiceEngine | 'all'>(
    'all',
  )
  const [statusFilter, setStatusFilter] = useState<ManagedStatus | 'all'>('all')
  const [serverFilter, setServerFilter] = useState('')

  const managedQuery = useOrganizationManaged(orgId, {
    refetchInterval: MANAGED_REFRESH_MS,
    staleTime: MANAGED_REFRESH_MS / 2,
  })

  const rows = orEmptyArray(managedQuery.data?.managed)
  const filtered = useMemo(
    () => filterManagedRows(rows, engineFilter, statusFilter, serverFilter),
    [rows, engineFilter, statusFilter, serverFilter],
  )
  const engines = useMemo(() => uniqueEngines(rows), [rows])
  const servers = useMemo(() => uniqueServers(rows), [rows])

  // Only treat as loading / hard error when there is no cached fleet data yet.
  const loading = managedQuery.isLoading && rows.length === 0
  const error = managedListErrorMessage(managedQuery.error)
  const createHref = `/${orgId}/projects/new?type=managed` as Href
  const filtersActive =
    engineFilter !== 'all' || statusFilter !== 'all' || serverFilter.length > 0
  const listHint = loading
    ? 'Loading…'
    : `${filtered.length} of ${rows.length} service(s) · Postgres-backed status`

  const openCreate = () => {
    router.push(createHref)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Managed services</Text>
      <Text style={panelStyles.pageCopy}>
        Every managed engine in this organization. Open a row for the project
        detail surface.
      </Text>

      <ManagedFiltersPanel
        engines={engines}
        servers={servers}
        engineFilter={engineFilter}
        statusFilter={statusFilter}
        serverFilter={serverFilter}
        onEngineFilter={setEngineFilter}
        onStatusFilter={setStatusFilter}
        onServerFilter={setServerFilter}
      />

      <SectionPanel title="Fleet" hint={listHint} accent>
        {canManage ? (
          <View style={styles.toolbarRow}>
            <Button
              label="+ Managed service"
              variant="primary"
              accessibilityLabel="Create managed service"
              onPress={openCreate}
            />
          </View>
        ) : null}

        <ManagedFleetBody
          orgId={orgId}
          loading={loading}
          error={error}
          rows={rows}
          filtered={filtered}
          filtersActive={filtersActive}
          canManage={canManage}
          onCreate={openCreate}
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
  fleetBody: {
    gap: spacing.sm,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  topologyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topologyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  topologyWarnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.pending,
  },
  engineBadge: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bgSecondary,
  },
  engineBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.textBody,
    fontSize: 13,
  },
  endpointText: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  endpointMuted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusReady: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  statusStopped: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  statusPending: {
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
  },
  statusFailed: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusTextReady: {
    color: colors.accent,
  },
  statusTextStopped: {
    color: colors.textDim,
  },
  statusTextPending: {
    color: colors.pending,
  },
  statusTextFailed: {
    color: colors.error,
  },
})
