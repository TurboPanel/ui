import { useQuery } from '@tanstack/react-query'
import { StyleSheet, Text, View } from 'react-native'
import { IpListRow } from '@/components/org/ips-overview-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import {
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

// Docker/veth/bridge interfaces are filtered daemon-side before addresses reach the API.

function dialLine(server: ServerDetailRecord): string {
  const raw = server.remoteAddress?.trim()
  if (!raw || raw === '__direct__') {
    return 'Co-located (Unix socket)'
  }
  return raw
}

function AddressGroup({
  label,
  addresses,
}: Readonly<{ label: string; addresses: string[] }>) {
  if (addresses.length === 0) return null
  return (
    <View style={styles.group}>
      <Text style={orgPanelStyles.detailTitle}>{label}</Text>
      {addresses.map((addr) => (
        <Text key={addr} style={styles.mono} selectable>
          {addr}
        </Text>
      ))}
    </View>
  )
}

function DatacenterPrivateAddress({
  loading,
  address,
}: Readonly<{ loading: boolean; address: string | null }>) {
  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading private address…</Text>
  }
  if (address) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Private address: </Text>
        <Text style={styles.mono} selectable>
          {address}
        </Text>
      </Text>
    )
  }
  return (
    <Text style={orgPanelStyles.muted}>No datacenter address assigned</Text>
  )
}

export function ServerNetworkSection({
  server,
}: Readonly<{ server: ServerDetailRecord }>) {
  const addresses = server.addresses
  const hasLists =
    addresses != null &&
    (addresses.publicIpv4.length > 0 ||
      addresses.publicIpv6.length > 0 ||
      addresses.privateIpv4.length > 0 ||
      addresses.privateIpv6.length > 0)

  const geoLocation = formatServerGeoLocation(server.geo)
  const geoCountry = formatServerGeoCountryCode(server.geo)
  const geoLine = [geoLocation, geoCountry].filter(Boolean).join(', ')

  const datacenterIpsQuery = useQuery({
    queryKey: ['server', server.id, 'ips', { scope: 'datacenter' }],
    queryFn: () => fetchIps({ serverId: server.id, scope: 'datacenter' }),
  })
  useForbiddenRecovery(datacenterIpsQuery.error)

  const serverManagedIpsQuery = useQuery({
    queryKey: ['server', server.id, 'ips', 'managed'],
    queryFn: async () => {
      const [ipsResult, networksResult, datacentersResult] = await Promise.all([
        fetchIps({ serverId: server.id }),
        fetchNetworks(),
        fetchDatacenters(),
      ])
      return {
        ips: ipsResult.ips,
        networks: networksResult.networks,
        datacenters: datacentersResult.datacenters,
      }
    },
  })
  useForbiddenRecovery(serverManagedIpsQuery.error)

  const privateAddress =
    datacenterIpsQuery.data?.ips[0]?.address ?? null

  const serverTitle =
    server.displayName?.trim() || server.hostname?.trim() || server.id
  const networkById = new Map(
    (serverManagedIpsQuery.data?.networks ?? []).map((network) => [
      network.id,
      network,
    ]),
  )
  const datacenterById = new Map(
    (serverManagedIpsQuery.data?.datacenters ?? []).map((row) => [row.id, row]),
  )
  const managedIps = serverManagedIpsQuery.data?.ips ?? []

  return (
    <View style={styles.root}>
      <SectionPanel
        title="Datacenter"
        hint="Assignment and private address for this host"
      >
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Location: </Text>
          {server.datacenterDisplayName?.trim() || 'Not assigned'}
        </Text>
        <DatacenterPrivateAddress
          loading={datacenterIpsQuery.isLoading}
          address={privateAddress}
        />
      </SectionPanel>

      <SectionPanel
        title="Managed addresses"
        hint="Organization IP pool rows assigned to this host"
      >
        {serverManagedIpsQuery.isLoading ? (
          <Text style={orgPanelStyles.muted}>Loading managed addresses…</Text>
        ) : null}
        {!serverManagedIpsQuery.isLoading && managedIps.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No managed addresses assigned to this server.
          </Text>
        ) : null}
        <View style={styles.list}>
          {managedIps.map((ip) => {
            const network = ip.networkId ? networkById.get(ip.networkId) : null
            const datacenter = ip.datacenterId
              ? datacenterById.get(ip.datacenterId)
              : null
            return (
              <IpListRow
                key={ip.id}
                ip={ip}
                serverLabel={serverTitle}
                networkLabel={
                  network?.displayName?.trim() || network?.cidr || null
                }
                datacenterLabel={datacenter?.displayName?.trim() || null}
                showDelete={false}
              />
            )
          })}
        </View>
      </SectionPanel>

      <SectionPanel title="Interfaces" hint="Non-container addresses from the daemon">
        {!hasLists ? (
          <Text style={orgPanelStyles.muted}>
            No interface addresses reported yet.
          </Text>
        ) : (
          <>
            <AddressGroup label="Public IPv4" addresses={addresses!.publicIpv4} />
            <AddressGroup label="Public IPv6" addresses={addresses!.publicIpv6} />
            <AddressGroup label="Private IPv4" addresses={addresses!.privateIpv4} />
            <AddressGroup label="Private IPv6" addresses={addresses!.privateIpv6} />
          </>
        )}
      </SectionPanel>

      <SectionPanel title="Control-plane connection" hint="How this host dials the instance">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Dial: </Text>
          <Text style={styles.mono}>{dialLine(server)}</Text>
        </Text>
        {geoLine ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Geo: </Text>
            {geoLine}
          </Text>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  group: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  mono: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
