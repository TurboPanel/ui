import { OverviewNavIcon } from '@/components/icons/nav-icons'
import { AddServerWizard } from '@/components/org/add-server-wizard'
import { ConnectionStatusDot } from '@/components/org/connection-status-dot'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { OsIdentityMark } from '@/components/org/os-identity-mark'
import { SectionPanel } from '@/components/org/section-panel'
import { Checkbox, EmptyState, LoadingState } from '@/components/ui'
import { ServerUsageBars } from '@/components/org/server-usage-bars'
import {
  indexFleetUsageByServerId,
  serverCpuThreads,
} from '@/lib/fleet-capacity'
import {
  getStoredServersLayout,
  resolveServersFleetSurface,
  SERVERS_TILE_MIN_WIDTH,
  serversLayoutAccessibilityLabel,
  setStoredServersLayout,
  showServersToolbarUpdate,
  usesCompactServersList,
  type ServersLayout,
} from '@/lib/servers-layout'
import {
  isForbiddenError,
  type FleetServerUsageRecord,
  type OrgServerRecord,
  type RelayRecord,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { serverDetailHref, serversPendingKeysHref } from '@/lib/org-navigation'
import {
  unboundPendingKeys,
  unusedRegistrationKeysLabel,
} from '@/lib/pending-keys'
import { useOrgFabric } from '@/lib/queries/fabric'
import {
  SERVERS_REFRESH_MS,
  useBatchTriggerServerUpdates,
  useFleetServerUsage,
  useOrgLicenses,
  useOrgServerCapacity,
  useOrgServers,
  useServersUpdateStatus,
} from '@/lib/queries/servers'
import { orEmptyArray } from '@/lib/or-empty-array'
import { queryKeys, useCan } from '@/lib/query-client'
import { resolveServerAddEligibility } from '@/lib/server-add-eligibility'
import {
  resolveServerConnectionStatus,
  serverConnectionStatusLabel,
  serversPresenceRefetchMs,
  type ServerConnectionStatus,
} from '@/lib/server-connection-status'
import { countryCodeToFlagEmoji, formatServerGeoCountryName } from '@/lib/server-geo'
import { chrome, colors, spacing } from '@/lib/theme'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

/** Group TurboFabric tp0 addresses by server — O(1) page-level fan-in. */
function overlayByServerId(
  relays: readonly Pick<RelayRecord, 'serverId' | 'address'>[]
): Map<string, string> {
  const result = new Map<string, string>()
  for (const relay of relays) {
    result.set(relay.serverId, relay.address)
  }
  return result
}

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function isColocatedServer(
  server: OrgServerRecord,
  updateData?: ServerUpdateStatus | null
): boolean {
  return (
    server.colocatedWithInstance === true ||
    updateData?.colocatedWithInstance === true ||
    updateData?.updateBlocked === true
  )
}

function isServerUpdatable(
  server: OrgServerRecord,
  updateByServerId: ReadonlyMap<string, ServerUpdateStatus>,
  triggeringServerIds: ReadonlySet<string>
): boolean {
  const data = updateByServerId.get(server.id)
  return (
    server.connected &&
    !isColocatedServer(server, data) &&
    data?.targetStatus === 'ok' &&
    data.updateAvailable === true &&
    !triggeringServerIds.has(server.id) &&
    data.status !== 'updating'
  )
}

function selectedUpdateButtonLabel(batchUpdating: boolean, selectedUpdatableCount: number): string {
  if (batchUpdating) return 'Updating…'
  if (selectedUpdatableCount > 0) return `Update (${selectedUpdatableCount})`
  return 'Update'
}

function pruneSelectedServerIds(
  prev: Set<string>,
  servers: readonly OrgServerRecord[]
): Set<string> {
  if (prev.size === 0) return prev
  const next = new Set<string>()
  for (const server of servers) {
    if (prev.has(server.id)) next.add(server.id)
  }
  return next.size === prev.size ? prev : next
}

function serversRefreshErrorMessage(err: unknown, forbidden: boolean): string {
  if (err instanceof Error) return err.message
  if (forbidden) return 'Access to servers was denied'
  return 'Failed to load servers'
}

function ListLayoutIcon({ size = 16, color }: Readonly<{ size?: number; color: string }>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

function LayoutToggleChip({
  active,
  label,
  onPress,
  icon,
}: Readonly<{
  active: boolean
  label: string
  onPress: () => void
  icon: (color: string) => ReactElement
}>) {
  const color = active ? chrome.accent : colors.textDim
  return (
    <Pressable
      onPress={onPress}
      style={[
        orgPanelStyles.segmentChip,
        styles.layoutChip,
        active && orgPanelStyles.segmentChipActive,
        webPointer,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {icon(color)}
    </Pressable>
  )
}

function detailViewIcon(color: string) {
  return <ListLayoutIcon color={color} />
}

function summaryViewIcon(color: string) {
  return <OverviewNavIcon color={color} />
}

function ServersLayoutToggle({
  layout,
  onChange,
}: Readonly<{
  layout: ServersLayout
  onChange: (next: ServersLayout) => void
}>) {
  return (
    <View
      style={[orgPanelStyles.segmentGroup, styles.layoutToggle]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Server view"
    >
      <LayoutToggleChip
        active={layout === 'list'}
        label={serversLayoutAccessibilityLabel('list')}
        onPress={() => onChange('list')}
        icon={detailViewIcon}
      />
      <LayoutToggleChip
        active={layout === 'tiles'}
        label={serversLayoutAccessibilityLabel('tiles')}
        onPress={() => onChange('tiles')}
        icon={summaryViewIcon}
      />
    </View>
  )
}

function AddServerToolbarButton({
  open,
  disabled,
  compact,
  onPress,
}: Readonly<{
  open: boolean
  disabled: boolean
  compact: boolean
  onPress: () => void
}>) {
  return (
    <Pressable
      style={({ pressed }) => [
        open ? orgPanelStyles.toolbarBtnSecondary : orgPanelStyles.toolbarBtnPrimary,
        compact && styles.toolbarBtnCompact,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        style={open ? orgPanelStyles.toolbarBtnTextSecondary : orgPanelStyles.toolbarBtnTextPrimary}
      >
        {open ? 'Close' : '+ Server'}
      </Text>
    </Pressable>
  )
}

function UnusedKeysHint({
  orgId,
  count,
}: Readonly<{ orgId: string; count: number }>) {
  const router = useRouter()
  if (count <= 0) return null
  const label = unusedRegistrationKeysLabel(count)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}. Open pending keys.`}
      style={({ pressed }) => [
        styles.unusedKeysLink,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
      onPress={() => router.push(serversPendingKeysHref(orgId))}
    >
      <Text style={styles.unusedKeysLinkText}>{label} — view and delete</Text>
    </Pressable>
  )
}

function ServersOverviewToolbar({
  layout,
  onLayoutChange,
  canOwn,
  canManage,
  addServerEligibility,
  showAddServerWizard,
  onAddServer,
  anyUpdateInProgress,
  batchUpdating,
  selectedCount,
  selectedUpdatableCount,
  showSelectAll,
  allSelected,
  someSelected,
  onToggleSelectAll,
  onTriggerSelectedUpdates,
  compactChrome,
}: Readonly<{
  layout: ServersLayout
  onLayoutChange: (next: ServersLayout) => void
  canOwn: boolean
  canManage: boolean
  addServerEligibility: ReturnType<typeof resolveServerAddEligibility>
  showAddServerWizard: boolean
  onAddServer: () => void
  anyUpdateInProgress: boolean
  batchUpdating: boolean
  selectedCount: number
  selectedUpdatableCount: number
  showSelectAll: boolean
  allSelected: boolean
  someSelected: boolean
  onToggleSelectAll: () => void
  onTriggerSelectedUpdates: () => void
  compactChrome: boolean
}>) {
  const addDisabled = !addServerEligibility.canAdd
  const updateDisabled = anyUpdateInProgress || batchUpdating || selectedUpdatableCount === 0
  const showUpdate = showServersToolbarUpdate(
    canManage,
    compactChrome,
    selectedCount,
  )

  return (
    <View style={styles.toolbarActions}>
      {canOwn ? (
        <AddServerToolbarButton
          open={showAddServerWizard}
          disabled={addDisabled}
          compact={compactChrome}
          onPress={onAddServer}
        />
      ) : null}
      {showUpdate ? (
        <TouchableOpacity
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            compactChrome && styles.toolbarBtnCompact,
            updateDisabled && styles.buttonDisabled,
          ]}
          onPress={onTriggerSelectedUpdates}
          disabled={updateDisabled}
        >
          {batchUpdating ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {selectedUpdateButtonLabel(batchUpdating, selectedUpdatableCount)}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showSelectAll ? (
        <View style={styles.checkboxHit}>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onPress={onToggleSelectAll}
            accessibilityLabel="Select all servers"
          />
        </View>
      ) : null}
      <ServersLayoutToggle layout={layout} onChange={onLayoutChange} />
    </View>
  )
}

function ServerHostIdentity({ server }: Readonly<{ server: OrgServerRecord }>) {
  const title = serverTitle(server)
  const hostname = server.hostname?.trim()
  const showHostname = hostname != null && hostname.length > 0 && hostname !== title

  return (
    <View style={styles.nameButton}>
      <OsIdentityMark server={server} density="row" />
      <View style={styles.nameBlock}>
        <Text style={styles.nameText} numberOfLines={1}>
          {title}
        </Text>
        {showHostname ? (
          <Text style={styles.hostnameSubtext} numberOfLines={1}>
            {hostname}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function ServerNameCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  return (
    <View style={[styles.tableCell, styles.colName]}>
      <ServerHostIdentity server={server} />
    </View>
  )
}

function serverStatusBadgeStyles(status: ServerConnectionStatus) {
  switch (status) {
    case 'online':
      return {
        badge: styles.statusOnline,
        text: styles.statusTextOnline,
      }
    case 'initializing':
      return {
        badge: styles.statusInitializing,
        text: styles.statusTextInitializing,
      }
    case 'offline':
      return {
        badge: styles.statusOffline,
        text: styles.statusTextOffline,
      }
  }
}

function ServerStatusBadge({ server }: Readonly<{ server: OrgServerRecord }>) {
  const status = resolveServerConnectionStatus(server)
  const label = serverConnectionStatusLabel(status)
  const tone = serverStatusBadgeStyles(status)

  return (
    <View
      style={[styles.statusBadge, tone.badge]}
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityState={{ busy: status === 'initializing' }}
      accessibilityLiveRegion="polite"
    >
      <ConnectionStatusDot status={status} />
      <Text style={[styles.statusText, tone.text]}>{label}</Text>
    </View>
  )
}

function ServerStatusCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  return (
    <View style={[styles.tableCell, styles.colStatus]}>
      <ServerStatusBadge server={server} />
    </View>
  )
}

function ServerCountryLine({ server }: Readonly<{ server: OrgServerRecord }>) {
  const flag = countryCodeToFlagEmoji(server.geo?.country)
  const country = formatServerGeoCountryName(server.geo)

  if (!country && !flag) {
    return <Text style={styles.locationMuted}>—</Text>
  }

  return (
    <View style={styles.locationRow}>
      {flag ? <Text style={styles.locationFlag}>{flag}</Text> : null}
      <Text style={styles.locationText} numberOfLines={1}>
        {country || '—'}
      </Text>
    </View>
  )
}

function ServerLocationCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  return (
    <View style={[styles.tableCell, styles.colLocation]}>
      <ServerCountryLine server={server} />
    </View>
  )
}

function usageBarMetrics(usage: FleetServerUsageRecord | null) {
  return {
    cpuUsagePercent: usage?.values.cpuUsagePercent,
    cpuUserPercent: usage?.values.cpuUserPercent,
    cpuSystemPercent: usage?.values.cpuSystemPercent,
    cpuIowaitPercent: usage?.values.cpuIowaitPercent,
    load1: usage?.values.load1,
    load5: usage?.values.load5,
    load15: usage?.values.load15,
    memoryPercent: usage?.values.memoryUsedPercent,
    swapPercent: usage?.values.swapUsedPercent,
  }
}

function ServerUsageCell({
  usage,
  cpuCores,
}: Readonly<{
  usage: FleetServerUsageRecord | null
  cpuCores: number | null
}>) {
  return (
    <View style={[styles.tableCell, styles.colUsage]}>
      <ServerUsageBars density="list" cpuCores={cpuCores} {...usageBarMetrics(usage)} />
    </View>
  )
}

function ServerMeshCell({ overlayAddress }: Readonly<{ overlayAddress: string | null }>) {
  return (
    <View style={[styles.tableCell, styles.colMesh]}>
      <Text style={styles.meshText} numberOfLines={1}>
        {overlayAddress ?? '—'}
      </Text>
    </View>
  )
}

function OrgServerTableRow({
  orgId,
  server,
  rowIndex,
  isLast,
  selected,
  overlayAddress,
  usage,
  onToggleSelected,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  rowIndex: number
  isLast: boolean
  selected: boolean
  overlayAddress: string | null
  usage: FleetServerUsageRecord | null
  onToggleSelected: () => void
}>) {
  const router = useRouter()
  const [rowHovered, setRowHovered] = useState(false)

  return (
    <Pressable
      onPress={() => router.push(serverDetailHref(orgId, server.id))}
      onPointerEnter={() => setRowHovered(true)}
      onPointerLeave={() => setRowHovered(false)}
      style={({ pressed }) => [
        styles.tableRow,
        isLast ? styles.tableRowLast : null,
        rowIndex % 2 === 1 ? styles.tableRowEven : null,
        selected ? styles.tableRowSelected : null,
        rowHovered ? styles.tableRowHovered : null,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${serverTitle(server)}`}
    >
      <ServerNameCell server={server} />
      <ServerStatusCell server={server} />
      <ServerLocationCell server={server} />
      <ServerUsageCell usage={usage} cpuCores={serverCpuThreads(server)} />
      <ServerMeshCell overlayAddress={overlayAddress} />
      <View style={[styles.tableCell, styles.colCheck]}>
        <Checkbox
          checked={selected}
          onPress={onToggleSelected}
          accessibilityLabel={`Select ${serverTitle(server)}`}
        />
      </View>
    </Pressable>
  )
}

function OrgServerCompactRow({
  orgId,
  server,
  selected,
  overlayAddress,
  usage,
  onToggleSelected,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  selected: boolean
  overlayAddress: string | null
  usage: FleetServerUsageRecord | null
  onToggleSelected: () => void
}>) {
  const router = useRouter()

  return (
    <Pressable
      onPress={() => router.push(serverDetailHref(orgId, server.id))}
      style={({ pressed }) => [
        styles.compactRow,
        selected ? styles.tableRowSelected : null,
        pressed && styles.buttonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${serverTitle(server)}`}
    >
      <View style={styles.compactMain}>
        <View style={styles.compactIdentity}>
          <ServerHostIdentity server={server} />
          <View style={styles.compactMeta}>
            <ServerStatusBadge server={server} />
            <ServerCountryLine server={server} />
          </View>
        </View>
        <View style={styles.compactCheck}>
          <Checkbox
            checked={selected}
            onPress={onToggleSelected}
            accessibilityLabel={`Select ${serverTitle(server)}`}
          />
        </View>
      </View>
      <View style={styles.compactStats}>
        <ServerUsageBars
          density="list"
          cpuCores={serverCpuThreads(server)}
          {...usageBarMetrics(usage)}
        />
        <Text style={styles.meshText} numberOfLines={1}>
          {overlayAddress ?? '—'}
        </Text>
      </View>
    </Pressable>
  )
}

function ServersFleetCompactList({
  orgId,
  servers,
  selectedIds,
  meshOverlayByServer,
  usageByServerId,
  onToggleSelected,
}: Omit<ServersFleetViewProps, 'allSelected' | 'someSelected' | 'onToggleSelectAll'>) {
  return (
    <View style={styles.compactList}>
      {servers.map((server) => (
        <OrgServerCompactRow
          key={server.id}
          orgId={orgId}
          server={server}
          selected={selectedIds.has(server.id)}
          overlayAddress={meshOverlayByServer.get(server.id) ?? null}
          usage={usageByServerId.get(server.id) ?? null}
          onToggleSelected={() => onToggleSelected(server.id)}
        />
      ))}
    </View>
  )
}

function ServersFleetEmptyState() {
  return (
    <EmptyState
      panel
      title="Add your first server"
      hint="Use + Server to enroll a host and start deploying projects to your fleet."
    />
  )
}

type ServersFleetViewProps = Readonly<{
  orgId: string
  servers: readonly OrgServerRecord[]
  selectedIds: ReadonlySet<string>
  allSelected: boolean
  someSelected: boolean
  meshOverlayByServer: ReadonlyMap<string, string>
  usageByServerId: ReadonlyMap<string, FleetServerUsageRecord>
  onToggleSelectAll: () => void
  onToggleSelected: (serverId: string) => void
}>

function ServersFleetTable({
  orgId,
  servers,
  selectedIds,
  allSelected,
  someSelected,
  meshOverlayByServer,
  usageByServerId,
  onToggleSelectAll,
  onToggleSelected,
}: ServersFleetViewProps) {
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
            <Text style={styles.tableHeaderText}>Host</Text>
          </View>
          <View style={[styles.tableCell, styles.colStatus]}>
            <Text style={styles.tableHeaderText}>Status</Text>
          </View>
          <View style={[styles.tableCell, styles.colLocation]}>
            <Text style={styles.tableHeaderText}>Country</Text>
          </View>
          <View style={[styles.tableCell, styles.colUsage]}>
            <Text style={styles.tableHeaderText}>Usage</Text>
          </View>
          <View style={[styles.tableCell, styles.colMesh]}>
            <Text style={styles.tableHeaderText}>Mesh</Text>
          </View>
          <View style={[styles.tableCell, styles.colCheck]}>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onPress={onToggleSelectAll}
              accessibilityLabel="Select all servers"
            />
          </View>
        </View>
        {servers.map((server, index) => (
          <OrgServerTableRow
            key={server.id}
            orgId={orgId}
            server={server}
            rowIndex={index}
            isLast={index === servers.length - 1}
            selected={selectedIds.has(server.id)}
            overlayAddress={meshOverlayByServer.get(server.id) ?? null}
            usage={usageByServerId.get(server.id) ?? null}
            onToggleSelected={() => onToggleSelected(server.id)}
          />
        ))}
      </View>
    </ScrollView>
  )
}

function OrgServerTile({
  orgId,
  server,
  selected,
  overlayAddress,
  usage,
  onToggleSelected,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  selected: boolean
  overlayAddress: string | null
  usage: FleetServerUsageRecord | null
  onToggleSelected: () => void
}>) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)
  const status = resolveServerConnectionStatus(server)
  const title = serverTitle(server)

  return (
    <Pressable
      onPress={() => router.push(serverDetailHref(orgId, server.id))}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={({ pressed }) => [
        styles.tile,
        selected ? styles.tileSelected : null,
        hovered ? styles.tileHovered : null,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}, ${serverConnectionStatusLabel(status)}`}
    >
      <View style={styles.tileHeader}>
        <View style={styles.tileIdentity}>
          <ServerHostIdentity server={server} />
        </View>
        <View style={styles.tileCheck}>
          <Checkbox
            checked={selected}
            onPress={onToggleSelected}
            accessibilityLabel={`Select ${title}`}
          />
        </View>
      </View>
      <View style={styles.tileMeta}>
        <ServerStatusBadge server={server} />
        <ServerCountryLine server={server} />
      </View>
      <View style={styles.tileUsage}>
        <ServerUsageBars
          density="tile"
          cpuCores={serverCpuThreads(server)}
          {...usageBarMetrics(usage)}
        />
      </View>
      <Text style={styles.meshText} numberOfLines={1}>
        {overlayAddress ?? '—'}
      </Text>
    </Pressable>
  )
}

function ServersFleetTiles({
  orgId,
  servers,
  selectedIds,
  meshOverlayByServer,
  usageByServerId,
  onToggleSelected,
}: Omit<ServersFleetViewProps, 'allSelected' | 'someSelected' | 'onToggleSelectAll'>) {
  return (
    <View style={styles.tilesGrid}>
      {servers.map((server) => (
        <OrgServerTile
          key={server.id}
          orgId={orgId}
          server={server}
          selected={selectedIds.has(server.id)}
          overlayAddress={meshOverlayByServer.get(server.id) ?? null}
          usage={usageByServerId.get(server.id) ?? null}
          onToggleSelected={() => onToggleSelected(server.id)}
        />
      ))}
    </View>
  )
}

function ServersFleetDetailView({
  compactList,
  ...viewProps
}: ServersFleetViewProps & { compactList: boolean }) {
  if (compactList) {
    return <ServersFleetCompactList {...viewProps} />
  }
  return <ServersFleetTable {...viewProps} />
}

function ServersOverviewFleet({
  error,
  loading,
  serverCount,
  fleetSurface,
  compactChrome,
  fleetViewProps,
}: Readonly<{
  error: string | null
  loading: boolean
  serverCount: number
  fleetSurface: ReturnType<typeof resolveServersFleetSurface>
  compactChrome: boolean
  fleetViewProps: ServersFleetViewProps
}>) {
  return (
    <>
      {fleetSurface.showFleetPanel ? (
        <SectionPanel>
          {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
          {loading && serverCount === 0 ? <LoadingState label="Loading fleet…" /> : null}
          {!loading && serverCount === 0 ? <ServersFleetEmptyState /> : null}
          {fleetSurface.showDetailInPanel ? (
            <ServersFleetDetailView compactList={false} {...fleetViewProps} />
          ) : null}
        </SectionPanel>
      ) : null}
      {fleetSurface.showDetailFleet && compactChrome ? (
        <ServersFleetDetailView compactList {...fleetViewProps} />
      ) : null}
      {fleetSurface.showSummaryFleet ? <ServersFleetTiles {...fleetViewProps} /> : null}
    </>
  )
}

function indexUpdatesByServerId(
  entries: readonly ServerUpdateStatus[] | undefined,
): Map<string, ServerUpdateStatus> {
  const map = new Map<string, ServerUpdateStatus>()
  for (const entry of entries ?? []) {
    map.set(entry.serverId, entry)
  }
  return map
}

function collectTriggeringServerIds(
  pending: boolean,
  variables: readonly string[] | undefined,
  updates: readonly ServerUpdateStatus[] | undefined,
): Set<string> {
  const ids = new Set<string>()
  if (pending && variables) {
    for (const serverId of variables) {
      ids.add(serverId)
    }
  }
  for (const entry of updates ?? []) {
    if (entry.status === 'updating') {
      ids.add(entry.serverId)
    }
  }
  return ids
}

function countSelectedUpdatable(
  servers: readonly OrgServerRecord[],
  selectedIds: ReadonlySet<string>,
  updateByServerId: ReadonlyMap<string, ServerUpdateStatus>,
  triggeringServerIds: ReadonlySet<string>,
): number {
  let count = 0
  for (const server of servers) {
    if (
      selectedIds.has(server.id) &&
      isServerUpdatable(server, updateByServerId, triggeringServerIds)
    ) {
      count += 1
    }
  }
  return count
}

function toggleIdInSet(prev: Set<string>, serverId: string): Set<string> {
  const next = new Set(prev)
  if (next.has(serverId)) next.delete(serverId)
  else next.add(serverId)
  return next
}

export function ServersOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const canOwn = useCan('organization', orgId, 'organization:own')

  const fabricQuery = useOrgFabric(orgId)
  const meshOverlayByServer = overlayByServerId(fabricQuery.data?.relays ?? [])

  const serversQuery = useOrgServers(orgId, {
    staleTime: 0,
    refetchInterval: (query) =>
      serversPresenceRefetchMs({
        servers: query.state.data?.servers,
        idleMs: SERVERS_REFRESH_MS,
      }),
  })
  const updatesQuery = useServersUpdateStatus(orgId, { pollWhileUpdating: true })
  const capacityQuery = useOrgServerCapacity(orgId, { enabled: canOwn })
  const licensesQuery = useOrgLicenses(orgId, { enabled: canOwn })
  const fleetUsageQuery = useFleetServerUsage(orgId, {
    enabled: !serversQuery.isLoading,
  })
  const batchUpdateMutation = useBatchTriggerServerUpdates(orgId)

  usePullToRefresh(async () => {
    await Promise.all([
      serversQuery.refetch(),
      updatesQuery.refetch(),
      fleetUsageQuery.refetch(),
      fabricQuery.refetch(),
      ...(canOwn ? [capacityQuery.refetch(), licensesQuery.refetch()] : []),
    ])
  })

  const [showAddServerWizard, setShowAddServerWizard] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [serversLayout, setServersLayout] = useState<ServersLayout>(() =>
    getStoredServersLayout()
  )

  const handleLayoutChange = (next: ServersLayout): void => {
    setServersLayout(next)
    setStoredServersLayout(next)
  }

  const servers = orEmptyArray(serversQuery.data?.servers)
  const pendingKeyCount = unboundPendingKeys(
    licensesQuery.data?.licenses ?? [],
  ).length
  const loading = serversQuery.isLoading
  const error = serversQuery.isError
    ? serversRefreshErrorMessage(serversQuery.error, isForbiddenError(serversQuery.error))
    : null

  const usageByServerId = useMemo(
    () => indexFleetUsageByServerId(fleetUsageQuery.data?.servers),
    [fleetUsageQuery.data]
  )

  const addServerEligibility = useMemo(
    () => resolveServerAddEligibility(capacityQuery.isError ? undefined : capacityQuery.data),
    [capacityQuery.data, capacityQuery.isError]
  )

  const updateByServerId = useMemo(
    () => indexUpdatesByServerId(updatesQuery.data?.servers),
    [updatesQuery.data],
  )

  const triggeringServerIds = useMemo(
    () =>
      collectTriggeringServerIds(
        batchUpdateMutation.isPending,
        batchUpdateMutation.variables,
        updatesQuery.data?.servers,
      ),
    [batchUpdateMutation.isPending, batchUpdateMutation.variables, updatesQuery.data],
  )

  useEffect(() => {
    setSelectedIds((prev) => pruneSelectedServerIds(prev, servers))
  }, [servers])

  const handleTriggerSelectedUpdates = (): void => {
    const targets = servers.filter(
      (server) =>
        selectedIds.has(server.id) &&
        isServerUpdatable(server, updateByServerId, triggeringServerIds)
    )
    if (targets.length === 0) return
    batchUpdateMutation.mutate(targets.map((server) => server.id))
  }

  const selectedUpdatableCount = countSelectedUpdatable(
    servers,
    selectedIds,
    updateByServerId,
    triggeringServerIds,
  )

  const allSelected = servers.length > 0 && servers.every((server) => selectedIds.has(server.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(servers.map((server) => server.id)))
  }

  const toggleSelected = (serverId: string): void => {
    setSelectedIds((prev) => toggleIdInSet(prev, serverId))
  }

  const batchUpdating = batchUpdateMutation.isPending
  const anyUpdateInProgress = batchUpdating || triggeringServerIds.size > 0
  const compactChrome = usesCompactServersList(Platform.OS)
  const fleetSurface = resolveServersFleetSurface({
    layout: serversLayout,
    serverCount: servers.length,
    compactChrome,
    hasError: Boolean(error),
  })

  const fleetViewProps = {
    orgId,
    servers,
    selectedIds,
    allSelected,
    someSelected,
    meshOverlayByServer,
    usageByServerId,
    onToggleSelectAll: toggleSelectAll,
    onToggleSelected: toggleSelected,
  }

  const refreshServersList = (): void => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).servers.list,
    })
  }

  return (
    <View style={styles.root}>
      <View
        style={[styles.titleRow, selectedIds.size > 0 && styles.titleRowPinned]}
      >
        <Text
          style={[orgPanelStyles.pageTitle, styles.titleText]}
          numberOfLines={1}
        >
          Servers
        </Text>
        <ServersOverviewToolbar
          layout={serversLayout}
          onLayoutChange={handleLayoutChange}
          canOwn={canOwn}
          canManage={canManage}
          addServerEligibility={addServerEligibility}
          showAddServerWizard={showAddServerWizard}
          onAddServer={() => setShowAddServerWizard((open) => !open)}
          anyUpdateInProgress={anyUpdateInProgress}
          batchUpdating={batchUpdating}
          selectedCount={selectedIds.size}
          selectedUpdatableCount={selectedUpdatableCount}
          showSelectAll={fleetSurface.showToolbarSelectAll}
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleSelectAll={toggleSelectAll}
          onTriggerSelectedUpdates={handleTriggerSelectedUpdates}
          compactChrome={compactChrome}
        />
      </View>
      {canOwn && addServerEligibility.reason ? (
        <Text style={styles.capacityHint}>{addServerEligibility.reason}</Text>
      ) : null}
      {selectedIds.size > 0 ? (
        <Text style={styles.selectionHint}>
          {selectedIds.size} selected
          {selectedUpdatableCount > 0 ? ` · ${selectedUpdatableCount} updatable` : ''}
        </Text>
      ) : null}

      {canOwn ? <UnusedKeysHint orgId={orgId} count={pendingKeyCount} /> : null}

      {canOwn && showAddServerWizard ? (
        <AddServerWizard
          orgId={orgId}
          onComplete={() => {
            setShowAddServerWizard(false)
            refreshServersList()
          }}
          onDismiss={() => setShowAddServerWizard(false)}
        />
      ) : null}

      <ServersOverviewFleet
        error={error}
        loading={loading}
        serverCount={servers.length}
        fleetSurface={fleetSurface}
        compactChrome={compactChrome}
        fleetViewProps={fleetViewProps}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: Platform.OS === 'web' ? spacing.lg : spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  titleRowPinned: {
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 3,
          backgroundColor: colors.bg,
          paddingVertical: spacing.xs,
        } as unknown as ViewStyle)
      : null),
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? null : { fontSize: 22, lineHeight: 28 }),
  },
  toolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexGrow: 1,
    flexShrink: 1,
  },
  toolbarBtnCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 44,
  },
  layoutToggle: {
    flexWrap: 'nowrap',
    flexShrink: 0,
  },
  layoutChip: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionHint: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
    textAlign: 'right',
  },
  capacityHint: {
    color: colors.pending,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  unusedKeysLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  unusedKeysLinkText: {
    color: chrome.accent,
    fontSize: 13,
    fontWeight: '600',
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
    minWidth: 900,
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
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableRowEven: {
    backgroundColor: colors.bgInset,
  },
  tableRowHovered: {
    backgroundColor: colors.bgSecondary,
  },
  tableRowSelected: {
    backgroundColor: chrome.bgActive,
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
    flex: 2.6,
    minWidth: 220,
    gap: 2,
  },
  colStatus: {
    flex: 1.1,
    minWidth: 110,
    gap: 4,
    alignItems: 'flex-start',
  },
  colLocation: {
    flex: 1.4,
    minWidth: 130,
    alignItems: 'flex-start',
  },
  colUsage: {
    flex: 1.6,
    minWidth: 148,
    alignItems: 'flex-start',
  },
  colMesh: {
    flex: 1.1,
    minWidth: 110,
    alignItems: 'flex-start',
  },
  meshText: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  locationFlag: {
    fontSize: 14,
    lineHeight: 16,
  },
  locationText: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  locationMuted: {
    color: colors.textDim,
    fontSize: 12,
  },
  colCheck: {
    width: 40,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
  },
  nameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameText: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  hostnameSubtext: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
    flexShrink: 1,
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
    overflow: 'visible',
  },
  statusOnline: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  statusInitializing: {
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
  },
  statusOffline: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusTextOnline: {
    color: colors.accent,
  },
  statusTextInitializing: {
    color: colors.pending,
  },
  statusTextOffline: {
    color: colors.textDim,
  },
  checkboxHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactList: {
    alignSelf: 'stretch',
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  compactRow: {
    alignSelf: 'stretch',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  compactMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  compactIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  compactMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactCheck: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${SERVERS_TILE_MIN_WIDTH}px, 1fr))`,
        } as unknown as ViewStyle)
      : null),
  },
  tile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgArea,
    padding: spacing.md,
    gap: spacing.sm,
    minWidth: 160,
    ...(Platform.OS === 'web'
      ? null
      : {
          flexGrow: 1,
          flexBasis: SERVERS_TILE_MIN_WIDTH,
        }),
  },
  tileHovered: {
    backgroundColor: colors.bgSecondary,
  },
  tileSelected: {
    backgroundColor: chrome.bgActive,
    borderColor: chrome.accent,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  tileCheck: {
    paddingTop: 2,
  },
  tileMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tileUsage: {
    backgroundColor: colors.bgInset,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
})
