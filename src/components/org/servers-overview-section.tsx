import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { ConnectionStatusDot } from '@/components/org/connection-status-dot'
import { SectionPanel } from '@/components/org/section-panel'
import { AddServerWizard } from '@/components/org/add-server-wizard'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  isForbiddenError,
  type FleetServerUsageRecord,
  type OrgServerRecord,
  type RelayRecord,
  type ServerOsLogoKey,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { serverDetailHref } from '@/lib/org-navigation'
import {
  useBatchTriggerServerUpdates,
  useFleetServerUsage,
  useOrgServerCapacity,
  useOrgServers,
  useServersUpdateStatus,
  SERVERS_REFRESH_MS,
} from '@/lib/queries/servers'
import { useOrgFabric } from '@/lib/queries/fabric'
import { useCan, queryKeys } from '@/lib/query-client'
import { useAuth } from '@/lib/auth-context'
import { resolveServerAddEligibility } from '@/lib/server-add-eligibility'
import {
  resolveServerConnectionStatus,
  serverConnectionStatusLabel,
  serversPresenceRefetchMs,
  type ServerConnectionStatus,
} from '@/lib/server-connection-status'
import { osLogoSource } from '@/lib/os-logos'
import { formatServerOsProductName } from '@/lib/server-os-display'
import {
  countryCodeToFlagEmoji,
  formatServerGeoCountryName,
} from '@/lib/server-geo'
import { chrome, colors, spacing } from '@/lib/theme'
import { ServerUsageBars } from '@/components/org/server-usage-bars'

/** Group TurboFabric tp0 addresses by server — O(1) page-level fan-in. */
function overlayByServerId(
  relays: readonly Pick<RelayRecord, 'serverId' | 'address'>[],
): Map<string, string> {
  const result = new Map<string, string>()
  for (const relay of relays) {
    result.set(relay.serverId, relay.address)
  }
  return result
}

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function checkboxMark(checked: boolean, indeterminate: boolean) {
  if (indeterminate) {
    return <Text style={styles.checkboxMark}>−</Text>
  }
  if (checked) {
    return <Text style={styles.checkboxMark}>✓</Text>
  }
  return null
}

function resolveOsLogoKey(server: OrgServerRecord): ServerOsLogoKey | null {
  if (server.osLogo) return server.osLogo
  const id = server.os?.id?.toLowerCase()
  if (server.os?.variant === 'raspberry-pi-os') return 'raspberry-pi-os'
  if (id === 'debian') return 'debian'
  return null
}

function isColocatedServer(
  server: OrgServerRecord,
  updateData?: ServerUpdateStatus | null,
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
  triggeringServerIds: ReadonlySet<string>,
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

function selectedUpdateButtonLabel(
  batchUpdating: boolean,
  selectedUpdatableCount: number,
): string {
  if (batchUpdating) return 'Updating…'
  if (selectedUpdatableCount > 0) return `Update (${selectedUpdatableCount})`
  return 'Update'
}

function pruneSelectedServerIds(
  prev: Set<string>,
  servers: readonly OrgServerRecord[],
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

function averageFinite(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

function formatAvgPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function formatSiBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = value
  let unit = 0
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024
    unit += 1
  }
  if (unit === 0) return `${Math.round(n)} ${units[unit]}`
  let digits = 2
  if (n >= 100) digits = 0
  else if (n >= 10) digits = 1
  return `${n.toFixed(digits)} ${units[unit]}`
}

function formatCoresTotal(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function pushFinitePercent(
  target: number[],
  value: number | null | undefined,
): void {
  if (value != null && Number.isFinite(value)) target.push(value)
}

function memoryTotalFromUsage(
  usage: FleetServerUsageRecord | undefined,
): number | null {
  if (!usage || usage.sampleCount <= 0) return null
  const used = usage.values.memoryUsedBytes
  const available = usage.values.memoryAvailableBytes
  if (
    used == null ||
    available == null ||
    !Number.isFinite(used) ||
    !Number.isFinite(available)
  ) {
    return null
  }
  const total = used + available
  return total > 0 ? total : null
}

/** Physical cores for inventory totals; falls back to threads when unknown. */
function serverInventoryCpuCores(server: OrgServerRecord): number | null {
  const cores = server.resources?.cpu?.coreCount
  if (cores != null && Number.isFinite(cores) && cores > 0) return cores
  return serverCpuThreads(server)
}

/** Logical CPUs for load-average bars (`load / threads`). */
function serverCpuThreads(server: OrgServerRecord): number | null {
  const threads = server.resources?.cpu?.threadCount
  if (threads != null && Number.isFinite(threads) && threads > 0) return threads
  const cores = server.resources?.cpu?.coreCount
  if (cores != null && Number.isFinite(cores) && cores > 0) return cores
  return null
}

function serverMemoryTotal(
  server: OrgServerRecord,
  usage: FleetServerUsageRecord | undefined,
): number | null {
  const fromResources = server.resources?.memory?.totalBytes
  if (
    fromResources != null &&
    Number.isFinite(fromResources) &&
    fromResources > 0
  ) {
    return fromResources
  }
  return memoryTotalFromUsage(usage)
}

function serverSwapTotal(server: OrgServerRecord): number | null {
  const swap = server.resources?.swap?.totalBytes
  if (swap == null || !Number.isFinite(swap) || swap < 0) return null
  return swap
}

function computeFleetAverages(
  servers: readonly OrgServerRecord[],
  usageByServerId: ReadonlyMap<string, FleetServerUsageRecord>,
): { avgCpu: number | null; avgMemory: number | null } {
  const cpu: number[] = []
  const memory: number[] = []
  for (const server of servers) {
    const usage = usageByServerId.get(server.id)
    if (!usage || usage.sampleCount <= 0) continue
    pushFinitePercent(cpu, usage.values.cpuUsagePercent)
    pushFinitePercent(memory, usage.values.memoryUsedPercent)
  }
  return {
    avgCpu: averageFinite(cpu),
    avgMemory: averageFinite(memory),
  }
}

function computeFleetCapacityTotals(
  servers: readonly OrgServerRecord[],
  usageByServerId: ReadonlyMap<string, FleetServerUsageRecord>,
): {
  totalCores: number | null
  totalMemoryBytes: number | null
  totalSwapBytes: number | null
} {
  let cores = 0
  let coresKnown = false
  let memory = 0
  let memoryKnown = false
  let swap = 0
  let swapKnown = false

  for (const server of servers) {
    const c = serverInventoryCpuCores(server)
    if (c != null) {
      cores += c
      coresKnown = true
    }
    const mem = serverMemoryTotal(server, usageByServerId.get(server.id))
    if (mem != null) {
      memory += mem
      memoryKnown = true
    }
    const sw = serverSwapTotal(server)
    if (sw != null) {
      swap += sw
      swapKnown = true
    }
  }

  return {
    totalCores: coresKnown ? cores : null,
    totalMemoryBytes: memoryKnown ? memory : null,
    totalSwapBytes: swapKnown ? swap : null,
  }
}

function usageByServerIdMap(
  rows: readonly FleetServerUsageRecord[] | undefined,
): Map<string, FleetServerUsageRecord> {
  const map = new Map<string, FleetServerUsageRecord>()
  for (const entry of rows ?? []) {
    map.set(entry.serverId, entry)
  }
  return map
}

function FleetInventoryTotals({
  inventoryCount,
  totalCores,
  totalMemoryBytes,
  totalSwapBytes,
  avgCpu,
  avgMemory,
}: Readonly<{
  inventoryCount: number
  totalCores: number | null
  totalMemoryBytes: number | null
  totalSwapBytes: number | null
  avgCpu: number | null
  avgMemory: number | null
}>) {
  const serverLabel = inventoryCount === 1 ? 'server' : 'servers'
  const a11y = [
    `${inventoryCount} ${serverLabel}`,
    `total ${formatCoresTotal(totalCores)} cores`,
    `total ${formatSiBytes(totalMemoryBytes)} RAM`,
    `total ${formatSiBytes(totalSwapBytes)} swap`,
    `average CPU ${formatAvgPercent(avgCpu)}`,
    `average memory ${formatAvgPercent(avgMemory)}`,
  ].join(', ')

  return (
    <View style={styles.totalsStrip} accessibilityLabel={a11y}>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsValue}>{inventoryCount}</Text>
        <Text style={styles.totalsLabel}> in inventory</Text>
      </Text>
      <Text style={styles.totalsSep}>·</Text>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsLabel}>Cores </Text>
        <Text style={styles.totalsValue}>{formatCoresTotal(totalCores)}</Text>
      </Text>
      <Text style={styles.totalsSep}>·</Text>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsLabel}>RAM </Text>
        <Text style={styles.totalsValue}>
          {formatSiBytes(totalMemoryBytes)}
        </Text>
      </Text>
      <Text style={styles.totalsSep}>·</Text>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsLabel}>Swap </Text>
        <Text style={styles.totalsValue}>{formatSiBytes(totalSwapBytes)}</Text>
      </Text>
      <Text style={styles.totalsSep}>·</Text>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsLabel}>Avg CPU </Text>
        <Text style={styles.totalsValue}>{formatAvgPercent(avgCpu)}</Text>
      </Text>
      <Text style={styles.totalsSep}>·</Text>
      <Text style={styles.totalsItem}>
        <Text style={styles.totalsLabel}>Avg memory </Text>
        <Text style={styles.totalsValue}>{formatAvgPercent(avgMemory)}</Text>
      </Text>
    </View>
  )
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onPress,
  accessibilityLabel,
  stopPropagation,
}: Readonly<{
  checked: boolean
  indeterminate?: boolean
  onPress: () => void
  accessibilityLabel: string
  stopPropagation?: boolean
}>) {
  return (
    <Pressable
      onPress={(event) => {
        if (stopPropagation && 'stopPropagation' in event) {
          ;(event as { stopPropagation?: () => void }).stopPropagation?.()
        }
        onPress()
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={styles.checkboxHit}
    >
      <View
        style={[
          styles.checkbox,
          (checked || indeterminate) && styles.checkboxChecked,
        ]}
      >
        {checkboxMark(checked, indeterminate)}
      </View>
    </Pressable>
  )
}

function ServersOverviewToolbar({
  canOwn,
  canManage,
  addServerEligibility,
  showAddServerWizard,
  onAddServer,
  anyUpdateInProgress,
  batchUpdating,
  selectedCount,
  selectedUpdatableCount,
  onTriggerSelectedUpdates,
}: Readonly<{
  canOwn: boolean
  canManage: boolean
  addServerEligibility: ReturnType<typeof resolveServerAddEligibility>
  showAddServerWizard: boolean
  onAddServer: () => void
  anyUpdateInProgress: boolean
  batchUpdating: boolean
  selectedCount: number
  selectedUpdatableCount: number
  onTriggerSelectedUpdates: () => void
}>) {
  if (!canOwn && !canManage) return null

  const addDisabled = !addServerEligibility.canAdd || showAddServerWizard
  const updateDisabled =
    anyUpdateInProgress || batchUpdating || selectedUpdatableCount === 0

  return (
    <View
      style={[
        styles.toolbarWrap,
        selectedCount > 0 && styles.toolbarWrapPinned,
      ]}
    >
      <View style={styles.toolbarRow}>
        {canOwn ? (
          <Pressable
            style={({ pressed }) => [
              orgPanelStyles.toolbarBtnPrimary,
              addDisabled && styles.buttonDisabled,
              pressed && !addDisabled && styles.buttonPressed,
              webPointer,
            ]}
            disabled={addDisabled}
            onPress={onAddServer}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>+ Server</Text>
          </Pressable>
        ) : null}
        {canManage ? (
          <TouchableOpacity
            style={[
              orgPanelStyles.toolbarBtnSecondary,
              updateDisabled && styles.buttonDisabled,
            ]}
            onPress={onTriggerSelectedUpdates}
            disabled={updateDisabled}
          >
            {batchUpdating ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : null}
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              {selectedUpdateButtonLabel(batchUpdating, selectedUpdatableCount)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {canOwn && addServerEligibility.reason ? (
        <Text style={styles.capacityHint}>{addServerEligibility.reason}</Text>
      ) : null}
      {selectedCount > 0 ? (
        <Text style={styles.selectionHint}>
          {selectedCount} selected
          {selectedUpdatableCount > 0
            ? ` · ${selectedUpdatableCount} updatable`
            : ''}
        </Text>
      ) : null}
    </View>
  )
}

function ServerNameCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  const osProduct =
    formatServerOsProductName(server.os, server.osDisplay) ?? '—'
  const logo = osLogoSource(resolveOsLogoKey(server))
  const title = serverTitle(server)
  const hostname = server.hostname?.trim()
  const showHostname =
    hostname != null && hostname.length > 0 && hostname !== title

  return (
    <View style={[styles.tableCell, styles.colName]}>
      <View style={styles.nameButton}>
        {logo ? (
          <Image
            source={logo}
            style={styles.osLogoBesideName as ImageStyle}
            contentFit="contain"
            accessibilityLabel={osProduct === '—' ? 'OS' : osProduct}
          />
        ) : null}
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

function ServerStatusCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  const status = resolveServerConnectionStatus(server)
  const label = serverConnectionStatusLabel(status)
  const tone = serverStatusBadgeStyles(status)

  return (
    <View style={[styles.tableCell, styles.colStatus]}>
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
    </View>
  )
}

function ServerLocationCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  const flag = countryCodeToFlagEmoji(server.geo?.country)
  const country = formatServerGeoCountryName(server.geo)

  if (!country && !flag) {
    return (
      <View style={[styles.tableCell, styles.colLocation]}>
        <Text style={styles.locationMuted}>—</Text>
      </View>
    )
  }

  return (
    <View style={[styles.tableCell, styles.colLocation]}>
      <View style={styles.locationRow}>
        {flag ? <Text style={styles.locationFlag}>{flag}</Text> : null}
        <Text style={styles.locationText} numberOfLines={1}>
          {country || '—'}
        </Text>
      </View>
    </View>
  )
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
      <ServerUsageBars
        cpuUsagePercent={usage?.values.cpuUsagePercent}
        cpuUserPercent={usage?.values.cpuUserPercent}
        cpuSystemPercent={usage?.values.cpuSystemPercent}
        cpuIowaitPercent={usage?.values.cpuIowaitPercent}
        load1={usage?.values.load1}
        load5={usage?.values.load5}
        load15={usage?.values.load15}
        cpuCores={cpuCores}
        memoryPercent={usage?.values.memoryUsedPercent}
        swapPercent={usage?.values.swapUsedPercent}
      />
    </View>
  )
}

function ServerMeshCell({
  overlayAddress,
}: Readonly<{ overlayAddress: string | null }>) {
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
  selected,
  overlayAddress,
  usage,
  onToggleSelected,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  rowIndex: number
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
      <ServerUsageCell
        usage={usage}
        cpuCores={serverCpuThreads(server)}
      />
      <ServerMeshCell overlayAddress={overlayAddress} />
      <Pressable
        onPress={(event) => {
          event.stopPropagation?.()
          onToggleSelected()
        }}
        style={[styles.tableCell, styles.colCheck]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`Select ${serverTitle(server)}`}
        hitSlop={8}
      >
        <View
          style={[styles.checkbox, selected && styles.checkboxChecked]}
        >
          {checkboxMark(selected, false)}
        </View>
      </Pressable>
    </Pressable>
  )
}

function ServersFleetEmptyState({
  controlPlaneRuntime,
}: Readonly<{ controlPlaneRuntime: string | null | undefined }>) {
  const waiting = controlPlaneRuntime === 'deno'
  return (
    <View style={orgPanelStyles.statePanel}>
      <Text style={orgPanelStyles.statePanelTitle}>
        {waiting ? 'Waiting for this server' : 'No servers yet'}
      </Text>
      <Text style={orgPanelStyles.muted}>
        {waiting
          ? 'The colocated host is registering with the control plane. This page refreshes automatically.'
          : 'Add a host to start deploying projects to your fleet.'}
      </Text>
    </View>
  )
}

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
}: Readonly<{
  orgId: string
  servers: readonly OrgServerRecord[]
  selectedIds: ReadonlySet<string>
  allSelected: boolean
  someSelected: boolean
  meshOverlayByServer: ReadonlyMap<string, string>
  usageByServerId: ReadonlyMap<string, FleetServerUsageRecord>
  onToggleSelectAll: () => void
  onToggleSelected: (serverId: string) => void
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
            <SelectionCheckbox
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

export function ServersOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const { controlPlaneRuntime } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const canOwn = useCan('organization', orgId, 'organization:own')

  const fabricQuery = useOrgFabric(orgId)
  const meshOverlayByServer = overlayByServerId(fabricQuery.data?.relays ?? [])

  const serversQuery = useOrgServers(orgId, {
    staleTime: 0,
    refetchInterval: (query) =>
      serversPresenceRefetchMs({
        controlPlaneRuntime,
        servers: query.state.data?.servers,
        idleMs: SERVERS_REFRESH_MS,
      }),
  })
  const updatesQuery = useServersUpdateStatus(orgId, { pollWhileUpdating: true })
  const capacityQuery = useOrgServerCapacity(orgId, { enabled: canOwn })
  const fleetUsageQuery = useFleetServerUsage(orgId, {
    enabled: !serversQuery.isLoading,
  })
  const batchUpdateMutation = useBatchTriggerServerUpdates(orgId)

  const [showAddServerWizard, setShowAddServerWizard] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const servers = serversQuery.data?.servers ?? []
  const loading = serversQuery.isLoading
  const error = serversQuery.isError
    ? serversRefreshErrorMessage(
        serversQuery.error,
        isForbiddenError(serversQuery.error),
      )
    : null

  const usageByServerId = useMemo(
    () => usageByServerIdMap(fleetUsageQuery.data?.servers),
    [fleetUsageQuery.data],
  )

  const fleetAverages = useMemo(
    () => computeFleetAverages(servers, usageByServerId),
    [servers, usageByServerId],
  )

  const fleetCapacity = useMemo(
    () => computeFleetCapacityTotals(servers, usageByServerId),
    [servers, usageByServerId],
  )

  const addServerEligibility = useMemo(
    () =>
      resolveServerAddEligibility(
        capacityQuery.isError ? undefined : capacityQuery.data,
      ),
    [capacityQuery.data, capacityQuery.isError],
  )

  const updateByServerId = useMemo(() => {
    const map = new Map<string, ServerUpdateStatus>()
    for (const entry of updatesQuery.data?.servers ?? []) {
      map.set(entry.serverId, entry)
    }
    return map
  }, [updatesQuery.data])

  const triggeringServerIds = useMemo(() => {
    const ids = new Set<string>()
    if (batchUpdateMutation.isPending && batchUpdateMutation.variables) {
      for (const serverId of batchUpdateMutation.variables) {
        ids.add(serverId)
      }
    }
    for (const entry of updatesQuery.data?.servers ?? []) {
      if (entry.status === 'updating') {
        ids.add(entry.serverId)
      }
    }
    return ids
  }, [
    batchUpdateMutation.isPending,
    batchUpdateMutation.variables,
    updatesQuery.data,
  ])

  useEffect(() => {
    setSelectedIds((prev) => pruneSelectedServerIds(prev, servers))
  }, [servers])

  const handleTriggerSelectedUpdates = (): void => {
    const targets = servers.filter(
      (server) =>
        selectedIds.has(server.id) &&
        isServerUpdatable(server, updateByServerId, triggeringServerIds),
    )
    if (targets.length === 0) return
    batchUpdateMutation.mutate(targets.map((server) => server.id))
  }

  const selectedUpdatableCount = servers.filter(
    (server) =>
      selectedIds.has(server.id) &&
      isServerUpdatable(server, updateByServerId, triggeringServerIds),
  ).length

  const allSelected =
    servers.length > 0 && servers.every((server) => selectedIds.has(server.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(servers.map((server) => server.id)))
  }

  const toggleSelected = (serverId: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(serverId)) next.delete(serverId)
      else next.add(serverId)
      return next
    })
  }

  const batchUpdating = batchUpdateMutation.isPending
  const anyUpdateInProgress =
    batchUpdating || triggeringServerIds.size > 0

  const refreshServersList = (): void => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).servers.list,
    })
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Servers overview</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Select hosts to update, or open a server for its control panel.
      </Text>

      {!loading || servers.length > 0 ? (
        <FleetInventoryTotals
          inventoryCount={servers.length}
          totalCores={fleetCapacity.totalCores}
          totalMemoryBytes={fleetCapacity.totalMemoryBytes}
          totalSwapBytes={fleetCapacity.totalSwapBytes}
          avgCpu={fleetAverages.avgCpu}
          avgMemory={fleetAverages.avgMemory}
        />
      ) : null}

      <SectionPanel>
        <ServersOverviewToolbar
          canOwn={canOwn}
          canManage={canManage}
          addServerEligibility={addServerEligibility}
          showAddServerWizard={showAddServerWizard}
          onAddServer={() => setShowAddServerWizard(true)}
          anyUpdateInProgress={anyUpdateInProgress}
          batchUpdating={batchUpdating}
          selectedCount={selectedIds.size}
          selectedUpdatableCount={selectedUpdatableCount}
          onTriggerSelectedUpdates={handleTriggerSelectedUpdates}
        />
        {canOwn && !addServerEligibility.canAdd && addServerEligibility.reason ? (
          <Text style={orgPanelStyles.muted}>{addServerEligibility.reason}</Text>
        ) : null}
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

        {loading && servers.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={orgPanelStyles.muted}>Loading fleet…</Text>
          </View>
        ) : null}

        {!loading && servers.length === 0 ? (
          <ServersFleetEmptyState controlPlaneRuntime={controlPlaneRuntime} />
        ) : null}

        {servers.length > 0 ? (
          <ServersFleetTable
            orgId={orgId}
            servers={servers}
            selectedIds={selectedIds}
            allSelected={allSelected}
            someSelected={someSelected}
            meshOverlayByServer={meshOverlayByServer}
            usageByServerId={usageByServerId}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelected={toggleSelected}
          />
        ) : null}
      </SectionPanel>

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
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  toolbarWrap: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  toolbarWrapPinned: {
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 3,
          backgroundColor: colors.bgArea,
          paddingTop: spacing.xs,
        } as unknown as ViewStyle)
      : null),
    borderBottomColor: chrome.accent,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  selectionHint: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  capacityHint: {
    color: colors.pending,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
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
    minWidth: 980,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    overflow: 'hidden',
  },
  totalsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  totalsItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  totalsValue: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  totalsLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  totalsSep: {
    color: colors.textFaint,
    fontSize: 13,
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
    flex: 2.2,
    minWidth: 210,
    alignItems: 'stretch',
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
  osLogoBesideName: {
    width: 18,
    height: 24,
    flexShrink: 0,
    alignSelf: 'center',
    marginRight: spacing.xs,
    opacity: 0.9,
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
    padding: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  checkboxMark: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
})
