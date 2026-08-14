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
  RelayRecord,
  RelayRole,
} from '@/lib/instance-api'
import {
  useCreateNetwork,
  useDatacenter,
  useDatacenters,
  useDeleteNetwork,
  useIps,
  useNetworks,
  useUpdateDatacenter,
} from '@/lib/queries/topology'
import { useOrgFabric } from '@/lib/queries/fabric'
import { useOrgServers, usePatchServer, useTimezones } from '@/lib/queries/servers'
import { networkFabricHref } from '@/lib/org-navigation'
import { useCan } from '@/lib/query-client'
import { serverConnectionStatusLabel, resolveServerConnectionStatus } from '@/lib/server-connection-status'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  formatSiteLinkLabel,
  relayRoleLabel,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
} from '@/lib/fabric-mesh'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

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

type MeshFromSiteRow = {
  serverId: string
  serverLabel: string
  role: RelayRole
  address: string
  isPrimary: boolean
  otherSiteLabel: string
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
  mesh: ReturnType<typeof resolveSiteLinks>,
  datacenterId: string,
  siteNameById: ReadonlyMap<string, string>,
): string {
  const otherIds = mesh.datacenterIds.filter((id) => id !== datacenterId)
  if (otherIds.length === 0 && mesh.hasUnassignedPeers) {
    return 'Unassigned hosts'
  }
  if (otherIds.length === 0) return '—'
  return formatSiteLinkLabel(
    {
      datacenterIds: otherIds,
      hasUnassignedPeers: mesh.hasUnassignedPeers,
    },
    siteNameById,
  )
}

function buildMeshRowsFromSite({
  relays,
  servers,
  datacenterId,
  mesh,
  siteNameById,
  primaryGatewayByDatacenter,
}: Readonly<{
  relays: readonly RelayRecord[]
  servers: readonly OrgServerRecord[]
  datacenterId: string
  mesh: ReturnType<typeof resolveSiteLinks>
  siteNameById: ReadonlyMap<string, string>
  primaryGatewayByDatacenter: ReadonlyMap<string, string>
}>): MeshFromSiteRow[] {
  const rows: MeshFromSiteRow[] = []
  for (const relay of relays) {
    const server = servers.find(
      (row) =>
        row.id === relay.serverId && row.datacenterId === datacenterId,
    )
    if (!server) continue
    rows.push({
      serverId: relay.serverId,
      serverLabel: serverTitle(server),
      role: relay.role,
      address: relay.address,
      isPrimary: primaryGatewayByDatacenter.get(datacenterId) === relay.serverId,
      otherSiteLabel: resolveOtherSiteLabel(mesh, datacenterId, siteNameById),
    })
  }
  rows.sort((a, b) => a.serverLabel.localeCompare(b.serverLabel))
  return rows
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

function MeshFromSitePanel({
  orgId,
  rows,
  siteCidrs,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  rows: MeshFromSiteRow[]
  siteCidrs: string[]
  loading: boolean
  canManage: boolean
}>) {
  const router = useRouter()
  const hasGateway = rows.some((row) => row.role === 'gateway')
  const missingSiteCidr = hasGateway && siteCidrs.length === 0

  return (
    <SectionPanel
      title={TURBOFABRIC_PRODUCT_NAME}
      hint={`${rows.length} relay(s)`}
    >
      <Text style={orgPanelStyles.muted}>
        Relays at this site. Cross-site replication uses a gateway here.
      </Text>
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>
          Organization manage permission is required to view{' '}
          {TURBOFABRIC_PRODUCT_NAME} membership.
        </Text>
      ) : null}
      {canManage && loading && rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading mesh…</Text>
      ) : null}
      {canManage && !loading && rows.length === 0 ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.muted}>
            No {TURBOFABRIC_PRODUCT_NAME} relays at this site.
          </Text>
        </View>
      ) : null}

      {canManage && missingSiteCidr ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            This site has a mesh gateway but no private network CIDR. Apply will
            fail until a private network advertises the site prefix.
          </Text>
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.list}>
          {rows.map((row) => (
          <Pressable
            key={row.serverId}
            style={[orgPanelStyles.detailCard, webPointer]}
            onPress={() => router.push(networkFabricHref(orgId))}
          >
            <View style={styles.gatewayTitleRow}>
              <Text style={orgPanelStyles.detailTitle}>{row.serverLabel}</Text>
              {row.isPrimary ? (
                <Text style={styles.primaryBadge}>Primary</Text>
              ) : null}
            </View>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Role: </Text>
              {relayRoleLabel(row.role)}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Other sites: </Text>
              {row.otherSiteLabel}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>tp0: </Text>
              {row.address}
            </Text>
          </Pressable>
        ))}
        </View>
      ) : null}
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
  const fabricQuery = useOrgFabric(orgId, { enabled: canManage })
  const datacentersQuery = useDatacenters(orgId)

  const relays = fabricQuery.data?.relays ?? []
  const allDatacenters = datacentersQuery.data?.datacenters ?? []

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

  const mesh = resolveSiteLinks(relays, serverById)
  const primaryGatewayByDatacenter = resolvePrimaryGatewayByDatacenter(
    relays,
    serverById,
  )
  const meshRows = buildMeshRowsFromSite({
    relays,
    servers,
    datacenterId,
    mesh,
    siteNameById,
    primaryGatewayByDatacenter,
  })

  const meshLoading = fabricQuery.isLoading

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
          'Private network, member servers, mesh, IP pool, and timezone for this site.'}
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

      <MeshFromSitePanel
        orgId={orgId}
        rows={meshRows}
        siteCidrs={siteCidrs}
        loading={meshLoading}
        canManage={canManage}
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
