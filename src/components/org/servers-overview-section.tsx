import { useEffect, useState } from 'react'
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
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { AddServerWizard } from '@/components/org/add-server-wizard'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchIps,
  fetchOrgServerCapacity,
  fetchOrgServers,
  fetchServersUpdateStatus,
  fetchVpns,
  isForbiddenError,
  triggerServerUpdate,
  type IpRecord,
  type OrgServerRecord,
  type ServerOsLogoKey,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { serverDetailHref } from '@/lib/org-navigation'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { resolveServerAddEligibility } from '@/lib/server-add-eligibility'
import { osLogoSource } from '@/lib/os-logos'
import { formatServerOsProductName } from '@/lib/server-os-display'
import { countryCodeToFlagEmoji } from '@/lib/server-geo'
import { colors, spacing } from '@/lib/theme'

/** Group VPN-scope overlay addresses by server — O(1) page-level fan-in. */
function overlayByServerId(
  ips: readonly IpRecord[],
  vpnIds: ReadonlySet<string>,
): Map<string, string> {
  const grouped = new Map<string, string[]>()
  for (const ip of ips) {
    if (!ip.serverId || !ip.vpnId || !vpnIds.has(ip.vpnId)) continue
    const list = grouped.get(ip.serverId) ?? []
    list.push(ip.address)
    grouped.set(ip.serverId, list)
  }
  const result = new Map<string, string>()
  for (const [serverId, addresses] of grouped) {
    addresses.sort((a, b) => a.localeCompare(b))
    result.set(serverId, addresses.join(', '))
  }
  return result
}

type UpdateState = {
  loading: boolean
  triggering: boolean
  data: ServerUpdateStatus | null
  error: string | null
}

const SERVERS_REFRESH_MS = 30_000
const UPDATE_PROGRESS_POLL_MS = 5_000

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
  updateStates: Map<string, UpdateState>,
): boolean {
  const state = updateStates.get(server.id)
  return (
    server.connected &&
    !isColocatedServer(server, state?.data) &&
    state?.data?.targetStatus === 'ok' &&
    state.data.updateAvailable === true &&
    !state.triggering &&
    state.data.status !== 'updating'
  )
}

function isTerminalUpdateState(status: ServerUpdateStatus): boolean {
  if (status.updateBlocked) return true
  if (status.status === 'error') return true
  if (status.status === 'updating') return false
  if (status.targetStatus === 'unknown') return true
  if (!status.updateAvailable) return true
  if (
    status.current?.commit &&
    status.target?.commit &&
    status.current.commit === status.target.commit
  ) {
    return true
  }
  return status.status === 'idle'
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
            style={styles.osLogoBesideName}
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

function ServerStatusCell({ server }: Readonly<{ server: OrgServerRecord }>) {
  const flag = countryCodeToFlagEmoji(server.geo?.country)

  if (!server.connected) {
    return (
      <View style={[styles.tableCell, styles.colStatus]}>
        <View style={[styles.statusBadge, styles.statusOffline]}>
          <View style={[styles.statusDot, styles.statusDotOffline]} />
          <Text style={[styles.statusText, styles.statusTextOffline]}>
            Offline
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.tableCell, styles.colStatus]}>
      <View style={[styles.statusBadge, styles.statusOnline]}>
        <View style={[styles.statusDot, styles.statusDotOnline]} />
        <Text style={[styles.statusText, styles.statusTextOnline]}>Online</Text>
        {flag ? <Text style={styles.statusFlag}>{flag}</Text> : null}
      </View>
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
  onToggleSelected,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  rowIndex: number
  selected: boolean
  overlayAddress: string | null
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

export function ServersOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const canOwn = useCan('organization', orgId, 'organization:own')

  const vpnIpsQuery = useQuery({
    queryKey: ['org', orgId, 'ips', { scope: 'vpn' }],
    queryFn: () => fetchIps({ scope: 'vpn' }),
  })
  const vpnsQuery = useQuery({
    queryKey: ['org', orgId, 'vpns'],
    queryFn: fetchVpns,
  })
  useForbiddenRecovery(vpnIpsQuery.error)
  useForbiddenRecovery(vpnsQuery.error)

  const meshOverlayByServer = overlayByServerId(
    vpnIpsQuery.data?.ips ?? [],
    new Set((vpnsQuery.data?.vpns ?? []).map((vpn) => vpn.id)),
  )

  const [showAddServerWizard, setShowAddServerWizard] = useState(false)
  const [addServerEligibility, setAddServerEligibility] = useState(() =>
    resolveServerAddEligibility(),
  )
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateStates, setUpdateStates] = useState<Map<string, UpdateState>>(
    new Map(),
  )
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const mergeUpdateEntry = (
    prev: Map<string, UpdateState>,
    serverId: string,
    data: ServerUpdateStatus,
    options?: { preserveTriggering?: boolean },
  ): Map<string, UpdateState> => {
    const current = prev.get(serverId)
    const preserveTriggering =
      options?.preserveTriggering &&
      (current?.triggering ?? false) &&
      !isTerminalUpdateState(data)
    return new Map(prev).set(serverId, {
      loading: false,
      triggering: preserveTriggering || data.status === 'updating',
      data,
      error: null,
    })
  }

  const loadAllUpdateData = async (
    serverIds: string[],
    options?: { silent?: boolean },
  ): Promise<void> => {
    if (serverIds.length === 0) return

    if (!options?.silent) {
      setUpdateStates((prev) => {
        let next = prev
        for (const serverId of serverIds) {
          const current = prev.get(serverId)
          next = new Map(next).set(serverId, {
            loading: true,
            triggering: current?.triggering ?? false,
            data: current?.data ?? null,
            error: null,
          })
        }
        return next
      })
    }

    try {
      const batch = await fetchServersUpdateStatus()
      setUpdateStates((prev) => {
        let next = prev
        for (const entry of batch.servers) {
          if (!serverIds.includes(entry.serverId)) continue
          next = mergeUpdateEntry(next, entry.serverId, entry, {
            preserveTriggering: options?.silent,
          })
        }
        return next
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      if (!options?.silent) {
        const message =
          err instanceof Error ? err.message : 'Failed to load update status'
        setUpdateStates((prev) => {
          let next = prev
          for (const serverId of serverIds) {
            const current = prev.get(serverId)
            next = new Map(next).set(serverId, {
              loading: false,
              triggering: current?.triggering ?? false,
              data: current?.data ?? null,
              error: message,
            })
          }
          return next
        })
      }
    }
  }

  const handleTriggerSelectedUpdates = async (): Promise<void> => {
    const targets = servers.filter(
      (server) =>
        selectedIds.has(server.id) && isServerUpdatable(server, updateStates),
    )
    if (targets.length === 0) return

    setBatchUpdating(true)
    setUpdateStates((prev) => {
      let next = prev
      for (const server of targets) {
        const current = prev.get(server.id)
        next = new Map(next).set(server.id, {
          loading: current?.loading ?? false,
          triggering: true,
          data: current?.data ?? null,
          error: null,
        })
      }
      return next
    })

    try {
      const results = await Promise.allSettled(
        targets.map((server) => triggerServerUpdate(server.id)),
      )

      let sawForbidden = false
      setUpdateStates((prev) => {
        let next = prev
        for (let index = 0; index < targets.length; index++) {
          const server = targets[index]
          const result = results[index]
          const current = prev.get(server.id)
          if (result.status === 'fulfilled') {
            next = new Map(next).set(server.id, {
              loading: current?.loading ?? false,
              triggering: true,
              data: current?.data ?? null,
              error: null,
            })
            continue
          }
          const reason = result.reason
          if (isForbiddenError(reason)) {
            sawForbidden = true
          }
          const message =
            reason instanceof Error ? reason.message : 'Failed to trigger update'
          next = new Map(next).set(server.id, {
            loading: false,
            triggering: false,
            data: current?.data ?? null,
            error: message,
          })
        }
        return next
      })

      if (sawForbidden) {
        await handleUnauthorized()
      }

      const anySucceeded = results.some((result) => result.status === 'fulfilled')
      if (anySucceeded) {
        void loadAllUpdateData(
          targets.map((server) => server.id),
          { silent: true },
        )
      }
    } finally {
      setBatchUpdating(false)
    }
  }

  const refreshServers = async (options?: {
    silent?: boolean
    isCancelled?: () => boolean
  }): Promise<void> => {
    const cancelled = (): boolean => options?.isCancelled?.() === true
    if (!options?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await fetchOrgServers()
      if (cancelled()) return
      setServers(result.servers)
      setSelectedIds((prev) => pruneSelectedServerIds(prev, result.servers))
    } catch (err) {
      if (cancelled()) return
      const forbidden = isForbiddenError(err)
      if (forbidden) await handleUnauthorized()
      if (forbidden || !options?.silent) {
        setError(serversRefreshErrorMessage(err, forbidden))
      }
    } finally {
      if (!options?.silent && !cancelled()) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    void refreshServers({ isCancelled: () => cancelled })
    const timer = setInterval(
      () => void refreshServers({ silent: true, isCancelled: () => cancelled }),
      SERVERS_REFRESH_MS,
    )
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, handleUnauthorized])

  useEffect(() => {
    if (!canOwn) return
    let cancelled = false
    void fetchOrgServerCapacity(orgId)
      .then((capacity) => {
        if (cancelled) return
        setAddServerEligibility(resolveServerAddEligibility(capacity))
      })
      .catch(async (err) => {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        // Fail open for the display hint — POST /licenses still enforces.
        setAddServerEligibility(resolveServerAddEligibility())
      })
    return () => {
      cancelled = true
    }
  }, [canOwn, orgId, handleUnauthorized, servers.length])

  useEffect(() => {
    const pendingIds = servers
      .map((server) => server.id)
      .filter((serverId) => !updateStates.has(serverId))
    if (pendingIds.length === 0) return
    void loadAllUpdateData(pendingIds, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers])

  useEffect(() => {
    const inProgressIds = [...updateStates.entries()]
      .filter(([, state]) => state.triggering || state.data?.status === 'updating')
      .map(([serverId]) => serverId)
    if (inProgressIds.length === 0) return

    const timer = setInterval(() => {
      void loadAllUpdateData(inProgressIds, { silent: true })
    }, UPDATE_PROGRESS_POLL_MS)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStates])

  const selectedUpdatableCount = servers.filter(
    (server) =>
      selectedIds.has(server.id) && isServerUpdatable(server, updateStates),
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

  const anyUpdateInProgress =
    batchUpdating ||
    [...updateStates.values()].some(
      (state) => state.triggering || state.data?.status === 'updating',
    )

  const hostLabel = servers.length === 1 ? 'host' : 'hosts'
  const fleetHint = loading
    ? 'Loading hosts…'
    : `${servers.length} ${hostLabel} · Postgres-backed status`

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Servers overview</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Select hosts to update, or open a server for its control panel.
      </Text>

      <SectionPanel title="Fleet" hint={fleetHint} accent>
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
          onTriggerSelectedUpdates={() => {
            handleTriggerSelectedUpdates().catch(() => {
              // Errors surface via update state.
            })
          }}
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
          <View style={orgPanelStyles.statePanel}>
            <Text style={orgPanelStyles.statePanelTitle}>No servers yet</Text>
            <Text style={orgPanelStyles.muted}>
              Add a host to start deploying projects to your fleet.
            </Text>
          </View>
        ) : null}

        {servers.length > 0 ? (
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
                <View style={[styles.tableCell, styles.colMesh]}>
                  <Text style={styles.tableHeaderText}>Mesh</Text>
                </View>
                <View style={[styles.tableCell, styles.colCheck]}>
                  <SelectionCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onPress={toggleSelectAll}
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
                  onToggleSelected={() => toggleSelected(server.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </SectionPanel>

      {canOwn && showAddServerWizard ? (
        <AddServerWizard
          onComplete={() => {
            setShowAddServerWizard(false)
            refreshServers().catch(() => {
              // Errors surface via section error state.
            })
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
        } as const)
      : {}),
    borderBottomColor: colors.accent,
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
    minWidth: 640,
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
  tableRowSelected: {
    backgroundColor: colors.bgActive,
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
  colName: {
    flex: 2.6,
    minWidth: 220,
    gap: 2,
  },
  colStatus: {
    flex: 1.4,
    minWidth: 140,
    gap: 4,
    alignItems: 'flex-start',
  },
  colMesh: {
    flex: 1.2,
    minWidth: 120,
    alignItems: 'flex-start',
  },
  meshText: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 16,
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
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOnline: {
    backgroundColor: colors.accent,
  },
  statusDotOffline: {
    backgroundColor: colors.textFaint,
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
  statusOnline: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
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
  statusTextOffline: {
    color: colors.textDim,
  },
  statusFlag: {
    fontSize: 14,
    lineHeight: 16,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  checkboxMark: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
})
