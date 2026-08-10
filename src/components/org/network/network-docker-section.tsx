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
import { NetworkListItem } from '@/components/org/network/network-rows'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { NetworkRecord, OrgServerRecord } from '@/lib/instance-api'
import {
  useCreateNetwork,
  useDeleteNetwork,
  useNetworks,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

type ServerOption = { id: string; label: string }

function HostPinChips({
  options,
  selectedId,
  onSelect,
}: Readonly<{
  options: ServerOption[]
  selectedId: string
  onSelect: (id: string) => void
}>) {
  return (
    <View style={styles.chipRow}>
      <HostPinChip
        label="None"
        active={selectedId === ''}
        onPress={() => onSelect('')}
      />
      {options.map((option) => (
        <HostPinChip
          key={option.id}
          label={option.label}
          active={selectedId === option.id}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </View>
  )
}

function HostPinChip({
  label,
  active,
  onPress,
}: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, webPointer]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * Register-network form. Owns its own field state so the parent section only
 * coordinates data fetching and layout.
 */
function DockerNetworkRegisterPanel({
  orgId,
  servers,
}: Readonly<{ orgId: string; servers: OrgServerRecord[] }>) {
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [dockerNetworkName, setDockerNetworkName] = useState('')
  const [hostPinServerId, setHostPinServerId] = useState('')
  const createMutation = useCreateNetwork(orgId)

  const serverOptions = useMemo(
    () =>
      servers.map((server) => ({
        id: server.id,
        label: serverTitle(server),
      })),
    [servers],
  )

  const creating = createMutation.isPending
  const createDisabled = creating || dockerNetworkName.trim().length === 0
  const displayError = error ?? createMutation.actionError

  function handleRegister() {
    setError(null)
    createMutation.mutate(
      {
        organizationId: orgId,
        kind: 'docker',
        displayName: displayName.trim() || undefined,
        serverId: hostPinServerId || undefined,
        options: {
          dockerNetworkName: dockerNetworkName.trim(),
        },
      },
      {
        onSuccess: () => {
          setDisplayName('')
          setDockerNetworkName('')
          setHostPinServerId('')
        },
        onError: () => {
          setError(createMutation.actionError ?? 'Failed to create Docker network')
        },
      },
    )
  }

  return (
    <SectionPanel title="Register Docker network" hint="Manage-gated">
      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}
      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Optional label"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Docker network name</Text>
      <Text style={orgPanelStyles.muted}>
        Must match compose networks.*.name on deploy.
      </Text>
      <TextInput
        value={dockerNetworkName}
        onChangeText={setDockerNetworkName}
        placeholder="turbopanel-shared"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.fieldLabel}>Host pin (optional)</Text>
      <Text style={orgPanelStyles.muted}>
        Pin to a host for a host-local external network.
      </Text>
      <HostPinChips
        options={serverOptions}
        selectedId={hostPinServerId}
        onSelect={setHostPinServerId}
      />
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          createDisabled && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={createDisabled}
        onPress={handleRegister}
      >
        {creating ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Register</Text>
        )}
      </Pressable>
    </SectionPanel>
  )
}

function DockerNetworkListPanel({
  orgId,
  networks,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  networks: NetworkRecord[]
  loading: boolean
  canManage: boolean
}>) {
  const [error, setError] = useState<string | null>(null)
  const deleteMutation = useDeleteNetwork(orgId)
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : undefined
  const displayError = error ?? deleteMutation.actionError

  function handleDelete(networkId: string) {
    setError(null)
    deleteMutation.mutate(networkId, {
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete Docker network')
      },
    })
  }

  return (
    <SectionPanel
      title="Docker networks"
      hint={loading ? 'Loading…' : `${networks.length} network(s)`}
    >
      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}
      {loading && networks.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading Docker networks…</Text>
      ) : null}
      {!loading && networks.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No Docker networks registered yet.</Text>
      ) : null}
      <View style={styles.list}>
        {networks.map((network) => (
          <NetworkListItem
            key={network.id}
            network={network}
            isDeleting={deletingId === network.id}
            showDelete={canManage}
            onDelete={handleDelete}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

/**
 * Docker network registry for compose external networks.
 * Deliberately quiet — deploy identity, not topology.
 */
export function NetworkDockerSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')

  const networksQuery = useNetworks(orgId, { kind: 'docker' })
  const serversQuery = useOrgServers(orgId)

  const networks = networksQuery.data?.networks ?? []
  const servers = serversQuery.data?.servers ?? []

  const loading =
    (networksQuery.isLoading && !networksQuery.isPlaceholderData) ||
    serversQuery.isLoading

  const queryError = networksQuery.isError
    ? resolveErrorMessage(networksQuery.error, 'Failed to load Docker networks')
    : null

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Docker networks</Text>
      <Text style={orgPanelStyles.pageCopy}>
        External Docker network registry for compose. Compose must reference the
        same name under networks.*.name.
      </Text>

      {queryError ? <Text style={orgPanelStyles.error}>{queryError}</Text> : null}

      {canManage ? (
        <DockerNetworkRegisterPanel orgId={orgId} servers={servers} />
      ) : null}

      <DockerNetworkListPanel
        orgId={orgId}
        networks={networks}
        loading={loading}
        canManage={canManage}
      />
    </View>
  )
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
