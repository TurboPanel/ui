import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export function ProductionBadge({
  compact = false,
}: Readonly<{ compact?: boolean }>) {
  return (
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <View style={styles.dot} />
      <Text style={[styles.label, compact && styles.labelCompact]}>
        Production
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  labelCompact: {
    fontSize: 10,
  },
})
