import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchOrgServers,
  fetchServerCell,
  fetchServersUpdateStatus,
  isForbiddenError,
  triggerAllServerUpdates,
  triggerServerUpdate,
  type FetchServerCellResponse,
  type OrgServerRecord,
  type ServerUpdateStatus,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

type CellState = {
  open: boolean
  loading: boolean
  data: FetchServerCellResponse | null
  error: string | null
  loadedAt: string | null
}

type UpdateState = {
  loading: boolean
  triggering: boolean
  data: ServerUpdateStatus | null
  error: string | null
}

const CELL_REFRESH_MS = 10_000
// The servers list reflects coarse presence from the Postgres projection, which
// changes about as often as one daemon heartbeat. Poll it slowly rather than at
// a constant 5s; a push-based update path can replace this entirely later.
const SERVERS_REFRESH_MS = 30_000
// Only poll per-server update status while an update is actively in progress.
const UPDATE_PROGRESS_POLL_MS = 5_000

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function formatUptime(value: string | null): string {
  if (!value) return 'Unknown'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return 'Unknown'
  const deltaMs = Date.now() - ts
  if (deltaMs < 0) return 'Just now'
  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function formatHeartbeat(value: string | null): string {
  if (!value) return 'Never'
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return 'Never'
  const deltaMs = Date.now() - ts
  const absolute = new Date(ts).toLocaleString()
  if (deltaMs < 0) return absolute
  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 60) return `${seconds}s ago (${absolute})`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago (${absolute})`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago (${absolute})`
  const days = Math.floor(hours / 24)
  return `${days}d ago (${absolute})`
}

export function ServersOverviewSection({ orgId }: { orgId: string }) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(
    new Map(),
  )
  const [updateStates, setUpdateStates] = useState<Map<string, UpdateState>>(
    new Map(),
  )
  const [batchUpdating, setBatchUpdating] = useState(false)

  const loadCellData = async (
    serverId: string,
    options?: { silent?: boolean },
  ): Promise<void> => {
    const current = cellStates.get(serverId)
    if (!options?.silent) {
      setCellStates((prev) =>
        new Map(prev).set(serverId, {
          open: true,
          loading: true,
          data: current?.data ?? null,
          error: null,
          loadedAt: current?.loadedAt ?? null,
        }),
      )
    }
    try {
      const data = await fetchServerCell(serverId)
      setCellStates((prev) =>
        new Map(prev).set(serverId, {
          open: true,
          loading: false,
          data,
          error: null,
          loadedAt: new Date().toISOString(),
        }),
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load cell data'
      setCellStates((prev) =>
        new Map(prev).set(serverId, {
          open: true,
          loading: false,
          data: options?.silent ? current?.data ?? null : null,
          error: message,
          loadedAt: current?.loadedAt ?? null,
        }),
      )
    }
  }

  const handleToggleCell = async (serverId: string) => {
    const current = cellStates.get(serverId)
    if (current?.open) {
      setCellStates((prev) =>
        new Map(prev).set(serverId, { ...current, open: false }),
      )
      return
    }
    await loadCellData(serverId)
  }

  const isTerminalUpdateState = (status: ServerUpdateStatus): boolean => {
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

  const mergeUpdateEntry = (
    prev: Map<string, UpdateState>,
    serverId: string,
    data: ServerUpdateStatus,
    options?: { preserveTriggering?: boolean; loading?: boolean },
  ): Map<string, UpdateState> => {
    const current = prev.get(serverId)
    const preserveTriggering =
      options?.preserveTriggering &&
      (current?.triggering ?? false) &&
      !isTerminalUpdateState(data)
    return new Map(prev).set(serverId, {
      loading: options?.loading ?? false,
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

  const loadUpdateData = async (
    serverId: string,
    options?: { silent?: boolean },
  ): Promise<void> => {
    await loadAllUpdateData([serverId], options)
  }

  const handleTriggerUpdate = async (serverId: string): Promise<void> => {
    const current = updateStates.get(serverId)
    setUpdateStates((prev) =>
      new Map(prev).set(serverId, {
        loading: current?.loading ?? false,
        triggering: true,
        data: current?.data ?? null,
        error: null,
      }),
    )
    try {
      await triggerServerUpdate(serverId)
      void loadUpdateData(serverId, { silent: true })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to trigger update'
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: false,
          triggering: false,
          data: current?.data ?? null,
          error: message,
        }),
      )
    }
  }

  const handleTriggerAllUpdates = async (): Promise<void> => {
    const targets = servers.filter((server) => {
      const state = updateStates.get(server.id)
      return (
        server.connected &&
        state?.data?.targetStatus === 'ok' &&
        state.data.updateAvailable &&
        !state.triggering &&
        state.data.status !== 'updating'
      )
    })
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
      await triggerAllServerUpdates()
      void loadAllUpdateData(
        targets.map((server) => server.id),
        { silent: true },
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to trigger updates'
      setUpdateStates((prev) => {
        let next = prev
        for (const server of targets) {
          const current = prev.get(server.id)
          next = new Map(next).set(server.id, {
            loading: false,
            triggering: false,
            data: current?.data ?? null,
            error: message,
          })
        }
        return next
      })
    } finally {
      setBatchUpdating(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchOrgServers()
        if (!cancelled) {
          setServers(result.servers)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            setError(
              err instanceof Error ? err.message : 'Access to servers was denied',
            )
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load servers')
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = setInterval(() => void load(), SERVERS_REFRESH_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [orgId, handleUnauthorized])

  // Fetch update status in one batch when servers first appear.
  useEffect(() => {
    const pendingIds = servers
      .map((server) => server.id)
      .filter((serverId) => !updateStates.has(serverId))
    if (pendingIds.length === 0) return
    void loadAllUpdateData(pendingIds, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers])

  // While an update is actively in progress, poll just those servers until they
  // reach a terminal state; the effect re-runs and clears the timer once none
  // remain in progress.
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

  useEffect(() => {
    const openServerIds = [...cellStates.entries()]
      .filter(([, state]) => state.open)
      .map(([serverId]) => serverId)
    if (openServerIds.length === 0) return

    const timer = setInterval(() => {
      for (const serverId of openServerIds) {
        void loadCellData(serverId, { silent: true })
      }
    }, CELL_REFRESH_MS)

    return () => clearInterval(timer)
  }, [cellStates])

  const updatableServerCount = servers.filter((server) => {
    const state = updateStates.get(server.id)
    return (
      server.connected &&
      state?.data?.targetStatus === 'ok' &&
      state.data.updateAvailable &&
      !state.triggering &&
      state.data.status !== 'updating'
    )
  }).length

  const anyUpdateInProgress =
    batchUpdating ||
    [...updateStates.values()].some(
      (state) => state.triggering || state.data?.status === 'updating',
    )

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Servers overview</Text>
      <Text style={styles.copy}>
        Hosts assigned to your organization. Connection status refreshes
        periodically.
      </Text>

      <SectionPanel title="Your servers" hint={`Organization ${orgId}`}>
        {canManage && updatableServerCount > 0 ? (
          <View style={styles.batchUpdateRow}>
            <TouchableOpacity
              style={[
                styles.updateButton,
                (anyUpdateInProgress || batchUpdating) &&
                  styles.updateButtonDisabled,
              ]}
              onPress={() => void handleTriggerAllUpdates()}
              disabled={anyUpdateInProgress || batchUpdating}
            >
              {batchUpdating ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : null}
              <Text style={styles.updateButtonText}>
                {batchUpdating
                  ? 'Updating all…'
                  : `Update all (${updatableServerCount})`}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading && servers.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : servers.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No servers are assigned to this organization yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {servers.map((server) => {
              const updateState = updateStates.get(server.id) ?? {
                loading: false,
                triggering: false,
                data: null,
                error: null,
              }
              const updateData = updateState.data
              const isUpdateStatusLoading =
                updateState.loading && updateData === null
              const isUpdateInProgress =
                updateState.triggering || updateData?.status === 'updating'
              const targetKnown = updateData?.targetStatus === 'ok'
              const shortCommit = (c?: string | null) =>
                c ? c.slice(0, 12) : '—'
              const cellState = cellStates.get(server.id) ?? {
                open: false,
                loading: false,
                data: null,
                error: null,
                loadedAt: null,
              }
              const snapshot = cellState.data?.snapshot

              return (
                <View key={server.id} style={orgPanelStyles.detailCard}>
                  <View style={styles.cardHeader}>
                    <Text style={orgPanelStyles.detailTitle}>
                      {serverTitle(server)}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        server.connected
                          ? styles.statusOnline
                          : styles.statusOffline,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          server.connected
                            ? styles.statusTextOnline
                            : styles.statusTextOffline,
                        ]}
                      >
                        {server.connected ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                  </View>

                  {server.hostname && server.displayName ? (
                    <Text style={orgPanelStyles.detailLine}>
                      <Text style={orgPanelStyles.detailLabel}>Hostname: </Text>
                      {server.hostname}
                    </Text>
                  ) : null}
                  {server.connected && server.remoteAddress ? (
                    <Text style={orgPanelStyles.detailLine}>
                      <Text style={orgPanelStyles.detailLabel}>
                        Connecting IP:{' '}
                      </Text>
                      <Text selectable>{server.remoteAddress}</Text>
                    </Text>
                  ) : null}
                  {server.connected && server.connectedAt ? (
                    <Text style={orgPanelStyles.detailLine}>
                      <Text style={orgPanelStyles.detailLabel}>
                        Connected since:{' '}
                      </Text>
                      {new Date(server.connectedAt).toLocaleString()} (
                      {formatUptime(server.connectedAt)})
                    </Text>
                  ) : null}
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>
                      Last activity:{' '}
                    </Text>
                    {formatHeartbeat(server.lastInboundAt ?? server.lastHeartbeatAt)}
                  </Text>
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>ID: </Text>
                    <Text selectable>{server.id}</Text>
                  </Text>
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Added: </Text>
                    {new Date(server.createdAt).toLocaleString()}
                  </Text>

                  <View style={styles.updatePanel}>
                    <Text style={styles.updateHeading}>Daemon version</Text>

                    <Text style={orgPanelStyles.detailLine}>
                      <Text style={orgPanelStyles.detailLabel}>Running: </Text>
                      {shortCommit(updateData?.current?.commit)}
                    </Text>

                    <Text style={orgPanelStyles.detailLine}>
                      <Text style={orgPanelStyles.detailLabel}>Trunk: </Text>
                      {updateData?.targetStatus === 'unknown'
                        ? 'Unknown'
                        : shortCommit(updateData?.target?.commit)}
                    </Text>

                    {updateData?.targetStatus === 'unknown' &&
                    updateData.targetError ? (
                      <Text style={orgPanelStyles.muted}>
                        {updateData.targetError}
                      </Text>
                    ) : null}

                    {updateData?.updateBlocked &&
                    updateData.updateBlockedReason ? (
                      <Text style={orgPanelStyles.muted}>
                        {updateData.updateBlockedReason}
                      </Text>
                    ) : null}

                    {isUpdateStatusLoading ? (
                      <View style={styles.cellRow}>
                        <ActivityIndicator
                          size="small"
                          color={colors.textMuted}
                        />
                        <Text style={orgPanelStyles.muted}>
                          Loading update status…
                        </Text>
                      </View>
                    ) : updateData ? (
                      <View
                        style={[
                          styles.updateBadge,
                          updateData.status === 'updating'
                            ? styles.updateBadgeUpdating
                            : updateData.status === 'error'
                              ? styles.updateBadgeError
                              : updateData.updateBlocked
                                ? styles.updateBadgeCurrent
                                : updateData.targetStatus === 'unknown'
                                  ? styles.updateBadgeUnknown
                                  : updateData.updateAvailable
                                    ? styles.updateBadgeAvailable
                                    : styles.updateBadgeCurrent,
                        ]}
                      >
                        <Text
                          style={[
                            styles.updateBadgeText,
                            updateData.status === 'updating'
                              ? styles.updateBadgeTextUpdating
                              : updateData.status === 'error'
                                ? styles.updateBadgeTextError
                                : updateData.updateBlocked
                                  ? styles.updateBadgeTextCurrent
                                  : updateData.targetStatus === 'unknown'
                                    ? styles.updateBadgeTextUnknown
                                    : updateData.updateAvailable
                                      ? styles.updateBadgeTextAvailable
                                      : styles.updateBadgeTextCurrent,
                          ]}
                        >
                          {updateData.status === 'updating'
                            ? 'Update in progress'
                            : updateData.status === 'error'
                              ? 'Update error'
                              : updateData.updateBlocked
                                ? 'Development daemon'
                                : updateData.targetStatus === 'unknown'
                                  ? 'Target unavailable'
                                  : updateData.updateAvailable
                                    ? 'Update available'
                                    : 'Up to date'}
                        </Text>
                      </View>
                    ) : null}

                    {canManage ? (
                      <TouchableOpacity
                        style={[
                          styles.updateButton,
                          (isUpdateStatusLoading ||
                            isUpdateInProgress ||
                            !server.connected ||
                            !targetKnown ||
                            updateData?.updateBlocked ||
                            !updateData?.updateAvailable) &&
                            styles.updateButtonDisabled,
                        ]}
                        onPress={() => void handleTriggerUpdate(server.id)}
                        disabled={
                          isUpdateStatusLoading ||
                          isUpdateInProgress ||
                          !server.connected ||
                          !targetKnown ||
                          updateData?.updateBlocked ||
                          !updateData?.updateAvailable
                        }
                      >
                        {isUpdateStatusLoading || isUpdateInProgress ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.textMuted}
                          />
                        ) : null}
                        <Text style={styles.updateButtonText}>
                          {isUpdateStatusLoading
                            ? 'Loading…'
                            : isUpdateInProgress
                              ? 'Updating…'
                              : !server.connected
                                ? 'Offline'
                                : !targetKnown
                                  ? 'Target unknown'
                                  : updateData?.updateBlocked
                                    ? 'Not updatable'
                                    : !updateData?.updateAvailable
                                      ? 'Up to date'
                                      : 'Update'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    {updateState.error ? (
                      <Text style={styles.errorText}>{updateState.error}</Text>
                    ) : null}
                  </View>

                  <View style={styles.cellPanel}>
                    <View style={styles.cellHeaderRow}>
                      <TouchableOpacity
                        style={styles.cellToggle}
                        onPress={() => void handleToggleCell(server.id)}
                      >
                        <Text style={styles.cellToggleText}>
                          {cellState.open
                            ? '▼ Hide Daemon Cell'
                            : '▶ Show Daemon Cell'}
                        </Text>
                      </TouchableOpacity>
                      {cellState.open ? (
                        <TouchableOpacity
                          style={styles.cellRefreshButton}
                          onPress={() => void loadCellData(server.id)}
                          disabled={cellState.loading}
                        >
                          <Text style={styles.cellRefreshText}>
                            {cellState.loading ? 'Refreshing…' : 'Refresh'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {cellState.open && cellState.loadedAt ? (
                      <Text style={orgPanelStyles.muted}>
                        Cell data loaded{' '}
                        {formatHeartbeat(cellState.loadedAt)}
                      </Text>
                    ) : null}
                    {cellState.open ? (
                      cellState.loading ? (
                        <View style={styles.cellRow}>
                          <ActivityIndicator
                            size="small"
                            color={colors.textMuted}
                          />
                          <Text style={orgPanelStyles.muted}>
                            Loading cell data…
                          </Text>
                        </View>
                      ) : cellState.error ? (
                        <Text style={styles.errorText}>{cellState.error}</Text>
                      ) : snapshot ? (
                        <View style={[orgPanelStyles.detailCard, styles.cellData]}>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Session ID:{' '}
                            </Text>
                            {snapshot.sessionId ?? '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Key ID:{' '}
                            </Text>
                            {snapshot.keyId ?? '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Remote address:{' '}
                            </Text>
                            {snapshot.remoteAddress ?? '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Last inbound:{' '}
                            </Text>
                            {snapshot.lastInboundAt
                              ? formatHeartbeat(snapshot.lastInboundAt)
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Last outbound:{' '}
                            </Text>
                            {snapshot.lastOutboundAt
                              ? formatHeartbeat(snapshot.lastOutboundAt)
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Last activity:{' '}
                            </Text>
                            {snapshot.lastInboundAt ?? snapshot.lastHeartbeatAt
                              ? formatHeartbeat(
                                snapshot.lastInboundAt ?? snapshot.lastHeartbeatAt,
                              )
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Last seen:{' '}
                            </Text>
                            {snapshot.lastSeenAt
                              ? formatHeartbeat(snapshot.lastSeenAt)
                              : '—'}
                          </Text>
                        </View>
                      ) : null
                    ) : null}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  list: {
    gap: 8,
  },
  batchUpdateRow: {
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontSize: 12,
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
  updatePanel: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.errorText,
    fontSize: 12,
  },
  updateHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  updateBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  updateBadgeAvailable: {
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeUpdating: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  updateBadgeError: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeCurrent: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeUnknown: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  updateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  updateBadgeTextAvailable: {
    color: colors.pending,
  },
  updateBadgeTextUpdating: {
    color: colors.accent,
  },
  updateBadgeTextError: {
    color: colors.error,
  },
  updateBadgeTextCurrent: {
    color: colors.textDim,
  },
  updateBadgeTextUnknown: {
    color: colors.textDim,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
  },
  updateButtonDisabled: {
    opacity: 0.5,
  },
  updateButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  cellToggle: {
    alignSelf: 'flex-start',
  },
  cellToggleText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  cellPanel: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  cellHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cellRefreshButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.bgSecondary,
  },
  cellRefreshText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cellData: {
    gap: 4,
    marginTop: spacing.xs,
  },
})
