import { useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { IpListRow } from '@/components/org/network/network-rows'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  type RelayRecord,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { networkFabricHref, networkSiteHref } from '@/lib/org-navigation'
import { useOrgFabric } from '@/lib/queries/fabric'
import { queryKeys, useCan } from '@/lib/query-client'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
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
    <Text style={orgPanelStyles.muted}>No private address assigned</Text>
  )
}

function ServerMeshMembershipPanel({
  orgId,
  relay,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  relay: RelayRecord | null
  loading: boolean
  canManage: boolean
}>) {
  const router = useRouter()

  return (
    <SectionPanel
      title="Mesh"
      hint={`${TURBOFABRIC_PRODUCT_NAME} membership for this host`}
    >
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>
          Organization manage permission is required to view{' '}
          {TURBOFABRIC_PRODUCT_NAME} membership.
        </Text>
      ) : null}
      {canManage && loading && !relay ? (
        <Text style={orgPanelStyles.muted}>Loading mesh membership…</Text>
      ) : null}
      {canManage && !loading && !relay ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.muted}>
            Not a {TURBOFABRIC_PRODUCT_NAME} relay.
          </Text>
        </View>
      ) : null}
      {canManage && relay ? (
        <View style={orgPanelStyles.detailCard}>
          <Pressable
            style={webPointer}
            onPress={() => router.push(networkFabricHref(orgId) as Href)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${TURBOFABRIC_PRODUCT_NAME}`}
          >
            <Text style={orgPanelStyles.detailTitle}>
              {TURBOFABRIC_PRODUCT_NAME}
            </Text>
          </Pressable>
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>tp0: </Text>
            <Text style={styles.mono} selectable>
              {relay.address}
            </Text>
          </Text>
        </View>
      ) : null}
    </SectionPanel>
  )
}

export function ServerNetworkSection({
  orgId,
  server,
}: Readonly<{ orgId: string; server: ServerDetailRecord }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
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

  const fabricQuery = useOrgFabric(orgId, { enabled: canManage })

  const serverManagedIpsQuery = useQuery({
    queryKey: queryKeys.org(orgId).servers.networkPanel(server.id),
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
  const managedIps = serverManagedIpsQuery.data?.ips ?? []
  const relay =
    fabricQuery.data?.relays.find((row) => row.serverId === server.id) ?? null
  const meshLoading = fabricQuery.isLoading

  const siteName = server.datacenterDisplayName?.trim() || null
  const siteId = server.datacenterId

  return (
    <View style={styles.root}>
      <SectionPanel
        title="Site"
        hint="Assignment and private address for this host"
      >
        {siteId ? (
          <Pressable
            style={webPointer}
            onPress={() =>
              router.push(networkSiteHref(orgId, siteId) as Href)
            }
            accessibilityRole="link"
            accessibilityLabel={`Open site ${siteName ?? siteId}`}
          >
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Site: </Text>
              {siteName || siteId}
            </Text>
          </Pressable>
        ) : (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Site: </Text>
            Not assigned
          </Text>
        )}
        <DatacenterPrivateAddress
          loading={datacenterIpsQuery.isLoading}
          address={privateAddress}
        />
      </SectionPanel>

      <ServerMeshMembershipPanel
        orgId={orgId}
        relay={relay}
        loading={meshLoading}
        canManage={canManage}
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
