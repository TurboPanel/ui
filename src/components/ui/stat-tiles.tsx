import type { ComponentType } from 'react'
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type StatTileIcon = ComponentType<{
  size?: number
  color: string
}>

export type StatTileItem = {
  key: string
  icon: StatTileIcon
  value: number | string
  /** Short uppercase caption, e.g. "SERVICES". Pluralize before passing. */
  label: string
  /** Spoken form for screen readers, e.g. "3 services". */
  accessibilityLabel?: string
}

function isZero(value: number | string): boolean {
  return value === 0 || value === '0'
}

/**
 * Icon-led count tiles — the compact rollup used inside a surface (compose
 * Overview, resource panels). Fill-only, no border: they read as inset chips
 * on a panel instead of a second card layer.
 *
 * For page-level fleet numbers use {@link import('@/components/org/status-stat-boxes').StatusStatBoxes}
 * instead — those are wider, bordered, and label-first.
 */
export function StatTiles({
  items,
  accessibilityLabel,
}: Readonly<{
  items: readonly StatTileItem[]
  accessibilityLabel: string
}>) {
  if (items.length === 0) return null

  return (
    <View
      style={styles.grid}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
    >
      {items.map((item) => {
        const empty = isZero(item.value)
        const tone = empty ? colors.textFaint : colors.textMuted
        const Icon = item.icon
        return (
          <View
            key={item.key}
            style={[styles.tile, empty && styles.tileEmpty]}
            accessibilityLabel={
              item.accessibilityLabel ?? `${item.value} ${item.label}`
            }
          >
            <View style={styles.valueRow}>
              <Icon size={14} color={tone} />
              <Text
                style={[styles.value, empty && styles.valueEmpty]}
                numberOfLines={1}
              >
                {item.value}
              </Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
        } as unknown as ViewStyle)
      : null),
  },
  tile: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 96,
    minHeight: 52,
    justifyContent: 'center',
    gap: 3,
    borderRadius: 8,
    backgroundColor: colors.bgArea,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tileEmpty: {
    backgroundColor: colors.bgInset,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  valueEmpty: {
    color: colors.textDim,
  },
  label: {
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
})
