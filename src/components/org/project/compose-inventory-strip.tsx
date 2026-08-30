import { StyleSheet, Text, View } from 'react-native'
import type { StatTileIcon } from '@/components/ui'
import { colors, spacing } from '@/lib/theme'

export type InventoryStripItem = {
  key: string
  value: number
  icon: StatTileIcon
  /** Singular noun, e.g. "server" — pluralized automatically. */
  noun: string
  /** Override the plural form when it isn't just `${noun}s`. */
  pluralNoun?: string
}

function pluralize(item: InventoryStripItem): string {
  if (item.value === 1) return item.noun
  return item.pluralNoun ?? `${item.noun}s`
}

/**
 * The compose Overview rollup (environments / servers / services / networks /
 * volumes / storage / bindings at the active scope) as one compact inline row
 * — `icon count LABEL` groups, not tiles — so the counts spend a single line
 * of height and the diagram below stays the content of the surface. Zero
 * counts are dropped entirely: the strip states what the scope *has*, not the
 * catalog of everything it could have.
 */
export function ComposeInventoryStrip({
  items,
}: Readonly<{ items: InventoryStripItem[] }>) {
  const present = items.filter((item) => item.value > 0)
  if (present.length === 0) return null

  return (
    <View
      style={styles.row}
      accessibilityRole="summary"
      accessibilityLabel={present
        .map((item) => `${item.value} ${pluralize(item)}`)
        .join(', ')}
    >
      {present.map((item) => {
        const noun = pluralize(item)
        const Icon = item.icon
        return (
          <View
            key={item.key}
            style={styles.item}
            accessibilityLabel={`${item.value} ${noun}`}
          >
            <Icon size={13} color={colors.textMuted} />
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}>{noun}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    flexShrink: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: -0.3,
  },
  label: {
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
})
