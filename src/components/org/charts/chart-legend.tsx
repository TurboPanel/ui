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
          <View style={styles.swatchWrap}>
            <View style={[styles.swatch, { backgroundColor: entry.color }]} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {entry.label}
          </Text>
          <View style={styles.valuePill}>
            <Text style={styles.value}>{entry.lastValue}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  swatchWrap: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  valuePill: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 2,
  },
  value: {
    color: colors.textBody,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
})
