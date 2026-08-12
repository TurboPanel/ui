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
import { FirstRunWizard } from '@/components/org/first-run-wizard'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type {
  DatacenterNameSuggestion,
  DatacenterRecord,
  OrgServerRecord,
  PeerRecord,
  VpnRecord,
} from '@/lib/instance-api'
import {
  peersQueryOptions,
  useCreateDatacenter,
  useCreateNetwork,
  useDatacenters,
  useDatacenterNameSuggestions,
  useDeleteDatacenter,
  useIps,
  useUpdateDatacenter,
  useVpns,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { networkSiteHref } from '@/lib/org-navigation'
import {
  resolveSiteReadiness,
  siteReadinessLabel,
} from '@/lib/network-readiness'
import { useCan } from '@/lib/query-client'
import { serverConnectionStatusLabel, resolveServerConnectionStatus } from '@/lib/server-connection-status'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  formatSiteLinkLabel,
  resolveSiteLinks,
} from '@/lib/vpn-mesh'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function SiteReadinessNotice({
  readinessLevel,
  missingCount,
  canManage,
  addingNetwork,
  onAddPrivateNetwork,
}: Readonly<{
  readinessLevel: ReturnType<typeof siteReadinessLabel>
  missingCount: number
  canManage: boolean
  addingNetwork: boolean
  onAddPrivateNetwork: () => void
}>) {
  if (readinessLevel === 'no-private-network') {
    return (
      <View style={orgPanelStyles.calloutWarning}>
        <Text style={orgPanelStyles.calloutWarningText}>
          This site has no private network — it can&apos;t host database
          replicas until one is added.
        </Text>
        {canManage ? (
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              addingNetwork && styles.buttonDisabled,
              webPointer,
              styles.calloutAction,
            ]}
            disabled={addingNetwork}
            onPress={(event) => {
              event.stopPropagation?.()
              onAddPrivateNetwork()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              {addingNetwork ? 'Adding…' : 'Add private network'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    )
  }

  if (readinessLevel === 'servers-missing-address') {
    return (
      <Text style={orgPanelStyles.muted}>
        {missingCount}{' '}
        {missingCount === 1 ? 'server' : 'servers'} here{' '}
        {missingCount === 1 ? 'has' : 'have'} no private address
      </Text>
    )
  }

  return null
}

function SiteCardManageActions({
  draftName,
  onDraftNameChange,
  renaming,
  confirmDelete,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<{
  draftName: string
  onDraftNameChange: (value: string) => void
  renaming: boolean
  confirmDelete: boolean
  onRename: (displayName: string) => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}>) {
  return (
    <View style={styles.cardActions} onStartShouldSetResponder={() => true}>
      <TextInput
        value={draftName}
        onChangeText={onDraftNameChange}
        placeholder="Display name"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        onPressIn={(event) => event.stopPropagation?.()}
      />
      <View style={styles.actionsRow}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            renaming && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={renaming}
          onPress={(event) => {
            event.stopPropagation?.()
            onRename(draftName.trim())
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {renaming ? 'Saving…' : 'Rename'}
          </Text>
        </Pressable>
        {confirmDelete ? (
          <>
            <Pressable
              style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
              onPress={(event) => {
                event.stopPropagation?.()
                onConfirmDelete()
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                Confirm delete
              </Text>
            </Pressable>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={(event) => {
                event.stopPropagation?.()
                onCancelDelete()
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Cancel
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
            onPress={(event) => {
              event.stopPropagation?.()
              onRequestDelete()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Delete</Text>
          </Pressable>
        )}
      </View>
      {confirmDelete ? (
        <Text style={orgPanelStyles.muted}>
          Servers and IPs stay; they are unpinned (SET NULL) from this site.
          Remove or reassign networks scoped to this site before deleting.
        </Text>
      ) : null}
    </View>
  )
}

function SiteCard({
  datacenter,
  memberServers,
  datacenterIps,
  linksLabel,
  canManage,
  renaming,
  confirmDelete,
  addingNetwork,
  onOpen,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onAddPrivateNetwork,
}: Readonly<{
  datacenter: DatacenterRecord
  memberServers: OrgServerRecord[]
  datacenterIps: { serverId: string | null; scope?: string }[]
  linksLabel: string | null
  canManage: boolean
  renaming: boolean
  confirmDelete: boolean
  addingNetwork: boolean
  onOpen: () => void
  onRename: (displayName: string) => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onAddPrivateNetwork: () => void
}>) {
  const [draftName, setDraftName] = useState(
    datacenter.displayName?.trim() ?? '',
  )
  const privateCidrs = datacenter.privateCidrs ?? []
  const readiness = resolveSiteReadiness({
    datacenter: { privateCidrs },
    memberServers,
    datacenterScopedIps: datacenterIps,
  })
  const readinessLevel = siteReadinessLabel(readiness)
  const missingCount = readiness.serversMissingPrivateAddress.length

  return (
    <Pressable
      style={[orgPanelStyles.detailCard, webPointer]}
      onPress={onOpen}
    >
      <Text style={orgPanelStyles.detailTitle}>
        {datacenter.displayName?.trim() || 'Unnamed site'}
      </Text>
      {datacenter.description?.trim() ? (
        <Text style={orgPanelStyles.detailLine}>{datacenter.description}</Text>
      ) : (
        <Text style={orgPanelStyles.muted}>No description</Text>
      )}
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Servers: </Text>
        {memberServers.length}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Private CIDR: </Text>
        {privateCidrs.length > 0 ? (
          <Text style={styles.mono} selectable>
            {privateCidrs.join(', ')}
          </Text>
        ) : (
          <Text style={orgPanelStyles.muted}>None</Text>
        )}
      </Text>

      <SiteReadinessNotice
        readinessLevel={readinessLevel}
        missingCount={missingCount}
        canManage={canManage}
        addingNetwork={addingNetwork}
        onAddPrivateNetwork={onAddPrivateNetwork}
      />

      {linksLabel ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Links: </Text>
          {linksLabel}
        </Text>
      ) : null}

      {canManage ? (
        <SiteCardManageActions
          draftName={draftName}
          onDraftNameChange={setDraftName}
          renaming={renaming}
          confirmDelete={confirmDelete}
          onRename={onRename}
          onRequestDelete={onRequestDelete}
          onConfirmDelete={onConfirmDelete}
          onCancelDelete={onCancelDelete}
        />
      ) : null}
    </Pressable>
  )
}

function suggestionKey(suggestion: DatacenterNameSuggestion): string {
  return `${suggestion.displayName}:${suggestion.serverIds.join(',')}`
}

function SiteSuggestionChips({
  suggestions,
  activeSuggestion,
  onSelect,
}: Readonly<{
  suggestions: DatacenterNameSuggestion[]
  activeSuggestion: DatacenterNameSuggestion | null
  onSelect: (suggestion: DatacenterNameSuggestion) => void
}>) {
  if (suggestions.length === 0) return null

  const activeKey = activeSuggestion
    ? suggestionKey(activeSuggestion)
    : null
  return (
    <View style={styles.suggestions}>
      <Text style={orgPanelStyles.muted}>
        Suggested from unassigned server geolocation and ASN. The active
        suggestion assigns its hosts when you create; editing the name clears
        it.
      </Text>
      <View style={styles.chipRow}>
        {suggestions.map((suggestion) => {
          const active = activeKey === suggestionKey(suggestion)
          return (
            <Pressable
              key={suggestionKey(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${suggestion.displayName} for the site name`}
              style={[styles.chip, active && styles.chipActive, webPointer]}
              onPress={() => onSelect(suggestion)}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {suggestion.displayName} · {suggestion.serverCount}{' '}
                {suggestion.serverCount === 1 ? 'server' : 'servers'}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function CreateSitePanel({
  orgId,
  onError,
}: Readonly<{
  orgId: string
  onError: (message: string | null) => void
}>) {
  const [displayName, setDisplayName] = useState('')
  const [hasEditedDisplayName, setHasEditedDisplayName] = useState(false)
  const [description, setDescription] = useState('')
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<DatacenterNameSuggestion | null>(null)

  const nameSuggestionsQuery = useDatacenterNameSuggestions(orgId, {
    enabled: true,
    limit: 8,
  })
  const createMutation = useCreateDatacenter(orgId)

  const nameSuggestions = nameSuggestionsQuery.data?.suggestions ?? []
  const topSuggestion = nameSuggestions[0]
  const activeSuggestion = hasEditedDisplayName
    ? selectedSuggestion
    : (topSuggestion ?? null)
  const resolvedDisplayName = hasEditedDisplayName
    ? displayName
    : (topSuggestion?.displayName ?? displayName)

  return (
    <SectionPanel title="Create site" hint="Manage-gated">
      <SiteSuggestionChips
        suggestions={nameSuggestions}
        activeSuggestion={activeSuggestion}
        onSelect={(suggestion) => {
          setHasEditedDisplayName(true)
          setDisplayName(suggestion.displayName)
          setSelectedSuggestion(suggestion)
        }}
      />
      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        value={resolvedDisplayName}
        onChangeText={(value) => {
          setHasEditedDisplayName(true)
          setDisplayName(value)
          setSelectedSuggestion(null)
        }}
        placeholder="e.g. AMS-1"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Optional notes"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          createMutation.isPending && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={createMutation.isPending}
        onPress={() => {
          onError(null)
          createMutation.mutate(
            {
              displayName: resolvedDisplayName.trim() || undefined,
              description: description.trim() || undefined,
              sourceServerId: activeSuggestion?.serverIds[0],
              assignServerIds: activeSuggestion?.serverIds,
            },
            {
              onSuccess: () => {
                setDisplayName('')
                setHasEditedDisplayName(false)
                setDescription('')
                setSelectedSuggestion(null)
              },
              onError: (err) => {
                onError(
                  err instanceof Error
                    ? err.message
                    : 'Failed to create site',
                )
              },
            },
          )
        }}
      >
        {createMutation.isPending ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Create site</Text>
        )}
      </Pressable>
    </SectionPanel>
  )
}

function datacentersErrorMessage(
  datacentersQuery: Pick<
    ReturnType<typeof useDatacenters>,
    'isError' | 'error'
  >,
): string | null {
  if (!datacentersQuery.isError) return null
  return datacentersQuery.error instanceof Error
    ? datacentersQuery.error.message
    : 'Failed to load sites'
}

function linksLabelForSite(
  siteId: string,
  vpns: VpnRecord[],
  siteLinks: Map<
    string,
    { datacenterIds: string[]; hasUnassignedPeers: boolean }
  >,
  siteNameById: Map<string, string>,
  peersLoading: boolean,
): string | null {
  if (peersLoading) return '—'
  const touching: string[] = []
  for (const vpn of vpns) {
    const sites = siteLinks.get(vpn.id)
    if (!sites?.datacenterIds.includes(siteId)) continue
    const label = formatSiteLinkLabel(sites, siteNameById)
    const name = vpn.displayName?.trim() || label
    touching.push(name)
  }
  if (touching.length === 0) return null
  return touching.join(' · ')
}

export function NetworkSitesSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [addingNetworkId, setAddingNetworkId] = useState<string | null>(null)
  const [wizardName, setWizardName] = useState('')

  const datacentersQuery = useDatacenters(orgId)
  const serversQuery = useOrgServers(orgId)
  const ipsQuery = useIps(orgId, { scope: 'datacenter' })
  const vpnsQuery = useVpns(orgId)
  const deleteMutation = useDeleteDatacenter(orgId)
  const renameMutation = useUpdateDatacenter(orgId, renameTargetId ?? '')
  const createNetworkMutation = useCreateNetwork(orgId)
  const createSiteMutation = useCreateDatacenter(orgId)

  const datacenters = datacentersQuery.data?.datacenters ?? []
  const servers = serversQuery.data?.servers ?? []
  const ips = ipsQuery.data?.ips ?? []
  const vpns = vpnsQuery.data?.vpns ?? []

  const peerQueries = useQueries({
    queries: vpns.map((vpn) => ({
      ...peersQueryOptions(orgId, vpn.id),
      enabled: vpns.length > 0,
    })),
  })

  const allPeers = useMemo(() => {
    const peers: PeerRecord[] = []
    for (const q of peerQueries) {
      if (q.data?.peers) peers.push(...q.data.peers)
    }
    return peers
  }, [peerQueries])

  const peersLoading = peerQueries.some(
    (q) => q.isLoading || q.isPending,
  )

  const serversBySite = useMemo(() => {
    const map = new Map<string, OrgServerRecord[]>()
    for (const server of servers) {
      if (!server.datacenterId) continue
      const list = map.get(server.datacenterId) ?? []
      list.push(server)
      map.set(server.datacenterId, list)
    }
    return map
  }, [servers])

  const unassignedServers = useMemo(
    () => servers.filter((s) => s.datacenterId == null),
    [servers],
  )

  const serverById = useMemo(
    () =>
      new Map(
        servers.map((s) => [s.id, { datacenterId: s.datacenterId }]),
      ),
    [servers],
  )

  const siteNameById = useMemo(
    () =>
      new Map(
        datacenters.map((dc) => [dc.id, dc.displayName?.trim() || dc.id]),
      ),
    [datacenters],
  )

  const siteLinks = useMemo(
    () => resolveSiteLinks(allPeers, serverById, vpns),
    [allPeers, serverById, vpns],
  )

  const loading = datacentersQuery.isLoading || serversQuery.isLoading
  const displayError =
    error ??
    renameMutation.actionError ??
    deleteMutation.actionError ??
    createNetworkMutation.actionError ??
    createSiteMutation.actionError ??
    datacentersErrorMessage(datacentersQuery)

  const isColdOrg = !loading && datacenters.length === 0

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Network</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Sites group servers on a private network. Links connect sites for
        private traffic, including database replication.
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      {isColdOrg && canManage ? (
        <FirstRunWizard
          title="Create your first site"
          description="Group servers that share a private network. You can add private CIDRs and links next."
          notes={[
            'A site without a private CIDR cannot host database replicas.',
            'Unassigned servers appear below after you create sites.',
          ]}
          primaryActionLabel="Create site"
          nameLabel="Display name"
          namePlaceholder="e.g. AMS-1"
          nameValue={wizardName}
          onNameChange={setWizardName}
          submitting={createSiteMutation.isPending}
          error={createSiteMutation.actionError}
          onPrimaryAction={() => {
            setError(null)
            createSiteMutation.mutate(
              { displayName: wizardName.trim() || undefined },
              {
                onSuccess: () => setWizardName(''),
                onError: (err) => {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Failed to create site',
                  )
                },
              },
            )
          }}
        />
      ) : null}

      {!isColdOrg && canManage ? (
        <CreateSitePanel orgId={orgId} onError={setError} />
      ) : null}

      <SectionPanel
        title="Sites"
        hint={loading ? 'Loading…' : `${datacenters.length} site(s)`}
      >
        {loading && datacenters.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading sites…</Text>
        ) : null}
        {!loading && datacenters.length === 0 && !canManage ? (
          <Text style={orgPanelStyles.muted}>
            No sites yet. An org manager can create the first one.
          </Text>
        ) : null}
        <View style={styles.list}>
          {datacenters.map((datacenter) => {
            const members = serversBySite.get(datacenter.id) ?? []
            // Match server-owned private addresses (datacenterId often null)
            // by member serverId — never group solely by ip.datacenterId.
            const memberIdSet = new Set(members.map((m) => m.id))
            const memberPrivateIps = ips.filter(
              (ip) => ip.serverId != null && memberIdSet.has(ip.serverId),
            )
            return (
              <SiteCard
                key={datacenter.id}
                datacenter={datacenter}
                memberServers={members}
                datacenterIps={memberPrivateIps}
                linksLabel={linksLabelForSite(
                  datacenter.id,
                  vpns,
                  siteLinks,
                  siteNameById,
                  peersLoading,
                )}
                canManage={canManage}
                renaming={renamingId === datacenter.id}
                confirmDelete={confirmDeleteId === datacenter.id}
                addingNetwork={addingNetworkId === datacenter.id}
                onOpen={() =>
                  router.push(networkSiteHref(orgId, datacenter.id))
                }
                onRename={(name) => {
                  setRenamingId(datacenter.id)
                  setRenameTargetId(datacenter.id)
                  renameMutation.mutate(
                    { displayName: name || null },
                    {
                      onSuccess: () => setRenamingId(null),
                      onError: (err) => {
                        setError(
                          err instanceof Error
                            ? err.message
                            : 'Failed to rename site',
                        )
                        setRenamingId(null)
                      },
                    },
                  )
                }}
                onRequestDelete={() => setConfirmDeleteId(datacenter.id)}
                onConfirmDelete={() => {
                  deleteMutation.mutate(datacenter.id, {
                    onSuccess: () => setConfirmDeleteId(null),
                    onError: (err) => {
                      const msg =
                        err instanceof Error
                          ? err.message
                          : 'Failed to delete site'
                      setError(
                        msg.includes('datacenter_has_networks')
                          ? 'Remove or reassign networks scoped to this site before deleting.'
                          : msg,
                      )
                    },
                  })
                }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onAddPrivateNetwork={() => {
                  setAddingNetworkId(datacenter.id)
                  setError(null)
                  createNetworkMutation.mutate(
                    {
                      organizationId: orgId,
                      kind: 'datacenter',
                      datacenterId: datacenter.id,
                      // Default private site CIDR draft (RFC 1918 range; operator-editable after create)
                      cidr: '10.0.0.0/24', // NOSONAR typescript:S1313 — private-use range, not a real host address
                      displayName: `${datacenter.displayName?.trim() || 'Site'} private`,
                    },
                    {
                      onSuccess: () => {
                        setAddingNetworkId(null)
                        router.push(networkSiteHref(orgId, datacenter.id))
                      },
                      onError: (err) => {
                        setAddingNetworkId(null)
                        setError(
                          err instanceof Error
                            ? err.message
                            : 'Failed to add private network',
                        )
                      },
                    },
                  )
                }}
              />
            )
          })}
        </View>
      </SectionPanel>

      {unassignedServers.length > 0 ? (
        <SectionPanel
          title="Unassigned servers"
          hint={`${unassignedServers.length} without a site`}
        >
          <Text style={orgPanelStyles.muted}>
            These hosts are not on a site — assign them so replicas and private
            routing have a place to land.
          </Text>
          <View style={styles.list}>
            {unassignedServers.map((server) => (
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
              </View>
            ))}
          </View>
        </SectionPanel>
      ) : null}
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
  cardActions: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  calloutAction: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  suggestions: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
