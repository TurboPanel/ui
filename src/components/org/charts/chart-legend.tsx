import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

export type ChartLegendEntry = Readonly<{
  key: string
  label: string
  color: string
  lastValue: string
}>

export function ChartLegend({
  entries,
}: Readonly<{ entries: ChartLegendEntry[] }>) {
  if (entries.length === 0) return null

  return (
    <View style={styles.root}>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: entry.color }]} />
          <Text style={styles.label} numberOfLines={1}>
            {entry.label}
          </Text>
          <Text style={styles.value}>{entry.lastValue}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  value: {
    color: colors.textBody,
    fontSize: 12,
    fontFamily: 'monospace',
  },
})
