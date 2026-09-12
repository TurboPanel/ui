import { useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AddressFamilyBadge } from '@/components/org/address-family-badge'
import { IpListRow } from '@/components/org/network/network-rows'
import { Badge, InlineNotice, MonoText, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  type IpRecord,
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
import { stalePinReasonLabel } from '@/lib/datacenter-list'
import {
  formatStaleSince,
  groupReportedAddresses,
  indexPinsByAddress,
} from '@/lib/server-interfaces'

// Docker/veth/bridge interfaces are filtered daemon-side before addresses reach the API.

/**
 * **Stale** badge + one plain line: since when, and why nothing was guessed.
 * Never colour-only — the label carries the state.
 */
function StalePinNote({ pin }: Readonly<{ pin: IpRecord }>) {
  if (!pin.stale) return null
  const since = formatStaleSince(pin.staleSince)
  return (
    <View style={styles.staleRow}>
      <Badge label="Stale" tone="pending" />
      <Text style={panelStyles.muted}>
        {since ? `since ${since} — ` : ''}
        {stalePinReasonLabel(pin.staleReason)}
      </Text>
    </View>
  )
}

/**
 * Which datacenter(s) a reported address is pinned into, joined on address
 * from the already-fetched `scope: 'datacenter'` rows. No per-interface fetch.
 */
function AddressPinLines({
  pins,
  datacenterNameById,
}: Readonly<{
  pins: readonly IpRecord[]
  datacenterNameById: ReadonlyMap<string, string>
}>) {
  if (pins.length === 0) return null
  return (
    <View style={styles.pinLines}>
      {pins.map((pin) => {
        const label = pin.datacenterId
          ? datacenterNameById.get(pin.datacenterId) ?? pin.datacenterId
          : 'a datacenter'
        return (
          <View key={pin.id} style={styles.pinLine}>
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Pinned into: </Text>
              {label}
            </Text>
            <StalePinNote pin={pin} />
          </View>
        )
      })}
    </View>
  )
}

/**
 * One interface (or one public/private × family bucket when the daemon
 * reports no interface names). `preferred` marks the address on the host's
 * default-route interface — the one a peer actually reaches it on, and the
 * one the instance picks when the observed peer address is a proxy artifact.
 */
function InterfaceGroup({
  label,
  defaultRoute,
  addresses,
  pinsByAddress,
  datacenterNameById,
}: Readonly<{
  label: string
  defaultRoute: boolean
  addresses: readonly ServerReportedIp[]
  pinsByAddress: ReadonlyMap<string, IpRecord[]>
  datacenterNameById: ReadonlyMap<string, string>
}>) {
  if (addresses.length === 0) return null
  return (
    <View style={styles.group}>
      <View style={styles.groupTitleRow}>
        <MonoText style={styles.groupTitle}>{label}</MonoText>
        {defaultRoute ? <Text style={panelStyles.muted}>default route</Text> : null}
      </View>
      {addresses.map((row) => (
        <View key={row.address} style={styles.addressBlock}>
          <View style={styles.pinRow}>
            <MonoText style={styles.mono} selectable>
              {row.cidr ?? row.address}
            </MonoText>
            <AddressFamilyBadge family={addressFamilyLabel(row.address)} />
            <Text style={panelStyles.muted}>{row.scope}</Text>
            {row.preferred && !defaultRoute ? (
              <Text style={panelStyles.muted}>default route</Text>
            ) : null}
          </View>
          <AddressPinLines
            pins={pinsByAddress.get(row.address.trim()) ?? []}
            datacenterNameById={datacenterNameById}
          />
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
  ips: readonly IpRecord[]
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
          <View key={ip.id} style={styles.addressBlock}>
            <View style={styles.pinRow}>
              <MonoText style={styles.mono} selectable>
                {ip.address}
              </MonoText>
              <AddressFamilyBadge family={family} />
              {datacenterLabel ? (
                <Text style={panelStyles.muted}>{datacenterLabel}</Text>
              ) : null}
            </View>
            <StalePinNote pin={ip} />
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
  const interfaceGroups = groupReportedAddresses(ips)

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
  const datacenterPins = datacenterIpsQuery.data?.ips ?? []
  const pinsByAddress = indexPinsByAddress(datacenterPins)
  const relay =
    fabricQuery.data?.relays.find((row) => row.serverId === server.id) ?? null
  const meshLoading = fabricQuery.isLoading

  const memberships = server.datacenters ?? []
  const datacenterNameById = new Map(
    memberships.map((row) => [row.id, row.name?.trim() || row.id]),
  )
  for (const row of serverManagedIpsQuery.data?.datacenters ?? []) {
    if (!datacenterNameById.has(row.id)) {
      datacenterNameById.set(row.id, row.name?.trim() || row.id)
    }
  }
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
      <InlineNotice
        title="TurboPanel observes host interfaces, it does not configure them."
        body="Addresses are expected to change. Membership pins follow the host automatically when exactly one unambiguous replacement is reported; otherwise the pin goes stale rather than guessing."
      />

      <SectionPanel
        title="Interfaces"
        hint="Addresses the daemon reports, and the datacenter each is pinned into"
      >
        {interfaceGroups.length === 0 ? (
          <Text style={panelStyles.muted}>
            No interface addresses reported yet.
          </Text>
        ) : (
          interfaceGroups.map((group) => (
            <InterfaceGroup
              key={group.label}
              label={group.label}
              defaultRoute={group.defaultRoute}
              addresses={group.addresses}
              pinsByAddress={pinsByAddress}
              datacenterNameById={datacenterNameById}
            />
          ))
        )}
        {datacenterIpsQuery.isLoading ? (
          <Text style={panelStyles.muted}>Loading pins…</Text>
        ) : null}
      </SectionPanel>

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
          ips={datacenterPins}
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
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.textTitle,
    fontWeight: '600',
  },
  addressBlock: {
    gap: 2,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  pinLines: {
    gap: 2,
  },
  pinLine: {
    gap: 2,
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mono: {
    color: colors.text,
  },
})
