import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { NetworkListItem } from '@/components/org/network/network-rows'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type { NetworkRecord, OrgServerRecord } from '@/lib/instance-api'
import {
  useCreateNetwork,
  useDeleteNetwork,
  useNetworks,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
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

  const hostPinOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...servers.map((server) => ({
        value: server.id,
        label: serverTitle(server),
      })),
    ],
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
        name: displayName.trim() || undefined,
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
    <SectionPanel
      title="Register Docker network"
      hint="Manage-gated"
      collapsible
      defaultCollapsed
    >
      {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}
      <TextField
        label="Display name"
        placeholder="Optional label"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextField
        label="Docker network name"
        hint="Must match compose networks.*.name on deploy."
        placeholder="turbopanel-shared"
        value={dockerNetworkName}
        onChangeText={setDockerNetworkName}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <FormField
        label="Host pin (optional)"
        hint="Pin to a host for a host-local external network."
      >
        <SegmentedControl
          options={hostPinOptions}
          value={hostPinServerId}
          onChange={setHostPinServerId}
          accessibilityLabel="Host pin"
        />
      </FormField>
      <Button
        label="Register"
        variant="primary"
        busy={creating}
        disabled={createDisabled}
        onPress={handleRegister}
      />
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
      {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}
      {loading && networks.length === 0 ? (
        <LoadingState label="Loading Docker networks…" />
      ) : null}
      {!loading && networks.length === 0 ? (
        <EmptyState title="No Docker networks registered yet." />
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
 * Platform-allocated managed-engine network. The API refuses PATCH and DELETE
 * on these rows, so this is a read-only listing with no affordances. Hidden
 * entirely until the platform has allocated one.
 */
function ManagedNetworkListPanel({
  networks,
}: Readonly<{ networks: NetworkRecord[] }>) {
  if (networks.length === 0) return null

  return (
    <SectionPanel title="Managed networks" hint="Platform-allocated">
      <View style={styles.list}>
        {networks.map((network) => (
          <NetworkListItem key={network.id} network={network} showDelete={false} />
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
  const managedQuery = useNetworks(orgId, { kind: 'managed' })
  const serversQuery = useOrgServers(orgId)

  const networks = networksQuery.data?.networks ?? []
  const managedNetworks = managedQuery.data?.networks ?? []
  const servers = serversQuery.data?.servers ?? []

  const loading =
    (networksQuery.isLoading && !networksQuery.isPlaceholderData) ||
    serversQuery.isLoading

  const queryError = networksQuery.isError
    ? resolveErrorMessage(networksQuery.error, 'Failed to load Docker networks')
    : null

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Docker networks</Text>
      <Text style={panelStyles.pageCopy}>
        External Docker network registry for compose. Compose must reference the
        same name under networks.*.name.
      </Text>

      {queryError ? <Text style={panelStyles.error}>{queryError}</Text> : null}

      {canManage ? (
        <DockerNetworkRegisterPanel orgId={orgId} servers={servers} />
      ) : null}

      <DockerNetworkListPanel
        orgId={orgId}
        networks={networks}
        loading={loading}
        canManage={canManage}
      />

      <ManagedNetworkListPanel networks={managedNetworks} />
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
})
