import { useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { IpListRow } from '@/components/org/ips-overview-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  fetchVpns,
  type IpRecord,
  type ServerDetailRecord,
  type VpnRecord,
} from '@/lib/instance-api'
import { vpnDetailHref } from '@/lib/org-navigation'
import { queryKeys } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

// Docker/veth/bridge interfaces are filtered daemon-side before addresses reach the API.

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

function vpnTitle(vpn: VpnRecord): string {
  return vpn.displayName?.trim() || 'Unnamed mesh'
}

function ServerMeshMembershipPanel({
  orgId,
  rows,
  loading,
}: Readonly<{
  orgId: string
  rows: { vpn: VpnRecord; address: string }[]
  loading: boolean
}>) {
  const router = useRouter()

  return (
    <SectionPanel title="Mesh" hint="VPN overlay membership for this host">
      {loading && rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading mesh membership…</Text>
      ) : null}
      {!loading && rows.length === 0 ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.muted}>Not a peer on any mesh.</Text>
        </View>
      ) : null}
      <View style={styles.list}>
        {rows.map(({ vpn, address }) => (
          <View key={vpn.id} style={orgPanelStyles.detailCard}>
            <Pressable
              style={webPointer}
              onPress={() =>
                router.push(vpnDetailHref(orgId, vpn.id) as Href)
              }
              accessibilityRole="link"
              accessibilityLabel={`Open ${vpnTitle(vpn)}`}
            >
              <Text style={orgPanelStyles.detailTitle}>{vpnTitle(vpn)}</Text>
            </Pressable>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Overlay: </Text>
              <Text style={styles.mono} selectable>
                {address}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </SectionPanel>
  )
}

function buildMeshRows(
  ips: readonly IpRecord[],
  vpns: readonly VpnRecord[],
): { vpn: VpnRecord; address: string }[] {
  const vpnById = new Map(vpns.map((vpn) => [vpn.id, vpn]))
  const rows: { vpn: VpnRecord; address: string }[] = []
  for (const ip of ips) {
    if (!ip.vpnId) continue
    const vpn = vpnById.get(ip.vpnId)
    if (!vpn) continue
    rows.push({ vpn, address: ip.address })
  }
  rows.sort((a, b) => vpnTitle(a.vpn).localeCompare(vpnTitle(b.vpn)))
  return rows
}

export function ServerNetworkSection({
  orgId,
  server,
}: Readonly<{ orgId: string; server: ServerDetailRecord }>) {
  const addresses = server.addresses
  const hasLists =
    addresses != null &&
    (addresses.publicIpv4.length > 0 ||
      addresses.publicIpv6.length > 0 ||
      addresses.privateIpv4.length > 0 ||
      addresses.privateIpv6.length > 0)

  const datacenterIpsQuery = useQuery({
    queryKey: queryKeys.org(orgId).servers.ips(server.id, {
      scope: 'datacenter',
    }),
    queryFn: () => fetchIps({ serverId: server.id, scope: 'datacenter' }),
  })

  const vpnIpsQuery = useQuery({
    queryKey: queryKeys.org(orgId).servers.ips(server.id, { scope: 'vpn' }),
    queryFn: () => fetchIps({ serverId: server.id, scope: 'vpn' }),
  })

  const vpnsQuery = useQuery({
    queryKey: queryKeys.org(orgId).topology.vpns,
    queryFn: fetchVpns,
  })

  const serverManagedIpsQuery = useQuery({
    queryKey: queryKeys.org(orgId).servers.ips(server.id, {
      scope: 'managed-panel',
    }),
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
  // VPN overlay rows belong in the Mesh panel only — keep Managed addresses
  // for public / datacenter / loopback pool assignments.
  const managedIps = (serverManagedIpsQuery.data?.ips ?? []).filter(
    (ip) => ip.scope !== 'vpn',
  )
  const meshRows = buildMeshRows(
    vpnIpsQuery.data?.ips ?? [],
    vpnsQuery.data?.vpns ?? [],
  )
  const meshLoading = vpnIpsQuery.isLoading || vpnsQuery.isLoading

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

      <ServerMeshMembershipPanel
        orgId={orgId}
        rows={meshRows}
        loading={meshLoading}
      />

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
