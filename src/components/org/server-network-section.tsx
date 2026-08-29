import { useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AddressFamilyBadge } from '@/components/org/address-family-badge'
import { IpListRow } from '@/components/org/network/network-rows'
import { MonoText, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  type RelayRecord,
  type ServerDetailRecord,
  type ServerReportedIp,
} from '@/lib/instance-api'
import { datacenterHref, networkFabricHref } from '@/lib/org-navigation'
import { useOrgFabric } from '@/lib/queries/fabric'
import { queryKeys, useCan } from '@/lib/query-client'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { colors, spacing, webPointer } from '@/lib/theme'
import { addressFamilyLabel } from '@/lib/cidr'

// Docker/veth/bridge interfaces are filtered daemon-side before addresses reach the API.

/**
 * `preferred` marks the address on the host's default-route interface — the one
 * a peer actually reaches it on, and the one the instance picks when the
 * observed peer address is a proxy artifact.
 */
function AddressGroup({
  label,
  addresses,
}: Readonly<{ label: string; addresses: ServerReportedIp[] }>) {
  if (addresses.length === 0) return null
  return (
    <View style={styles.group}>
      <Text style={panelStyles.detailTitle}>{label}</Text>
      {addresses.map((row) => (
        <View key={row.address} style={styles.pinRow}>
          <MonoText style={styles.mono} selectable>
            {row.address}
          </MonoText>
          {row.interface ? (
            <Text style={panelStyles.muted}>{row.interface}</Text>
          ) : null}
          {row.preferred ? (
            <Text style={panelStyles.muted}>default route</Text>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function DatacenterPrivatePins({
  loading,
  ips,
  datacenterNameById,
}: Readonly<{
  loading: boolean
  ips: readonly {
    id: string
    address: string
    datacenterId: string | null
  }[]
  datacenterNameById: ReadonlyMap<string, string>
}>) {
  if (loading) {
    return <Text style={panelStyles.muted}>Loading private address…</Text>
  }
  if (ips.length === 0) {
    return (
      <Text style={panelStyles.muted}>No private address assigned</Text>
    )
  }
  return (
    <View style={styles.pinList}>
      {ips.map((ip) => {
        const family = addressFamilyLabel(ip.address)
        const datacenterLabel = ip.datacenterId
          ? datacenterNameById.get(ip.datacenterId)
          : null
        return (
          <View key={ip.id} style={styles.pinRow}>
            <MonoText style={styles.mono} selectable>
              {ip.address}
            </MonoText>
            <AddressFamilyBadge family={family} />
            {datacenterLabel ? (
              <Text style={panelStyles.muted}>{datacenterLabel}</Text>
            ) : null}
          </View>
        )
      })}
    </View>
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
        <Text style={panelStyles.muted}>
          Organization manage permission is required to view{' '}
          {TURBOFABRIC_PRODUCT_NAME} membership.
        </Text>
      ) : null}
      {canManage && loading && !relay ? (
        <Text style={panelStyles.muted}>Loading mesh membership…</Text>
      ) : null}
      {canManage && !loading && !relay ? (
        <View style={panelStyles.statePanel}>
          <Text style={panelStyles.muted}>
            Not a {TURBOFABRIC_PRODUCT_NAME} relay.
          </Text>
        </View>
      ) : null}
      {canManage && relay ? (
        <View style={panelStyles.detailCard}>
          <Pressable
            style={webPointer}
            onPress={() => router.push(networkFabricHref(orgId) as Href)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${TURBOFABRIC_PRODUCT_NAME}`}
          >
            <Text style={panelStyles.detailTitle}>
              {TURBOFABRIC_PRODUCT_NAME}
            </Text>
          </Pressable>
          <Text style={panelStyles.detailLine}>
            <Text style={panelStyles.detailLabel}>
              TurboFabric address:{' '}
            </Text>
            <MonoText style={styles.mono} selectable>
              {relay.address}
            </MonoText>
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
  const ips = server.ips ?? []
  const publicIpv4 = ips.filter(
    (row) => row.scope === 'public' && row.version === 4,
  )
  const publicIpv6 = ips.filter(
    (row) => row.scope === 'public' && row.version === 6,
  )
  const privateIpv4 = ips.filter(
    (row) => row.scope === 'private' && row.version === 4,
  )
  const privateIpv6 = ips.filter(
    (row) => row.scope === 'private' && row.version === 6,
  )
  const hasLists =
    publicIpv4.length > 0 ||
    publicIpv6.length > 0 ||
    privateIpv4.length > 0 ||
    privateIpv6.length > 0

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

  const managedIps = serverManagedIpsQuery.data?.ips ?? []
  const relay =
    fabricQuery.data?.relays.find((row) => row.serverId === server.id) ?? null
  const meshLoading = fabricQuery.isLoading

  const memberships = server.datacenters ?? []
  const datacenterNameById = new Map(
    memberships.map((row) => [row.id, row.name?.trim() || row.id]),
  )
  const serverTitle =
    server.name?.trim() || server.hostname?.trim() || server.id
  const networkById = new Map(
    (serverManagedIpsQuery.data?.networks ?? []).map((network) => [
      network.id,
      network,
    ]),
  )
  const datacenterById = new Map(
    (serverManagedIpsQuery.data?.datacenters ?? []).map((row) => [row.id, row]),
  )

  return (
    <View style={styles.root}>
      <SectionPanel
        title="Datacenters"
        hint="Membership pins for this host"
      >
        {memberships.length === 0 ? (
          <Text style={panelStyles.detailLine}>
            <Text style={panelStyles.detailLabel}>Datacenters: </Text>
            Not assigned
          </Text>
        ) : (
          memberships.map((membership) => {
            const label = membership.name?.trim() || membership.id
            return (
              <Pressable
                key={membership.id}
                style={webPointer}
                onPress={() =>
                  router.push(datacenterHref(orgId, membership.id) as Href)
                }
                accessibilityRole="link"
                accessibilityLabel={`Open datacenter ${label}`}
              >
                <Text style={panelStyles.detailLine}>
                  <Text style={panelStyles.detailLabel}>Datacenter: </Text>
                  {label}
                </Text>
              </Pressable>
            )
          })
        )}
        <DatacenterPrivatePins
          loading={datacenterIpsQuery.isLoading}
          ips={datacenterIpsQuery.data?.ips ?? []}
          datacenterNameById={datacenterNameById}
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
          <Text style={panelStyles.muted}>Loading managed addresses…</Text>
        ) : null}
        {!serverManagedIpsQuery.isLoading && managedIps.length === 0 ? (
          <Text style={panelStyles.muted}>
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
                  network?.name?.trim() || network?.cidr || null
                }
                datacenterLabel={datacenter?.name?.trim() || null}
                showDelete={false}
              />
            )
          })}
        </View>
      </SectionPanel>

      <SectionPanel title="Interfaces" hint="Non-container addresses from the daemon">
        {!hasLists ? (
          <Text style={panelStyles.muted}>
            No interface addresses reported yet.
          </Text>
        ) : (
          <>
            <AddressGroup label="Public IPv4" addresses={publicIpv4} />
            <AddressGroup label="Public IPv6" addresses={publicIpv6} />
            <AddressGroup label="Private IPv4" addresses={privateIpv4} />
            <AddressGroup label="Private IPv6" addresses={privateIpv6} />
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
  pinList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  group: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  mono: {
    color: colors.text,
  },
})
