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
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createVpn,
  deleteVpn,
  fetchPeers,
  fetchVpns,
  isForbiddenError,
  updateVpn,
  VPN_CIDR_IN_USE_ERROR,
  type VpnRecord,
} from '@/lib/instance-api'
import { vpnDetailHref } from '@/lib/org-navigation'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function friendlyCreateError(err: unknown): string {
  const message = errorMessage(err, 'Failed to create VPN')
  if (message.includes(VPN_CIDR_IN_USE_ERROR)) {
    return 'Another mesh already uses that CIDR.'
  }
  return message
}

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
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [meshCidr, setMeshCidr] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const vpnsQuery = useQuery({
    queryKey: ['org', orgId, 'vpns'],
    queryFn: fetchVpns,
  })
  useForbiddenRecovery(vpnsQuery.error)

  const vpns = vpnsQuery.data?.vpns ?? []

  const peerQueries = useQueries({
    queries: vpns.map((vpn) => ({
      queryKey: ['org', orgId, 'vpns', vpn.id, 'peers'],
      queryFn: () => fetchPeers(vpn.id),
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

  const peerQueryError = peerQueries.find((q) => q.error)?.error ?? null
  useForbiddenRecovery(peerQueryError)

  const createMutation = useMutation({
    mutationFn: () =>
      createVpn({
        displayName: displayName.trim() || undefined,
        cidr: meshCidr.trim(),
      }),
    onSuccess: async () => {
      setError(null)
      setDisplayName('')
      setMeshCidr('')
      await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'vpns'] })
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(friendlyCreateError(err))
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateVpn(id, { displayName: name || null }),
    onSuccess: async () => {
      setError(null)
      setRenamingId(null)
      await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'vpns'] })
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to rename VPN'))
      setRenamingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVpn(id),
    onSuccess: async () => {
      setError(null)
      setConfirmDeleteId(null)
      await queryClient.invalidateQueries({ queryKey: ['org', orgId, 'vpns'] })
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to delete VPN'))
    },
  })

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

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {vpnsQuery.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(vpnsQuery.error, 'Failed to load VPNs')}
        </Text>
      ) : null}

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
            onPress={() => createMutation.mutate()}
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
                renameMutation.mutate({ id: vpn.id, name })
              }}
              onRequestDelete={() => setConfirmDeleteId(vpn.id)}
              onConfirmDelete={() => deleteMutation.mutate(vpn.id)}
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
