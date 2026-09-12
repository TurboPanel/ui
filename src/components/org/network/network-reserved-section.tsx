import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { NetworkErrorLine } from '@/components/org/network/network-error-line'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  LoadingState,
  MonoText,
  SectionPanel,
  TextField,
} from '@/components/ui'
import { isValidCidr, normalizeCidr } from '@/lib/cidr'
import type { NetworkRecord } from '@/lib/instance-api'
import {
  describeNetworkError,
  type NetworkErrorDescription,
} from '@/lib/network-error-copy'
import {
  useCreateNetwork,
  useDeleteNetwork,
  useNetworks,
  useUpdateNetwork,
} from '@/lib/queries/topology'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

/** Typical VPN allocation shown as a form hint — not a reachable host. */
const PLACEHOLDER_RESERVED_CIDR = '10.8.0.0/16' // NOSONAR typescript:S1313 — RFC1918 form placeholder, not a reachable host

function cidrHint(draft: string): string | undefined {
  const normalized = normalizeCidr(draft)
  if (normalized && normalized !== draft.trim()) return normalized
  return undefined
}

/**
 * Add form. Sends `kind: 'reserved'` with **no** `datacenterId` / `serverId`
 * — a reserved range is org-scoped by definition.
 */
function ReservedRangeAddPanel({ orgId }: Readonly<{ orgId: string }>) {
  const [name, setName] = useState('')
  const [cidr, setCidr] = useState('')
  const [error, setError] = useState<NetworkErrorDescription | null>(null)
  const createMutation = useCreateNetwork(orgId)

  const normalized = normalizeCidr(cidr)
  const creating = createMutation.isPending
  const createDisabled = creating || !normalized

  function handleAdd() {
    if (!isValidCidr(cidr) || !normalized) {
      setError({
        message: 'Enter a valid IPv4 or IPv6 CIDR.',
        code: null,
        conflictingCidr: null,
      })
      return
    }
    setError(null)
    createMutation.mutate(
      {
        organizationId: orgId,
        kind: 'reserved',
        cidr: normalized,
        name: name.trim() || undefined,
      },
      {
        onSuccess: () => {
          setName('')
          setCidr('')
        },
        onError: (err) => {
          setError(describeNetworkError(err, 'Failed to reserve range'))
        },
      },
    )
  }

  return (
    <SectionPanel title="Reserve a range" hint="Manage-gated">
      <NetworkErrorLine error={error} />
      <TextField
        label="Name"
        placeholder="e.g. Corporate VPN"
        value={name}
        onChangeText={setName}
        editable={!creating}
        accessibilityLabel="Reserved range name"
      />
      <TextField
        label="CIDR"
        placeholder={PLACEHOLDER_RESERVED_CIDR}
        value={cidr}
        onChangeText={setCidr}
        hint={cidrHint(cidr)}
        editable={!creating}
        accessibilityLabel="Reserved range CIDR"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <Button
        label="Reserve"
        variant="primary"
        busy={creating}
        disabled={createDisabled}
        onPress={handleAdd}
        accessibilityLabel="Reserve range"
      />
    </SectionPanel>
  )
}

function ReservedRangeCard({
  network,
  canManage,
  pending,
  deleting,
  onRename,
  onDelete,
}: Readonly<{
  network: NetworkRecord
  canManage: boolean
  pending: boolean
  deleting: boolean
  onRename: (name: string) => void
  onDelete: () => void
}>) {
  const [draftName, setDraftName] = useState<string | null>(null)
  const storedName = network.name?.trim() ?? ''
  const shownName = draftName ?? storedName
  const dirty = draftName !== null && draftName.trim() !== storedName

  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <MonoText selectable>{network.cidr ?? '—'}</MonoText>
          <Badge label="Reserved" />
        </View>
        {canManage ? (
          <ConfirmButton
            label={deleting ? 'Deleting…' : 'Delete'}
            confirmLabel="Delete reserved range"
            prompt="Stop reserving this range? TurboPanel may then assign addresses inside it."
            busy={deleting}
            disabled={pending}
            onConfirm={onDelete}
          />
        ) : null}
      </View>
      {canManage ? (
        <View style={styles.renameRow}>
          <TextField
            label="Name"
            value={shownName}
            onChangeText={setDraftName}
            placeholder="Optional"
            editable={!pending}
            accessibilityLabel={`Name for reserved range ${network.cidr ?? network.id}`}
          />
          <ButtonRow>
            <Button
              label="Save name"
              size="sm"
              disabled={pending || !dirty}
              onPress={() => {
                onRename(shownName.trim())
                setDraftName(null)
              }}
              accessibilityLabel={`Save name for reserved range ${network.cidr ?? network.id}`}
            />
          </ButtonRow>
        </View>
      ) : null}
      {!canManage && storedName ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Name: </Text>
          {storedName}
        </Text>
      ) : null}
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Reserved: </Text>
        {new Date(network.createdAt).toLocaleString()}
      </Text>
    </View>
  )
}

function reservedListHint(loading: boolean, count: number): string {
  if (loading) return 'Loading…'
  if (count === 1) return '1 range'
  return `${count} ranges`
}

function ReservedRangeListPanel({
  orgId,
  networks,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  networks: readonly NetworkRecord[]
  loading: boolean
  canManage: boolean
}>) {
  const [error, setError] = useState<NetworkErrorDescription | null>(null)
  const updateMutation = useUpdateNetwork(orgId)
  const deleteMutation = useDeleteNetwork(orgId)
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : undefined
  const pending = updateMutation.isPending || deleteMutation.isPending

  function handleRename(networkId: string, name: string) {
    setError(null)
    updateMutation.mutate(
      { networkId, body: { name: name.length > 0 ? name : null } },
      {
        onError: (err) => {
          setError(describeNetworkError(err, 'Failed to rename reserved range'))
        },
      },
    )
  }

  function handleDelete(networkId: string) {
    setError(null)
    deleteMutation.mutate(networkId, {
      onError: (err) => {
        setError(describeNetworkError(err, 'Failed to delete reserved range'))
      },
    })
  }

  return (
    <SectionPanel
      title="Reserved ranges"
      hint={reservedListHint(loading, networks.length)}
    >
      <NetworkErrorLine error={error} />
      {loading && networks.length === 0 ? (
        <LoadingState label="Loading reserved ranges…" />
      ) : null}
      {!loading && networks.length === 0 ? (
        <EmptyState
          title="No reserved ranges."
          hint="Nothing outside TurboPanel has been declared yet — allocators may use any private range that does not collide with a subnet, the mesh, or a Docker network."
          panel
        />
      ) : null}
      <View style={styles.list}>
        {networks.map((network) => (
          <ReservedRangeCard
            key={network.id}
            network={network}
            canManage={canManage}
            pending={pending}
            deleting={deletingId === network.id}
            onRename={(name) => handleRename(network.id, name)}
            onDelete={() => handleDelete(network.id)}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

/**
 * Reserved ranges — CIDRs TurboPanel must never assign to containers,
 * meshes, or internal services because something outside TurboPanel already
 * routes them. Org-scoped rows (`kind: 'reserved'`), no datacenter or host.
 */
export function NetworkReservedSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const networksQuery = useNetworks(orgId, { kind: 'reserved' })
  const networks = networksQuery.data?.networks ?? []
  const loading = networksQuery.isLoading && !networksQuery.isPlaceholderData
  const queryError = networksQuery.isError
    ? describeNetworkError(networksQuery.error, 'Failed to load reserved ranges')
    : null

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Reserved ranges</Text>
      <Text style={panelStyles.pageCopy}>
        Ranges TurboPanel must never assign — to containers, the mesh, or
        internal services — because something outside TurboPanel already
        routes them: a corporate VPN, a remote branch, an upstream allocation.
        Declaring them here keeps those addresses able to reach Caddy and
        published services without colliding with a TurboPanel-assigned
        address. The mesh and Docker address-pool allocators avoid them too.
      </Text>

      <NetworkErrorLine error={queryError} />

      {canManage ? <ReservedRangeAddPanel orgId={orgId} /> : null}

      <ReservedRangeListPanel
        orgId={orgId}
        networks={networks}
        loading={loading}
        canManage={canManage}
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  renameRow: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
})
