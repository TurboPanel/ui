import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useQueries } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import {
  IpListRow,
  NetworkListItem,
} from '@/components/org/network/network-rows'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import type {
  DatacenterRecord,
  IpRecord,
  NetworkRecord,
  OrgServerRecord,
  PeerRecord,
  VpnRecord,
} from '@/lib/instance-api'
import {
  peersQueryOptions,
  useCreateNetwork,
  useDatacenter,
  useDatacenters,
  useDeleteNetwork,
  useIps,
  useNetworks,
  useUpdateDatacenter,
  useVpns,
} from '@/lib/queries/topology'
import { useOrgServers, usePatchServer, useTimezones } from '@/lib/queries/servers'
import { networkLinkHref } from '@/lib/org-navigation'
import { useCan } from '@/lib/query-client'
import { serverConnectionStatusLabel, resolveServerConnectionStatus } from '@/lib/server-connection-status'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  formatSiteLinkLabel,
  overlayAddressForPeer,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
  type SiteLinkSites,
} from '@/lib/vpn-mesh'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function PrivateNetworkPanel({
  orgId,
  datacenterId,
  networks,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  datacenterId: string
  networks: NetworkRecord[]
  loading: boolean
  canManage: boolean
}>) {
  const [error, setError] = useState<string | null>(null)
  const [cidr, setCidr] = useState('')
  const [displayName, setDisplayName] = useState('')
  const createMutation = useCreateNetwork(orgId)
  const deleteMutation = useDeleteNetwork(orgId)

  const privateNetworks = networks.filter((n) => n.kind === 'datacenter')
  const creating = createMutation.isPending
  const createDisabled = creating || cidr.trim().length === 0

  return (
    <SectionPanel
      title="Private network"
      hint={`${privateNetworks.length} CIDR(s)`}
    >
      {error || createMutation.actionError || deleteMutation.actionError ? (
        <Text style={orgPanelStyles.error}>
          {error ??
            createMutation.actionError ??
            deleteMutation.actionError}
        </Text>
      ) : null}

      {loading && privateNetworks.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading private network…</Text>
      ) : null}
      {!loading && privateNetworks.length === 0 ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            This site has no private network — it can&apos;t host database
            replicas until one is added.
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {privateNetworks.map((network) => (
          <NetworkListItem
            key={network.id}
            network={network}
            showDelete={canManage}
            isDeleting={
              deleteMutation.isPending &&
              deleteMutation.variables === network.id
            }
            onDelete={(networkId) => {
              setError(null)
              deleteMutation.mutate(networkId, {
                onError: (err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Failed to delete network',
                  )
                },
              })
            }}
          />
        ))}
      </View>

      {canManage ? (
        <View style={styles.createBlock}>
          <Text style={styles.fieldLabel}>Add private network</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Optional name"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <TextInput
            value={cidr}
            onChangeText={setCidr}
            // NOSONAR typescript:S1313 — example private CIDR placeholder
            placeholder="e.g. 10.0.0.0/24"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              createDisabled && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={createDisabled}
            onPress={() => {
              setError(null)
              createMutation.mutate(
                {
                  organizationId: orgId,
                  kind: 'datacenter',
                  datacenterId,
                  cidr: cidr.trim(),
                  displayName: displayName.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    setCidr('')
                    setDisplayName('')
                  },
                  onError: (err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Failed to create private network',
                    )
                  },
                },
              )
            }}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                Add private network
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SectionPanel>
  )
}

function MemberServersPanel({
  memberServers,
  unassignedServers,
  privateAddressByServerId,
  canManage,
  pending,
  assignServerId,
  onSelectAssign,
  onAssign,
  onUnassign,
}: Readonly<{
  memberServers: OrgServerRecord[]
  unassignedServers: OrgServerRecord[]
  privateAddressByServerId: Map<string, string>
  canManage: boolean
  pending: boolean
  assignServerId: string
  onSelectAssign: (id: string) => void
  onAssign: () => void
  onUnassign: (serverId: string) => void
}>) {
  return (
    <SectionPanel
      title="Member servers"
      hint={`${memberServers.length} assigned`}
    >
      {memberServers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No servers assigned to this site yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {memberServers.map((server) => {
            const privateAddress = privateAddressByServerId.get(server.id)
            return (
              <View key={server.id} style={orgPanelStyles.detailCard}>
                <Text style={orgPanelStyles.detailTitle}>
                  {serverTitle(server)}
                </Text>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Status: </Text>
                  {serverConnectionStatusLabel(
                    resolveServerConnectionStatus(server),
                  )}
                </Text>
                {privateAddress ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>
                      Private address:{' '}
                    </Text>
                    <Text style={styles.mono} selectable>
                      {privateAddress}
                    </Text>
                  </Text>
                ) : (
                  <Text style={orgPanelStyles.muted}>No private address</Text>
                )}
                {canManage ? (
                  <Pressable
                    style={[
                      orgPanelStyles.toolbarBtnSecondary,
                      pending && styles.buttonDisabled,
                      webPointer,
                    ]}
                    disabled={pending}
                    onPress={() => onUnassign(server.id)}
                  >
                    <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                      Unassign
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {canManage ? (
        <View style={styles.assignBlock}>
          <Text style={styles.fieldLabel}>Assign unassigned server</Text>
          {unassignedServers.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              All org servers already belong to a site.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {unassignedServers.map((server) => (
                <Pressable
                  key={server.id}
                  style={[
                    styles.chip,
                    assignServerId === server.id && styles.chipActive,
                    webPointer,
                  ]}
                  onPress={() => onSelectAssign(server.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      assignServerId === server.id && styles.chipTextActive,
                    ]}
                  >
                    {serverTitle(server)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              (!assignServerId || pending) && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={!assignServerId || pending}
            onPress={onAssign}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Assign to site
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SectionPanel>
  )
}

type LinkFromSiteRow = {
  peer: PeerRecord
  vpn: VpnRecord
  otherSiteLabel: string
  serverLabel: string
  overlayAddress: string | null
  isPrimary: boolean
}

function collectSiteCidrs(networks: readonly NetworkRecord[]): string[] {
  const siteCidrs: string[] = []
  for (const network of networks) {
    if (network.kind !== 'datacenter') continue
    const cidr = network.cidr?.trim()
    if (cidr) siteCidrs.push(cidr)
  }
  siteCidrs.sort((a, b) => a.localeCompare(b))
  return siteCidrs
}

function groupPeersByVpnId(
  peers: readonly PeerRecord[],
): Map<string, PeerRecord[]> {
  const byVpn = new Map<string, PeerRecord[]>()
  for (const peer of peers) {
    const list = byVpn.get(peer.vpnId) ?? []
    list.push(peer)
    byVpn.set(peer.vpnId, list)
  }
  return byVpn
}

function collectPrimaryPeerIds(
  peers: readonly PeerRecord[],
  serverById: ReadonlyMap<
    string,
    { connected: boolean; datacenterId: string | null }
  >,
): Set<string> {
  const primaryPeerIds = new Set<string>()
  for (const group of groupPeersByVpnId(peers).values()) {
    for (const peerId of resolvePrimaryGatewayByDatacenter(
      group,
      serverById,
    ).values()) {
      primaryPeerIds.add(peerId)
    }
  }
  return primaryPeerIds
}

function resolveSiteCidrs(
  datacenter: DatacenterRecord | undefined,
  networks: readonly NetworkRecord[],
): string[] {
  const privateCidrs = datacenter?.privateCidrs
  if ((privateCidrs?.length ?? 0) > 0) {
    return [...(privateCidrs ?? [])].sort((a, b) => a.localeCompare(b))
  }
  return collectSiteCidrs(networks)
}

function resolveOtherSiteLabel(
  sites: SiteLinkSites | undefined,
  datacenterId: string,
  siteNameById: ReadonlyMap<string, string>,
): string {
  if (!sites) return '—'
  const otherIds = sites.datacenterIds.filter((id) => id !== datacenterId)
  if (otherIds.length === 0 && sites.hasUnassignedPeers) {
    return 'Unassigned hosts'
  }
  if (otherIds.length === 0) return '—'
  return formatSiteLinkLabel(
    {
      datacenterIds: otherIds,
      hasUnassignedPeers: sites.hasUnassignedPeers,
    },
    siteNameById,
  )
}

function collectPeersFromQueries(
  peerQueries: ReadonlyArray<{ data?: { peers?: PeerRecord[] } }>,
): PeerRecord[] {
  const allPeers: PeerRecord[] = []
  for (const peerQuery of peerQueries) {
    const peers = peerQuery.data?.peers
    if (peers) allPeers.push(...peers)
  }
  return allPeers
}

function buildLinkRowsFromSite({
  allPeers,
  servers,
  vpns,
  datacenterId,
  siteLinks,
  siteNameById,
  ipById,
  primaryPeerIds,
}: Readonly<{
  allPeers: readonly PeerRecord[]
  servers: readonly OrgServerRecord[]
  vpns: readonly VpnRecord[]
  datacenterId: string
  siteLinks: ReadonlyMap<string, SiteLinkSites>
  siteNameById: ReadonlyMap<string, string>
  ipById: ReadonlyMap<string, IpRecord>
  primaryPeerIds: ReadonlySet<string>
}>): LinkFromSiteRow[] {
  const linkRows: LinkFromSiteRow[] = []
  for (const peer of allPeers) {
    if (peer.role !== 'gateway') continue
    const server = servers.find(
      (row) =>
        row.id === peer.serverId && row.datacenterId === datacenterId,
    )
    if (!server) continue
    const vpn = vpns.find((v) => v.id === peer.vpnId)
    if (!vpn) continue
    linkRows.push({
      peer,
      vpn,
      otherSiteLabel: resolveOtherSiteLabel(
        siteLinks.get(vpn.id),
        datacenterId,
        siteNameById,
      ),
      serverLabel: serverTitle(server),
      overlayAddress: overlayAddressForPeer(peer, ipById),
      isPrimary: primaryPeerIds.has(peer.id),
    })
  }
  linkRows.sort((a, b) => {
    const nameCmp = (a.vpn.displayName ?? a.vpn.id).localeCompare(
      b.vpn.displayName ?? b.vpn.id,
    )
    if (nameCmp !== 0) return nameCmp
    return a.serverLabel.localeCompare(b.serverLabel)
  })
  return linkRows
}

function datacenterLoadError(
  isError: boolean,
  error: unknown,
): string | null {
  if (!isError) return null
  if (error instanceof Error) return error.message
  return 'Failed to load site'
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

function LinksFromSitePanel({
  orgId,
  rows,
  siteCidrs,
  loading,
}: Readonly<{
  orgId: string
  rows: LinkFromSiteRow[]
  siteCidrs: string[]
  loading: boolean
}>) {
  const router = useRouter()
  const missingSiteCidr = rows.length > 0 && siteCidrs.length === 0

  return (
    <SectionPanel
      title="Links from this site"
      hint={`${rows.length} gateway(s)`}
    >
      <Text style={orgPanelStyles.muted}>
        Path cross-site replication takes when peers use this site as a gateway.
      </Text>
      {loading && rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading links…</Text>
      ) : null}
      {!loading && rows.length === 0 ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.muted}>
            No link from this site — it is not reachable from other sites.
          </Text>
        </View>
      ) : null}

      {missingSiteCidr ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            This site has a mesh gateway but no private network CIDR. Apply will
            fail until a private network advertises the site prefix
            (gateway_datacenter_cidr_required).
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable
            key={row.peer.id}
            style={[orgPanelStyles.detailCard, webPointer]}
            onPress={() => router.push(networkLinkHref(orgId, row.vpn.id))}
          >
            <View style={styles.gatewayTitleRow}>
              <Text style={orgPanelStyles.detailTitle}>
                {row.vpn.displayName?.trim() || 'Unnamed mesh'}
              </Text>
              {row.isPrimary ? (
                <Text style={styles.primaryBadge}>Primary</Text>
              ) : null}
            </View>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Other end: </Text>
              {row.otherSiteLabel}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Gateway: </Text>
              {row.serverLabel}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Overlay: </Text>
              {row.overlayAddress ?? '—'}
            </Text>
          </Pressable>
        ))}
      </View>
    </SectionPanel>
  )
}

function SiteIpPoolPanel({
  ips,
  servers,
  loading,
}: Readonly<{
  ips: IpRecord[]
  servers: OrgServerRecord[]
  loading: boolean
}>) {
  return (
    <SectionPanel title="IP pool" hint={`${ips.length} address(es)`}>
      {loading && ips.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading addresses…</Text>
      ) : null}
      {!loading && ips.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No IP addresses in this site pool.
        </Text>
      ) : null}
      <View style={styles.list}>
        {ips.map((ip) => {
          const server = ip.serverId
            ? servers.find((row) => row.id === ip.serverId)
            : null
          return (
            <IpListRow
              key={ip.id}
              ip={ip}
              serverLabel={server ? serverTitle(server) : null}
              showDelete={false}
            />
          )
        })}
      </View>
    </SectionPanel>
  )
}

function SiteTimezonePanel({
  datacenter,
  timezoneOptions,
  effectiveTimezone,
  enforce,
  readOnly,
  pending,
  onTimezoneChange,
  onEnforceToggle,
  onSave,
}: Readonly<{
  datacenter: DatacenterRecord | undefined
  timezoneOptions: string[]
  effectiveTimezone: string | null
  enforce: boolean
  readOnly: boolean
  pending: boolean
  onTimezoneChange: (tz: string | null) => void
  onEnforceToggle: () => void
  onSave: () => void
}>) {
  return (
    <SectionPanel title="Timezone" hint="Site default · manage-gated">
      <Text style={orgPanelStyles.muted}>
        When enforcement is on, this site&apos;s default beats the org fleet
        default for its member servers.
      </Text>
      <ServerTimezonePicker
        value={effectiveTimezone}
        options={timezoneOptions}
        disabled={readOnly || pending || !datacenter}
        placeholder="Select site timezone…"
        noneLabel="None (inherit org default)"
        onChange={onTimezoneChange}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>
            Enforce site default on member servers
          </Text>
          <Text style={orgPanelStyles.muted}>
            When on, member hosts use this timezone over the org default.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: enforce,
            disabled: readOnly || pending || !datacenter,
          }}
          disabled={readOnly || pending || !datacenter}
          onPress={onEnforceToggle}
          style={[
            styles.toggle,
            enforce ? styles.toggleOn : styles.toggleOff,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{enforce ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      {readOnly ? (
        <Text style={orgPanelStyles.muted}>
          Organization manage permission is required to edit these settings.
        </Text>
      ) : (
        <Pressable
          disabled={pending || !datacenter}
          onPress={onSave}
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            (pending || !datacenter) && styles.buttonDisabled,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Save timezone
          </Text>
        </Pressable>
      )}
    </SectionPanel>
  )
}

export function NetworkSiteDetailSection({
  orgId,
  datacenterId,
}: Readonly<{
  orgId: string
  datacenterId: string
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [assignServerId, setAssignServerId] = useState('')
  const [draftTimezone, setDraftTimezone] = useState<string | null | undefined>(
    undefined,
  )
  const [draftEnforce, setDraftEnforce] = useState<boolean | null>(null)

  const datacenterQuery = useDatacenter(orgId, datacenterId, {
    enabled: Boolean(datacenterId),
  })
  const serversQuery = useOrgServers(orgId)
  const networksQuery = useNetworks(
    orgId,
    { datacenterId },
    { enabled: Boolean(datacenterId) },
  )
  const ipsQuery = useIps(
    orgId,
    { datacenterId },
    { enabled: Boolean(datacenterId) },
  )
  // O(1) scope filter only — includes server-owned private rows where
  // datacenterId is null (matches instance loadServerDatacenterAddress).
  const privateIpsQuery = useIps(
    orgId,
    { scope: 'datacenter' },
    { enabled: Boolean(datacenterId) },
  )
  const timezonesQuery = useTimezones()
  const vpnsQuery = useVpns(orgId)
  const vpnIpsQuery = useIps(orgId, { scope: 'vpn' })
  const datacentersQuery = useDatacenters(orgId)

  const vpns = vpnsQuery.data?.vpns ?? []
  const allDatacenters = datacentersQuery.data?.datacenters ?? []
  const peerQueries = useQueries({
    queries: vpns.map((vpn) => ({
      ...peersQueryOptions(orgId, vpn.id),
      enabled: vpnsQuery.isSuccess,
    })),
  })

  const patchServerMutation = usePatchServer(orgId)
  const timezoneMutation = useUpdateDatacenter(orgId, datacenterId)

  const datacenter = datacenterQuery.data?.datacenter
  const servers = serversQuery.data?.servers ?? []
  const memberServers = servers.filter(
    (server) => server.datacenterId === datacenterId,
  )
  const unassignedServers = servers.filter((server) => !server.datacenterId)
  const networks = networksQuery.data?.networks ?? []
  const ips = ipsQuery.data?.ips ?? []
  const siteCidrs = resolveSiteCidrs(datacenter, networks)

  const privateAddressByServerId = useMemo(() => {
    const map = new Map<string, string>()
    const memberIds = new Set(memberServers.map((server) => server.id))
    for (const ip of privateIpsQuery.data?.ips ?? []) {
      if (!ip.serverId || !memberIds.has(ip.serverId)) continue
      if (!map.has(ip.serverId)) {
        map.set(ip.serverId, ip.address)
      }
    }
    return map
  }, [privateIpsQuery.data?.ips, memberServers])

  const serverById = new Map(
    servers.map((server) => [
      server.id,
      {
        connected: server.connected,
        datacenterId: server.datacenterId,
      },
    ]),
  )
  const siteNameById = useMemo(() => {
    const map = new Map(
      allDatacenters.map((dc) => [
        dc.id,
        dc.displayName?.trim() || dc.id,
      ]),
    )
    if (datacenter) {
      map.set(
        datacenterId,
        datacenter.displayName?.trim() || datacenterId,
      )
    }
    return map
  }, [allDatacenters, datacenter, datacenterId])

  const ipById = new Map(
    (vpnIpsQuery.data?.ips ?? []).map((ip) => [ip.id, ip]),
  )
  const allPeers = collectPeersFromQueries(peerQueries)
  const primaryPeerIds = collectPrimaryPeerIds(allPeers, serverById)
  const siteLinks = resolveSiteLinks(allPeers, serverById, vpns)
  const linkRows = buildLinkRowsFromSite({
    allPeers,
    servers,
    vpns,
    datacenterId,
    siteLinks,
    siteNameById,
    ipById,
    primaryPeerIds,
  })

  const linksLoading =
    vpnsQuery.isLoading ||
    vpnIpsQuery.isLoading ||
    peerQueries.some((query) => query.isLoading)

  let effectiveTimezone = datacenter?.options?.defaultServerTimezone ?? null
  if (draftTimezone !== undefined) {
    effectiveTimezone = draftTimezone
  }
  const enforce =
    draftEnforce ?? (datacenter?.options?.enforceServerTimezone ?? false)
  const pending =
    timezoneMutation.isPending || patchServerMutation.isPending
  const readOnly = !canManage

  const queryError = datacenterLoadError(
    datacenterQuery.isError,
    datacenterQuery.error,
  )
  const displayError =
    error ??
    patchServerMutation.actionError ??
    timezoneMutation.actionError ??
    queryError

  const title =
    datacenter?.displayName?.trim() ||
    (datacenterQuery.isLoading ? 'Site' : 'Unnamed site')

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{title}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        {datacenter?.description?.trim() ||
          'Private network, member servers, links, IP pool, and timezone for this site.'}
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      <PrivateNetworkPanel
        orgId={orgId}
        datacenterId={datacenterId}
        networks={networks}
        loading={networksQuery.isLoading}
        canManage={canManage}
      />

      <MemberServersPanel
        memberServers={memberServers}
        unassignedServers={unassignedServers}
        privateAddressByServerId={privateAddressByServerId}
        canManage={canManage}
        pending={pending}
        assignServerId={assignServerId}
        onSelectAssign={setAssignServerId}
        onAssign={() => {
          setError(null)
          patchServerMutation.mutate(
            { serverId: assignServerId, body: { datacenterId } },
            {
              onSuccess: () => setAssignServerId(''),
              onError: (err) => {
                setError(mutationErrorMessage(err, 'Failed to assign server'))
              },
            },
          )
        }}
        onUnassign={(serverId) => {
          setError(null)
          patchServerMutation.mutate(
            { serverId, body: { datacenterId: null } },
            {
              onError: (err) => {
                setError(
                  mutationErrorMessage(err, 'Failed to unassign server'),
                )
              },
            },
          )
        }}
      />

      <LinksFromSitePanel
        orgId={orgId}
        rows={linkRows}
        siteCidrs={siteCidrs}
        loading={linksLoading}
      />

      <SiteIpPoolPanel
        ips={ips}
        servers={servers}
        loading={ipsQuery.isLoading}
      />

      <SiteTimezonePanel
        datacenter={datacenter}
        timezoneOptions={timezonesQuery.data?.timezones ?? []}
        effectiveTimezone={effectiveTimezone}
        enforce={enforce}
        readOnly={readOnly}
        pending={pending}
        onTimezoneChange={setDraftTimezone}
        onEnforceToggle={() => setDraftEnforce(!enforce)}
        onSave={() => {
          setError(null)
          timezoneMutation.mutate(
            {
              options: {
                defaultServerTimezone: effectiveTimezone,
                enforceServerTimezone: enforce,
              },
            },
            {
              onSuccess: () => {
                setDraftTimezone(undefined)
                setDraftEnforce(null)
              },
              onError: (err) => {
                setError(
                  mutationErrorMessage(err, 'Failed to save site timezone'),
                )
              },
            },
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  createBlock: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  gatewayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  primaryBadge: {
    color: chrome.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  assignBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  mono: {
    fontFamily: 'monospace',
    color: colors.textBody,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: chrome.accent,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleOn: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  toggleOff: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
