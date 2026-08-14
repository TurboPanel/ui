import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import type { NetworkKind, NetworkRecord, IpRecord } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function networkTitle(network: NetworkRecord): string {
  const dockerName = readDockerNetworkName(network)
  if (dockerName) return network.displayName?.trim() || dockerName
  return network.displayName?.trim() || network.cidr?.trim() || network.id
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
  return 'Docker'
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
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={orgPanelStyles.detailTitle}>{networkTitle(network)}</Text>
        {showDelete && onDelete ? (
          <Pressable
            style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
            disabled={isDeleting}
            onPress={() => onDelete(network.id)}
          >
            <Text style={styles.secondaryButtonText}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{kindLabel(network.kind)}</Text>
        {dockerName ? (
          <Text style={styles.mono} selectable>
            {dockerName}
          </Text>
        ) : null}
        {network.cidr ? (
          <Text style={styles.mono} selectable>
            {network.cidr}
          </Text>
        ) : (
          <Text style={orgPanelStyles.muted}>No CIDR</Text>
        )}
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
        <Text style={styles.mono} selectable>
          {ip.address}
        </Text>
        <View style={styles.cardActions}>
          {showEdit && onEdit ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => onEdit(ip.id)}
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          ) : null}
          {showDelete && onDelete ? (
            <Pressable
              style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
              disabled={isDeleting}
              onPress={() => onDelete(ip.id)}
            >
              <Text style={styles.secondaryButtonText}>
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {ip.displayName?.trim() ? (
        <Text style={orgPanelStyles.detailTitle}>{ip.displayName}</Text>
      ) : null}
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>v{ip.version}</Text>
        <Text style={styles.badge}>{ip.scope}</Text>
        <Text style={styles.badge}>{ip.allocation}</Text>
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
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bgSecondary,
  },
  mono: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
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
