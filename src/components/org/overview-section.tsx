import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { StatusStatBoxes } from '@/components/org/status-stat-boxes'
import {
  computeFleetStatus,
  fleetServersStatSuffix,
  fleetStatusAccessibilityLabel,
  formatCoresTotal,
  formatSiBytes,
  indexFleetUsageByServerId,
} from '@/lib/fleet-capacity'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import {
  SERVERS_REFRESH_MS,
  useFleetServerUsage,
  useOrgServers,
} from '@/lib/queries/servers'
import { serversPresenceRefetchMs } from '@/lib/server-connection-status'
import { orEmptyArray } from '@/lib/or-empty-array'
import { spacing } from '@/lib/theme'

/** Org Overview — fleet status tiles. Organization name lives on Manage. */
export function OverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const serversQuery = useOrgServers(orgId, {
    staleTime: 0,
    refetchInterval: (query) =>
      serversPresenceRefetchMs({
        servers: query.state.data?.servers,
        idleMs: SERVERS_REFRESH_MS,
      }),
  })
  const fleetUsageQuery = useFleetServerUsage(orgId, {
    enabled: !serversQuery.isLoading,
  })

  usePullToRefresh(async () => {
    await Promise.all([serversQuery.refetch(), fleetUsageQuery.refetch()])
  })

  const servers = orEmptyArray(serversQuery.data?.servers)
  const usageByServerId = useMemo(
    () => indexFleetUsageByServerId(fleetUsageQuery.data?.servers),
    [fleetUsageQuery.data],
  )
  const fleetStatus = useMemo(
    () => computeFleetStatus(servers, usageByServerId),
    [servers, usageByServerId],
  )
  const showStatus = !serversQuery.isLoading || servers.length > 0

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Overview</Text>
      {showStatus ? (
        <StatusStatBoxes
          accessibilityLabel={fleetStatusAccessibilityLabel(fleetStatus)}
          items={[
            {
              key: 'servers',
              label: 'Servers',
              value: String(fleetStatus.onlineCount),
              valueTone: 'online',
              suffix: fleetServersStatSuffix(fleetStatus),
            },
            {
              key: 'cores',
              label: 'Cores',
              value: formatCoresTotal(fleetStatus.totalCores),
            },
            {
              key: 'ram',
              label: 'RAM',
              value: formatSiBytes(fleetStatus.totalMemoryBytes),
            },
          ]}
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
})
