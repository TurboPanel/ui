import { StyleSheet, Text, View } from 'react-native'
import type { ContainerRole } from '@/lib/instance-api'
import { colors } from '@/lib/theme'

type ContainerStatusVariant = 'running' | 'pending' | 'stopped' | 'unknown'

function containerStatusVariant(status?: string): ContainerStatusVariant {
  switch (status) {
    case 'running':
      return 'running'
    case 'restarting':
    case 'created':
    case 'paused':
      return 'pending'
    case 'exited':
    case 'dead':
    case 'removing':
      return 'stopped'
    default:
      return 'unknown'
  }
}

const statusBadgeVariantStyles: Record<
  ContainerStatusVariant,
  { badge: { borderColor: string; backgroundColor: string }; text: { color: string } }
> = {
  running: {
    badge: { borderColor: colors.accent, backgroundColor: colors.bgActive },
    text: { color: colors.accent },
  },
  pending: {
    badge: { borderColor: colors.pending, backgroundColor: colors.bgSecondary },
    text: { color: colors.pending },
  },
  stopped: {
    badge: { borderColor: colors.error, backgroundColor: colors.bgSecondary },
    text: { color: colors.error },
  },
  unknown: {
    badge: { borderColor: colors.borderChip, backgroundColor: colors.bgSecondary },
    text: { color: colors.textMuted },
  },
}

export function ContainerStatusBadge({
  status,
}: Readonly<{ status?: string }>) {
  const variant = containerStatusVariant(status)
  const label = status?.trim() || 'unknown'
  return (
    <View style={[styles.statusBadge, statusBadgeVariantStyles[variant].badge]}>
      <Text style={[styles.statusBadgeText, statusBadgeVariantStyles[variant].text]}>
        {label}
      </Text>
    </View>
  )
}

/** Classifier pill — renders nothing for app rows so callers can drop it in unconditionally. */
export function ContainerRoleBadge({
  role,
}: Readonly<{ role: ContainerRole }>) {
  if (role === 'app') return null
  return (
    <View
      style={[
        styles.statusBadge,
        statusBadgeVariantStyles.unknown.badge,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          statusBadgeVariantStyles.unknown.text,
        ]}
      >
        Ingress
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
})
