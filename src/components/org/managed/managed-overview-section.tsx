import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  fetchOrganizationManaged,
  type ManagedListRecord,
} from '@/lib/instance-api'
import {
  MANAGED_SERVICE_CATALOG,
  managedCatalogEntryForCode,
  managedStatusLabel,
  type ManagedServiceEngine,
  type ManagedStatus,
} from '@/lib/managed-services'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

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

function FilterChip({
  label,
  active,
  onPress,
}: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

function serviceTitle(row: ManagedListRecord): string {
  return (
    row.displayName?.trim() ||
    row.projectDisplayName?.trim() ||
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
  return row.serverDisplayName?.trim() || (row.serverId ? row.serverId : '—')
}

function projectEnvironmentLabel(row: ManagedListRecord): string {
  const project = row.projectDisplayName?.trim() || 'Project'
  const environment = row.environmentDisplayName?.trim()
  if (environment) return `${project} / ${environment}`
  return project
}

function endpointLabel(row: ManagedListRecord): string {
  if (row.host && row.port != null) return `${row.host}:${row.port}`
  return 'Not exposed'
}

function statusFilterLabel(status: ManagedStatus | 'all'): string {
  if (status === 'all') return 'All'
  return managedStatusLabel(status)
}

function statusTone(status: ManagedStatus) {
  switch (status) {
    case 'ready':
      return {
        badge: styles.statusReady,
        text: styles.statusTextReady,
        dot: styles.statusDotReady,
      }
    case 'failed':
      return {
        badge: styles.statusFailed,
        text: styles.statusTextFailed,
        dot: styles.statusDotFailed,
      }
    case 'stopped':
      return {
        badge: styles.statusStopped,
        text: styles.statusTextStopped,
        dot: styles.statusDotStopped,
      }
    case 'provisioning':
    case 'applying':
      return {
        badge: styles.statusPending,
        text: styles.statusTextPending,
        dot: styles.statusDotPending,
      }
  }
}

function ManagedStatusCell({ status }: Readonly<{ status: ManagedStatus }>) {
  const tone = statusTone(status)
  return (
    <View style={[styles.tableCell, styles.colStatus]}>
      <View style={[styles.statusBadge, tone.badge]}>
        <View style={[styles.statusDot, tone.dot]} />
        <Text style={[styles.statusText, tone.text]}>
          {managedStatusLabel(status)}
        </Text>
      </View>
    </View>
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
  const [rowHovered, setRowHovered] = useState(false)
  const title = serviceTitle(row)
  const href = `/${orgId}/projects/${row.projectId}` as Href

  return (
    <Pressable
      onPress={() => router.push(href)}
      onPointerEnter={() => setRowHovered(true)}
      onPointerLeave={() => setRowHovered(false)}
      style={({ pressed }) => [
        styles.tableRow,
        rowIndex % 2 === 1 ? styles.tableRowEven : null,
        rowHovered ? styles.tableRowHovered : null,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <View style={[styles.tableCell, styles.colEngine]}>
        <View style={styles.engineBadge}>
          <Text style={styles.engineBadgeText}>{engineLabel(row)}</Text>
        </View>
      </View>
      <View style={[styles.tableCell, styles.colName]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={[styles.tableCell, styles.colProject]}>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {projectEnvironmentLabel(row)}
        </Text>
      </View>
      <View style={[styles.tableCell, styles.colServer]}>
        <Text style={styles.secondaryText} numberOfLines={1}>
          {serverLabel(row)}
        </Text>
      </View>
      <ManagedStatusCell status={row.status} />
      <View style={[styles.tableCell, styles.colEndpoint]}>
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
      </View>
    </Pressable>
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
      <Text style={styles.fieldLabel}>Engine</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="All"
          active={engineFilter === 'all'}
          onPress={() => onEngineFilter('all')}
        />
        {engines.map((engine) => (
          <FilterChip
            key={engine}
            label={managedCatalogEntryForCode(engine)?.label ?? engine}
            active={engineFilter === engine}
            onPress={() => onEngineFilter(engine)}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>Status</Text>
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((status) => (
          <FilterChip
            key={status}
            label={statusFilterLabel(status)}
            active={statusFilter === status}
            onPress={() => onStatusFilter(status)}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>Server</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="All servers"
          active={serverFilter === ''}
          onPress={() => onServerFilter('')}
        />
        {servers.map((server) => (
          <FilterChip
            key={server.id}
            label={server.label}
            active={serverFilter === server.id}
            onPress={() => onServerFilter(server.id)}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

function ManagedEmptyState({
  canManage,
  onCreate,
}: Readonly<{ canManage: boolean; onCreate: () => void }>) {
  return (
    <View style={orgPanelStyles.statePanel}>
      <Text style={orgPanelStyles.statePanelTitle}>No managed services yet</Text>
      <Text style={orgPanelStyles.muted}>
        Provision a managed engine (Postgres first) from the create flow.
      </Text>
      {canManage ? (
        <Pressable
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnPrimary,
            styles.emptyAction,
            pressed && styles.buttonPressed,
            webPointer,
          ]}
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="Create managed service"
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            + Managed service
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function ManagedFleetTable({
  orgId,
  rows,
}: Readonly<{ orgId: string; rows: readonly ManagedListRecord[] }>) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      style={styles.tableScroll}
      contentContainerStyle={styles.tableScrollContent}
    >
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <View style={[styles.tableCell, styles.colEngine]}>
            <Text style={styles.tableHeaderText}>Engine</Text>
          </View>
          <View style={[styles.tableCell, styles.colName]}>
            <Text style={styles.tableHeaderText}>Name</Text>
          </View>
          <View style={[styles.tableCell, styles.colProject]}>
            <Text style={styles.tableHeaderText}>Project</Text>
          </View>
          <View style={[styles.tableCell, styles.colServer]}>
            <Text style={styles.tableHeaderText}>Server</Text>
          </View>
          <View style={[styles.tableCell, styles.colStatus]}>
            <Text style={styles.tableHeaderText}>Status</Text>
          </View>
          <View style={[styles.tableCell, styles.colEndpoint]}>
            <Text style={styles.tableHeaderText}>Endpoint</Text>
          </View>
        </View>
        {rows.map((row, index) => (
          <ManagedTableRow
            key={row.id}
            orgId={orgId}
            row={row}
            rowIndex={index}
          />
        ))}
      </View>
    </ScrollView>
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
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={orgPanelStyles.muted}>Loading managed services…</Text>
      </View>
    )
  }

  // Initial-load failure only — preserve cached fleet rows on background refresh errors.
  if (error && rows.length === 0) {
    return <Text style={orgPanelStyles.error}>{error}</Text>
  }

  if (rows.length === 0) {
    return <ManagedEmptyState canManage={canManage} onCreate={onCreate} />
  }

  const refreshError = error ? (
    <Text style={orgPanelStyles.error}>{error}</Text>
  ) : null

  if (filtered.length === 0) {
    return (
      <View style={styles.fleetBody}>
        {refreshError}
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.statePanelTitle}>No matches</Text>
          <Text style={orgPanelStyles.muted}>
            {filtersActive
              ? 'No managed services match these filters.'
              : 'No managed services to show.'}
          </Text>
        </View>
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

  const managedQuery = useQuery({
    queryKey: ['org', orgId, 'managed'],
    queryFn: () => fetchOrganizationManaged(orgId),
    enabled: orgId.length > 0,
    refetchInterval: MANAGED_REFRESH_MS,
    staleTime: MANAGED_REFRESH_MS / 2,
  })
  useForbiddenRecovery(managedQuery.error)

  const rows = managedQuery.data?.managed ?? []
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
      <Text style={orgPanelStyles.pageTitle}>Managed services</Text>
      <Text style={orgPanelStyles.pageCopy}>
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
            <Pressable
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnPrimary,
                pressed && styles.buttonPressed,
                webPointer,
              ]}
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Create managed service"
            >
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                + Managed service
              </Text>
            </Pressable>
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
  emptyAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
  buttonPressed: {
    opacity: 0.88,
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
    minWidth: 920,
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
        } as const)
      : {}),
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
  colEngine: {
    flex: 1.1,
    minWidth: 110,
    alignItems: 'flex-start',
  },
  colName: {
    flex: 1.6,
    minWidth: 140,
  },
  colProject: {
    flex: 1.8,
    minWidth: 160,
  },
  colServer: {
    flex: 1.3,
    minWidth: 120,
  },
  colStatus: {
    flex: 1.3,
    minWidth: 130,
    alignItems: 'flex-start',
  },
  colEndpoint: {
    flex: 1.6,
    minWidth: 140,
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
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotReady: {
    backgroundColor: colors.accent,
  },
  statusDotStopped: {
    backgroundColor: colors.textFaint,
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  statusDotPending: {
    backgroundColor: colors.pending,
  },
  statusDotFailed: {
    backgroundColor: colors.error,
  },
  statusReady: {
    borderColor: colors.accent,
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
