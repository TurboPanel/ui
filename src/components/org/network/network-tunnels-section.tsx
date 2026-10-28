import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { EmptyState, LoadingState } from '@/components/ui'
import { useOrgServers } from '@/lib/queries/servers'
import { useTunnelCarriers } from '@/lib/queries/tunnels'
import { useTunnels } from '@/lib/queries/tunnel-routes'
import { useDatacenters } from '@/lib/queries/topology'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import { NetworkTunnelCard } from './network-tunnel-card'
import { NetworkTunnelCreate } from './network-tunnel-create'
import { NetworkTunnelServers } from './network-tunnel-servers'

/**
 * Tunnels: create one on a Cloudflare account, choose which servers run it,
 * and add the hostnames it carries. Owners and managers only.
 */
export function NetworkTunnelsSection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const tunnels = useTunnels(orgId, { enabled: canManage })
  const carriers = useTunnelCarriers(orgId, { enabled: canManage })
  const servers = useOrgServers(orgId, { enabled: canManage })
  const datacenters = useDatacenters(orgId, { enabled: canManage })
  const serverList = servers.data?.servers ?? []
  const datacenterList = datacenters.data?.datacenters ?? []
  const list = tunnels.data?.tunnels ?? []

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Tunnels</Text>
      <Text style={panelStyles.pageCopy}>
        A tunnel lets visitors reach a site through Cloudflare without opening a port on your
        server. Choose which servers run it, then add the hostnames it carries.
      </Text>
      {canManage ? null : (
        <Text style={panelStyles.muted}>Only owners and managers can manage tunnels.</Text>
      )}
      {canManage ? (
        <NetworkTunnelCreate
          orgId={orgId}
          carriers={carriers.data?.carriers ?? []}
          servers={serverList}
          datacenters={datacenterList}
        />
      ) : null}
      {tunnels.isError ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {tunnelErrorMessage(tunnels.error, 'Failed to load tunnels')}
        </Text>
      ) : null}
      {canManage && tunnels.isLoading ? <LoadingState label="Loading tunnels…" /> : null}
      {canManage && !tunnels.isLoading && list.length === 0 ? (
        <EmptyState title="No tunnels yet." hint="Create one above." panel />
      ) : null}
      {list.map((tunnel) => (
        <NetworkTunnelCard
          key={tunnel.id}
          orgId={orgId}
          tunnel={tunnel}
          servers={serverList}
          datacenters={datacenterList}
        />
      ))}
      {canManage ? <NetworkTunnelServers orgId={orgId} servers={serverList} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
})
