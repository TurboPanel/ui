import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type StatusStatItem = {
  key: string
  label: string
  value: string
  /** Online count uses green; always pair with a text suffix or a11y label. */
  valueTone?: 'online'
  suffix?: string
}

/**
 * Equal-width hairline status tiles (uppercase label, monospace value).
 * Not glass, not a decorative bento — fleet / org glance numbers only.
 */
export function StatusStatBoxes({
  items,
  accessibilityLabel,
}: Readonly<{
  items: readonly StatusStatItem[]
  accessibilityLabel: string
}>) {
  if (items.length === 0) return null

  return (
    <View style={styles.strip} accessibilityLabel={accessibilityLabel}>
      {items.map((item) => (
        <View key={item.key} style={styles.box}>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.valueRow}>
            <Text
              style={[
                styles.value,
                item.valueTone === 'online' ? styles.valueOnline : null,
              ]}
              numberOfLines={1}
            >
              {item.value}
            </Text>
            {item.suffix ? (
              <Text style={styles.suffix} numberOfLines={1}>
                {item.suffix}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
        } as unknown as ViewStyle)
      : null),
  },
  box: {
    flex: 1,
    minWidth: 140,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgArea,
    gap: 2,
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    minWidth: 0,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.2,
  },
  valueOnline: {
    color: colors.green,
  },
  suffix: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
})
