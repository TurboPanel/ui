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
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { VPN_CIDR_IN_USE_ERROR, type VpnRecord } from '@/lib/instance-api'
import {
  peersQueryOptions,
  useCreateVpn,
  useDeleteVpn,
  useRenameVpn,
  useVpns,
} from '@/lib/queries/topology'
import { useCan } from '@/lib/query-client'
import { vpnDetailHref } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

function vpnTitle(vpn: VpnRecord): string {
  return vpn.displayName?.trim() || 'Unnamed VPN'
}

function VpnCard({
  vpn,
  peerCountLabel,
  canManage,
  renaming,
  confirmDelete,
  onOpen,
  onRename,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: Readonly<{
  vpn: VpnRecord
  peerCountLabel: string
  canManage: boolean
  renaming: boolean
  confirmDelete: boolean
  onOpen: () => void
  onRename: (displayName: string) => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}>) {
  const [draftName, setDraftName] = useState(vpn.displayName?.trim() ?? '')

  return (
    <Pressable
      style={[orgPanelStyles.detailCard, webPointer]}
      onPress={onOpen}
    >
      <Text style={orgPanelStyles.detailTitle}>{vpnTitle(vpn)}</Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>CIDR: </Text>
        <Text style={styles.mono}>{vpn.cidr}</Text>
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Peers · gateways: </Text>
        {peerCountLabel}
      </Text>
      <Text style={orgPanelStyles.muted}>Open to manage peers and apply.</Text>

      {canManage ? (
        <View style={styles.cardActions} onStartShouldSetResponder={() => true}>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
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
              Deletes this VPN and its peers. WireGuard configs already applied
              on hosts are not torn down automatically.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  )
}

export function VpnsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [meshCidr, setMeshCidr] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const vpnsQuery = useVpns(orgId)
  const createMutation = useCreateVpn(orgId)
  const renameMutation = useRenameVpn(orgId)
  const deleteMutation = useDeleteVpn(orgId)

  const vpns = vpnsQuery.data?.vpns ?? []

  const peerQueries = useQueries({
    queries: vpns.map((vpn) => ({
      ...peersQueryOptions(orgId, vpn.id),
      enabled: vpns.length > 0,
    })),
  })

  const peerCountByVpnId = useMemo(() => {
    const map = new Map<string, string>()
    for (let i = 0; i < vpns.length; i++) {
      const vpn = vpns[i]
      const query = peerQueries[i]
      if (!vpn) continue
      if (!query || query.isLoading || query.isPending) {
        map.set(vpn.id, '—')
        continue
      }
      const peers = query.data?.peers ?? []
      const gateways = peers.filter((p) => p.role === 'gateway').length
      map.set(vpn.id, `${peers.length} · ${gateways}`)
    }
    return map
  }, [peerQueries, vpns])

  let queryError: string | null = null
  if (vpnsQuery.isError) {
    queryError =
      vpnsQuery.error instanceof Error
        ? vpnsQuery.error.message
        : 'Failed to load VPNs'
  }
  const displayError =
    error ?? createMutation.actionError ?? renameMutation.actionError ?? deleteMutation.actionError ?? queryError

  const loading = vpnsQuery.isLoading
  const createDisabled =
    createMutation.isPending || meshCidr.trim().length === 0

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>VPNs</Text>
      <Text style={orgPanelStyles.pageCopy}>
        WireGuard meshes that link datacenters through peer servers. Not every
        host needs to be a peer — more peers per site improve redundancy.
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      {canManage ? (
        <SectionPanel title="Create VPN" hint="Manage-gated">
          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Org mesh"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Mesh CIDR</Text>
          <Text style={orgPanelStyles.muted}>
            Required overlay prefix. Peer interface addresses are allocated from
            this CIDR.
          </Text>
          <TextInput
            value={meshCidr}
            onChangeText={setMeshCidr}
            // NOSONAR typescript:S1313 — example mesh CIDR placeholder only
            placeholder="e.g. 10.200.0.0/24"
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
                  displayName: displayName.trim() || undefined,
                  cidr: meshCidr.trim(),
                },
                {
                  onSuccess: () => {
                    setDisplayName('')
                    setMeshCidr('')
                  },
                  onError: () => {
                    const message =
                      createMutation.actionError ?? 'Failed to create VPN'
                    setError(
                      message.includes(VPN_CIDR_IN_USE_ERROR)
                        ? 'Another mesh already uses that CIDR.'
                        : message,
                    )
                  },
                },
              )
            }}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Create VPN</Text>
            )}
          </Pressable>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="VPN meshes"
        hint={loading ? 'Loading…' : `${vpns.length} mesh(es)`}
      >
        {loading && vpns.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading VPNs…</Text>
        ) : null}
        {!loading && vpns.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No VPNs yet. Create a mesh, add peer servers, then apply WireGuard.
          </Text>
        ) : null}
        <View style={styles.list}>
          {vpns.map((vpn) => (
            <VpnCard
              key={vpn.id}
              vpn={vpn}
              peerCountLabel={peerCountByVpnId.get(vpn.id) ?? '—'}
              canManage={canManage}
              renaming={renamingId === vpn.id}
              confirmDelete={confirmDeleteId === vpn.id}
              onOpen={() => router.push(vpnDetailHref(orgId, vpn.id))}
              onRename={(name) => {
                setRenamingId(vpn.id)
                renameMutation.mutate(
                  { vpnId: vpn.id, name },
                  {
                    onSuccess: () => setRenamingId(null),
                    onError: () => {
                      setError(renameMutation.actionError ?? 'Failed to rename VPN')
                      setRenamingId(null)
                    },
                  },
                )
              }}
              onRequestDelete={() => setConfirmDeleteId(vpn.id)}
              onConfirmDelete={() => {
                deleteMutation.mutate(vpn.id, {
                  onSuccess: () => setConfirmDeleteId(null),
                  onError: () => {
                    setError(deleteMutation.actionError ?? 'Failed to delete VPN')
                  },
                })
              }}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </View>
      </SectionPanel>
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
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
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
  buttonDisabled: {
    opacity: 0.55,
  },
})
