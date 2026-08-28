import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  MonoText,
} from '@/components/ui'
import type { NetworkKind, NetworkRecord, IpRecord } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

function networkTitle(network: NetworkRecord): string {
  if (network.kind === 'managed') {
    return network.name?.trim() || 'Managed database network'
  }
  const dockerName = readDockerNetworkName(network)
  if (dockerName) return network.name?.trim() || dockerName
  return network.name?.trim() || network.cidr?.trim() || network.id
}

export function readDockerNetworkName(network: NetworkRecord): string | null {
  const options = network.options
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const raw = (options as { dockerNetworkName?: unknown }).dockerNetworkName
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  }
  return null
}

function kindLabel(kind: NetworkKind): string {
  if (kind === 'datacenter') return 'Datacenter'
  if (kind === 'managed') return 'Managed'
  return 'Docker'
}

/** Platform-allocated rows carry no CIDR by design — stay silent about it. */
function renderCidr(network: NetworkRecord, isPlatformOwned: boolean) {
  if (network.cidr) return <MonoText selectable>{network.cidr}</MonoText>
  if (isPlatformOwned) return null
  return <Text style={orgPanelStyles.muted}>No CIDR</Text>
}

export function NetworkListItem({
  network,
  isDeleting,
  onDelete,
  showDelete = true,
}: Readonly<{
  network: NetworkRecord
  isDeleting?: boolean
  onDelete?: (networkId: string) => void
  showDelete?: boolean
}>) {
  const dockerName = readDockerNetworkName(network)
  // Platform-allocated rows are read-only: the API refuses PATCH and DELETE
  // with `managed_network_immutable`, so offer no affordance for either.
  const isPlatformOwned = network.kind === 'managed'
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={orgPanelStyles.detailTitle}>{networkTitle(network)}</Text>
        {showDelete && onDelete && !isPlatformOwned ? (
          <ConfirmButton
            label={isDeleting ? 'Deleting…' : 'Delete'}
            confirmLabel="Delete network"
            prompt="Remove this network?"
            busy={isDeleting}
            onConfirm={() => onDelete(network.id)}
          />
        ) : null}
      </View>
      <View style={styles.badgeRow}>
        <Badge label={kindLabel(network.kind)} />
        {dockerName ? <MonoText selectable>{dockerName}</MonoText> : null}
        {isPlatformOwned ? (
          <Text style={orgPanelStyles.muted}>Platform-managed</Text>
        ) : null}
        {renderCidr(network, isPlatformOwned)}
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {new Date(network.createdAt).toLocaleString()}
      </Text>
    </View>
  )
}

export function IpListRow({
  ip,
  serverLabel,
  networkLabel,
  datacenterLabel,
  isDeleting,
  onDelete,
  showDelete = true,
  onEdit,
  showEdit = false,
}: Readonly<{
  ip: IpRecord
  serverLabel?: string | null
  networkLabel?: string | null
  datacenterLabel?: string | null
  isDeleting?: boolean
  onDelete?: (ipId: string) => void
  showDelete?: boolean
  onEdit?: (ipId: string) => void
  showEdit?: boolean
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <MonoText selectable>{ip.address}</MonoText>
        <ButtonRow>
          {showEdit && onEdit ? (
            <Button
              label="Edit"
              size="sm"
              onPress={() => onEdit(ip.id)}
              accessibilityLabel={`Edit ${ip.address}`}
            />
          ) : null}
          {showDelete && onDelete ? (
            <ConfirmButton
              label={isDeleting ? 'Deleting…' : 'Delete'}
              confirmLabel="Delete address"
              prompt="Remove this address?"
              busy={isDeleting}
              onConfirm={() => onDelete(ip.id)}
            />
          ) : null}
        </ButtonRow>
      </View>
      {ip.description?.trim() ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Description: </Text>
          {ip.description.trim()}
        </Text>
      ) : null}
      <View style={styles.badgeRow}>
        <Badge label={`v${ip.version}`} />
        <Badge label={ip.scope} />
        <Badge label={ip.allocation} />
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Server: </Text>
        {serverLabel ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Network: </Text>
        {networkLabel ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Site: </Text>
        {datacenterLabel ?? '—'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
})
