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
  fetchServerUpdate,
  isForbiddenError,
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

  const loadUpdateData = async (
    serverId: string,
    options?: { silent?: boolean },
  ): Promise<void> => {
    const current = updateStates.get(serverId)
    if (!options?.silent) {
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: true,
          triggering: current?.triggering ?? false,
          data: current?.data ?? null,
          error: null,
        }),
      )
    }
    try {
      const data = await fetchServerUpdate(serverId)
      const isTerminalUpdateState = (status: ServerUpdateStatus): boolean => {
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
      const preserveTriggering =
        options?.silent &&
        (current?.triggering ?? false) &&
        !isTerminalUpdateState(data)
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: false,
          triggering: preserveTriggering || data.status === 'updating',
          data,
          error: null,
        }),
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      const message =
        err instanceof Error ? err.message : 'Failed to load update status'
      setUpdateStates((prev) =>
        new Map(prev).set(serverId, {
          loading: false,
          triggering: current?.triggering ?? false,
          data: options?.silent ? current?.data ?? null : null,
          error: message,
        }),
      )
    }
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
      await loadUpdateData(serverId)
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

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchOrgServers()
        if (!cancelled) {
          setServers(result.servers)
          for (const server of result.servers) {
            void loadUpdateData(server.id, { silent: true })
          }
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
    const timer = setInterval(() => void load(), 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [orgId, handleUnauthorized])

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

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Servers overview</Text>
      <Text style={styles.copy}>
        Hosts assigned to your organization. Connection status refreshes every few
        seconds.
      </Text>

      <SectionPanel title="Your servers" hint={`Organization ${orgId}`}>
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
                      Last heartbeat:{' '}
                    </Text>
                    {formatHeartbeat(server.lastHeartbeatAt)}
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
                            !updateData?.updateAvailable) &&
                            styles.updateButtonDisabled,
                        ]}
                        onPress={() => void handleTriggerUpdate(server.id)}
                        disabled={
                          isUpdateStatusLoading ||
                          isUpdateInProgress ||
                          !server.connected ||
                          !targetKnown ||
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
                              Last heartbeat:{' '}
                            </Text>
                            {snapshot.lastHeartbeatAt
                              ? formatHeartbeat(snapshot.lastHeartbeatAt)
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
