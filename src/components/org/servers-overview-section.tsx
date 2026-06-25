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
  isForbiddenError,
  pingServer,
  type FetchServerCellResponse,
  type OrgServerRecord,
  type PingServerResponse,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

type PingState = {
  pinging: boolean
  result: PingServerResponse | null
  error: string | null
}

type CellState = {
  open: boolean
  loading: boolean
  data: FetchServerCellResponse | null
  error: string | null
  loadedAt: string | null
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

function formatUptimeSeconds(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  return parts.join(' ')
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

function statusColor(status: string | null): string {
  switch (status) {
    case 'healthy':
      return colors.accent
    case 'degraded':
      return colors.pending
    case 'unhealthy':
    case 'failed':
      return colors.error
    default:
      return colors.textDim
  }
}

function mapPingError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Ping failed'
  const lower = message.toLowerCase()
  if (lower.includes('daemon not connected')) {
    return 'Daemon not connected'
  }
  if (lower.includes('ping timed out')) {
    return 'Ping timed out'
  }
  return message
}

export function ServersOverviewSection({ orgId }: { orgId: string }) {
  const { handleUnauthorized } = useAuth()
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pingStates, setPingStates] = useState<Map<string, PingState>>(
    new Map(),
  )
  const [cellStates, setCellStates] = useState<Map<string, CellState>>(
    new Map(),
  )

  const handlePing = async (serverId: string) => {
    setPingStates((prev) =>
      new Map(prev).set(serverId, {
        pinging: true,
        result: null,
        error: null,
      }),
    )
    try {
      const result = await pingServer(serverId)
      setPingStates((prev) =>
        new Map(prev).set(serverId, {
          pinging: false,
          result,
          error: null,
        }),
      )
    } catch (err) {
      const message = mapPingError(err)
      setPingStates((prev) =>
        new Map(prev).set(serverId, {
          pinging: false,
          result: null,
          error: message,
        }),
      )
    }
  }

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
              const pingState = pingStates.get(server.id) ?? {
                pinging: false,
                result: null,
                error: null,
              }
              const cellState = cellStates.get(server.id) ?? {
                open: false,
                loading: false,
                data: null,
                error: null,
                loadedAt: null,
              }
              const snapshot = cellState.data?.snapshot
              const monitorInstance = cellState.data?.monitorInstance
              const resources = cellState.data?.resources ?? []
              const instance = monitorInstance?.instance
              const load = instance?.load

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

                  {server.connected ? (
                    <View style={styles.healthRow}>
                      <View
                        style={[
                          styles.healthChip,
                          {
                            borderColor: statusColor(server.status),
                            backgroundColor: colors.bgSecondary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.healthChipText,
                            { color: statusColor(server.status) },
                          ]}
                        >
                          {(server.status ?? 'unknown').toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.healthChip,
                          {
                            borderColor: colors.accent,
                            backgroundColor: colors.bgSecondary,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.healthChipText, { color: colors.accent }]}
                        >
                          ✓ {server.healthyCount ?? 0} healthy
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.healthChip,
                          {
                            borderColor: colors.pending,
                            backgroundColor: colors.bgSecondary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.healthChipText,
                            { color: colors.pending },
                          ]}
                        >
                          ⚠ {server.degradedCount ?? 0} degraded
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.healthChip,
                          {
                            borderColor: colors.error,
                            backgroundColor: colors.bgSecondary,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.healthChipText, { color: colors.error }]}
                        >
                          ✗ {server.unhealthyCount ?? 0} unhealthy
                        </Text>
                      </View>
                    </View>
                  ) : null}

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

                  <View style={styles.pingRow}>
                    <TouchableOpacity
                      style={styles.pingButton}
                      onPress={() => void handlePing(server.id)}
                      disabled={pingState.pinging}
                    >
                      {pingState.pinging ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : null}
                      <Text style={styles.pingButtonText}>
                        {pingState.pinging ? 'Testing…' : 'Test WS Connection'}
                      </Text>
                    </TouchableOpacity>
                    {pingState.result ? (
                      <Text style={styles.pingResult}>
                        Round-trip: {pingState.result.tripMs} ms | Sent:{' '}
                        {new Date(pingState.result.sentAt).toLocaleTimeString()} |
                        Pong:{' '}
                        {new Date(pingState.result.pongAt).toLocaleTimeString()}
                      </Text>
                    ) : null}
                    {pingState.error ? (
                      <Text style={styles.pingError}>{pingState.error}</Text>
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
                        <Text style={styles.pingError}>{cellState.error}</Text>
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
                            <Text style={orgPanelStyles.detailLabel}>CPU: </Text>
                            {instance?.cpu?.usagePercent != null
                              ? `${instance.cpu.usagePercent.toFixed(1)}%`
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Memory:{' '}
                            </Text>
                            {instance?.memory?.usagePercent != null
                              ? `${instance.memory.usagePercent.toFixed(1)}%`
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>Disk: </Text>
                            {instance?.disk?.usagePercent != null
                              ? `${instance.disk.usagePercent.toFixed(1)}%`
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Load (1m/5m/15m):{' '}
                            </Text>
                            {load?.one != null ||
                            load?.five != null ||
                            load?.fifteen != null
                              ? [
                                  load?.one ?? '—',
                                  load?.five ?? '—',
                                  load?.fifteen ?? '—',
                                ].join(' / ')
                              : '—'}
                          </Text>
                          <Text style={orgPanelStyles.detailLine}>
                            <Text style={orgPanelStyles.detailLabel}>
                              Uptime:{' '}
                            </Text>
                            {instance?.uptimeSeconds != null
                              ? formatUptimeSeconds(instance.uptimeSeconds)
                              : '—'}
                          </Text>
                          {resources.length > 0 ? (
                            <>
                              <Text
                                style={[
                                  orgPanelStyles.detailLabel,
                                  { marginTop: spacing.xs },
                                ]}
                              >
                                Resources
                              </Text>
                              {resources.map((resource) => (
                                <Text
                                  key={resource.resourceKey}
                                  style={orgPanelStyles.detailLine}
                                >
                                  [{resource.kind}]{' '}
                                  {resource.state.name ?? resource.resourceKey} —{' '}
                                  <Text
                                    style={{ color: statusColor(resource.status) }}
                                  >
                                    {resource.status}
                                  </Text>
                                </Text>
                              ))}
                            </>
                          ) : null}
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
  healthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  healthChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  healthChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pingRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  pingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  pingButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  pingResult: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  pingError: {
    color: colors.errorText,
    fontSize: 12,
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
