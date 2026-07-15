import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createNetwork,
  deleteNetwork,
  fetchNetworks,
  fetchOrgServers,
  isForbiddenError,
  type NetworkRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function ServerPickerList({
  servers,
  selectedServerId,
  onSelect,
}: Readonly<{
  servers: OrgServerRecord[]
  selectedServerId: string
  onSelect: (id: string) => void
}>) {
  return (
    <View style={styles.list}>
      {servers.map((server) => {
        const isSelected = server.id === selectedServerId
        return (
          <Pressable
            key={server.id}
            style={[
              orgPanelStyles.detailCard,
              isSelected && styles.selectedCard,
            ]}
            onPress={() => onSelect(server.id)}
          >
            <Text style={orgPanelStyles.detailTitle}>
              {serverTitle(server)}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Status: </Text>
              {server.connected ? 'Online' : 'Offline'}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>ID: </Text>
              <Text selectable>{server.id}</Text>
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ServerPickerContent({
  servers,
  serversLoading,
  selectedServerId,
  onSelect,
}: Readonly<{
  servers: OrgServerRecord[]
  serversLoading: boolean
  selectedServerId: string
  onSelect: (id: string) => void
}>) {
  if (serversLoading && servers.length === 0) {
    return <Text style={orgPanelStyles.muted}>Loading servers…</Text>
  }
  if (servers.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No servers are assigned to this organization yet.
      </Text>
    )
  }
  return (
    <ServerPickerList
      servers={servers}
      selectedServerId={selectedServerId}
      onSelect={onSelect}
    />
  )
}

function NetworkCard({
  network,
  isDeleting,
  onDelete,
}: Readonly<{
  network: NetworkRecord
  isDeleting: boolean
  onDelete: (networkId: string) => void
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={orgPanelStyles.detailTitle}>{network.id}</Text>
        <Pressable
          style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
          disabled={isDeleting}
          onPress={() => onDelete(network.id)}
        >
          <Text style={styles.secondaryButtonText}>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Text>
        </Pressable>
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {new Date(network.createdAt).toLocaleString()}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Updated: </Text>
        {new Date(network.updatedAt).toLocaleString()}
      </Text>
    </View>
  )
}

function NetworksListContent({
  networks,
  networksLoading,
  deleting,
  onDelete,
}: Readonly<{
  networks: NetworkRecord[]
  networksLoading: boolean
  deleting: Set<string>
  onDelete: (networkId: string) => void
}>) {
  if (networksLoading && networks.length === 0) {
    return <Text style={orgPanelStyles.muted}>Loading networks…</Text>
  }
  if (networks.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No networks for this server yet.
      </Text>
    )
  }
  return (
    <View style={styles.list}>
      {networks.map((network) => (
        <NetworkCard
          key={network.id}
          network={network}
          isDeleting={deleting.has(network.id)}
          onDelete={onDelete}
        />
      ))}
    </View>
  )
}

function NetworksPanel({
  selectedServerId,
  selectedServer,
  networks,
  networksLoading,
  networksError,
  creating,
  deleting,
  onCreate,
  onRefresh,
  onDelete,
}: Readonly<{
  selectedServerId: string
  selectedServer: OrgServerRecord | null
  networks: NetworkRecord[]
  networksLoading: boolean
  networksError: string | null
  creating: boolean
  deleting: Set<string>
  onCreate: () => void
  onRefresh: () => void
  onDelete: (networkId: string) => void
}>) {
  const hint = selectedServer
    ? serverTitle(selectedServer)
    : `Server ${selectedServerId}`

  return (
    <SectionPanel title="Networks" hint={hint}>
      {networksError ? (
        <Text style={orgPanelStyles.error}>{networksError}</Text>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.primaryButton, creating && styles.buttonDisabled]}
          disabled={creating}
          onPress={onCreate}
        >
          {creating ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : null}
          <Text style={styles.primaryButtonText}>
            {creating ? 'Creating…' : 'Create network'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          disabled={networksLoading}
          onPress={onRefresh}
        >
          <Text style={styles.secondaryButtonText}>
            {networksLoading ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
      </View>

      <NetworksListContent
        networks={networks}
        networksLoading={networksLoading}
        deleting={deleting}
        onDelete={onDelete}
      />
    </SectionPanel>
  )
}

export function NetworksOverviewSection({
  orgId,
  serverId,
}: Readonly<{
  orgId: string
  serverId: string
}>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [serversError, setServersError] = useState<string | null>(null)
  const [networks, setNetworks] = useState<NetworkRecord[]>([])
  const [networksLoading, setNetworksLoading] = useState(false)
  const [networksError, setNetworksError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())

  const selectedServerId = serverId.trim()
  const selectedServer = servers.find((row) => row.id === selectedServerId) ?? null

  const loadServers = useCallback(async () => {
    setServersLoading(true)
    setServersError(null)
    try {
      const result = await fetchOrgServers()
      setServers(result.servers)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setServersError(
        err instanceof Error ? err.message : 'Failed to load servers',
      )
    } finally {
      setServersLoading(false)
    }
  }, [handleUnauthorized])

  const loadNetworks = useCallback(async () => {
    if (!selectedServerId) return

    setNetworksLoading(true)
    setNetworksError(null)
    try {
      const result = await fetchNetworks(selectedServerId)
      setNetworks(result.networks)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setNetworksError(
        err instanceof Error ? err.message : 'Failed to load networks',
      )
    } finally {
      setNetworksLoading(false)
    }
  }, [handleUnauthorized, selectedServerId])

  useEffect(() => {
    loadServers().catch(() => {
      // Errors are surfaced via serversError state inside loadServers.
    })
  }, [loadServers, orgId])

  useEffect(() => {
    if (!selectedServerId) {
      setNetworks([])
      setNetworksError(null)
      return
    }

    loadNetworks().catch(() => {
      // Errors are surfaced via networksError state inside loadNetworks.
    })
  }, [loadNetworks, selectedServerId])

  const handleSelectServer = (id: string) => {
    router.setParams({ serverId: id })
  }

  const handleCreateNetwork = async () => {
    if (!selectedServerId) return

    setCreating(true)
    setNetworksError(null)
    try {
      await createNetwork(selectedServerId)
      await loadNetworks()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setNetworksError(
        err instanceof Error ? err.message : 'Failed to create network',
      )
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteNetwork = async (networkId: string) => {
    setDeleting((current) => new Set(current).add(networkId))
    setNetworksError(null)
    try {
      await deleteNetwork(networkId)
      await loadNetworks()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setNetworksError(
        err instanceof Error ? err.message : 'Failed to delete network',
      )
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(networkId)
        return next
      })
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Networks</Text>
      <Text style={styles.copy}>
        Networks are scoped to a single managed server. Select a server to list
        and create networks.
      </Text>

      <SectionPanel title="Server" hint={`Organization ${orgId}`}>
        {serversError ? (
          <Text style={orgPanelStyles.error}>{serversError}</Text>
        ) : null}
        <ServerPickerContent
          servers={servers}
          serversLoading={serversLoading}
          selectedServerId={selectedServerId}
          onSelect={handleSelectServer}
        />
      </SectionPanel>

      {selectedServerId ? (
        <NetworksPanel
          selectedServerId={selectedServerId}
          selectedServer={selectedServer}
          networks={networks}
          networksLoading={networksLoading}
          networksError={networksError}
          creating={creating}
          deleting={deleting}
          onCreate={() => {
            handleCreateNetwork().catch(() => {
              // Errors are surfaced via networksError state.
            })
          }}
          onRefresh={() => {
            loadNetworks().catch(() => {
              // Errors are surfaced via networksError state.
            })
          }}
          onDelete={(networkId) => {
            handleDeleteNetwork(networkId).catch(() => {
              // Errors are surfaced via networksError state.
            })
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  list: {
    gap: 8,
  },
  selectedCard: {
    borderColor: colors.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
  },
  primaryButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
