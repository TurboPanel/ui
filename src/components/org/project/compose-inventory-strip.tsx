import { Fragment } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type InventoryStripItem = {
  key: string
  value: number
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
 * "x servers · x storage · x bindings" quantitative rollup for compose
 * Overview (inline value·label, not the servers overview stat boxes).
 */
export function ComposeInventoryStrip({
  items,
}: Readonly<{ items: InventoryStripItem[] }>) {
  if (items.length === 0) return null
  const accessibilityLabel = items
    .map((item) => `${item.value} ${pluralize(item)}`)
    .join(', ')

  return (
    <View style={styles.strip} accessibilityLabel={accessibilityLabel}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 ? <Text style={styles.sep}>·</Text> : null}
          <Text style={styles.item}>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}> {pluralize(item)}</Text>
          </Text>
        </Fragment>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sep: {
    color: colors.textFaint,
    fontSize: 13,
  },
})
