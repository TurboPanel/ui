import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, webPointer } from '@/lib/theme'

export type ChartLegendEntry = Readonly<{
  key: string
  label: string
  color: string
  lastValue: string
  /** When true, the series is toggled off and rendered dimmed. */
  hidden?: boolean
  /** Omit for a static, non-interactive chip. */
  onPress?: () => void
}>

export function ChartLegend({
  entries,
}: Readonly<{ entries: ChartLegendEntry[] }>) {
  if (entries.length === 0) return null

  return (
    <View style={styles.root}>
      {entries.map((entry) => {
        const hidden = entry.hidden ?? false
        return (
          <Pressable
            key={entry.key}
            onPress={entry.onPress}
            accessibilityRole={entry.onPress ? 'button' : undefined}
            accessibilityState={
              entry.onPress ? { selected: !hidden } : undefined
            }
            accessibilityLabel={`${entry.label}: ${entry.lastValue}${hidden ? ', hidden' : ''}`}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.itemPressed,
              entry.onPress && webPointer,
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: hidden ? colors.borderMuted : entry.color },
              ]}
            />
            <View style={styles.textRow}>
              <Text
                style={[styles.label, hidden && styles.textHidden]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>
              <Text
                style={[
                  styles.value,
                  { color: hidden ? colors.textFaint : entry.color },
                  hidden && styles.textHidden,
                ]}
                numberOfLines={1}
              >
                {entry.lastValue}
              </Text>
            </View>
          </Pressable>
        )
      })}
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
    flexGrow: 1,
    flexBasis: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 4,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  itemPressed: {
    backgroundColor: colors.bgInset,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  value: {
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  textHidden: {
    textDecorationLine: 'line-through',
    color: colors.textFaint,
  },
})
