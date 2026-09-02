import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, webPointer } from '@/lib/theme'

export type ChartLegendEntry = Readonly<{
  key: string
  label: string
  color: string
  lastValue: string
  /** When true, the series is toggled off and rendered dimmed. */
  hidden?: boolean
}>

/** `#abc` / `#aabbcc` → `rgba(r, g, b, alpha)`; unrecognized input passes through. */
function hexToRgba(hex: string, alpha: number): string {
  let normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (normalized.length !== 6) return hex
  const value = Number.parseInt(normalized, 16)
  if (!Number.isFinite(value)) return hex
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function ChartLegend({
  entries,
  onToggle,
}: Readonly<{
  entries: ChartLegendEntry[]
  /** Omit to render a static, non-interactive legend. */
  onToggle?: (key: string) => void
}>) {
  if (entries.length === 0) return null

  return (
    <View style={styles.root}>
      {entries.map((entry) => {
        const hidden = entry.hidden ?? false
        return (
          <Pressable
            key={entry.key}
            onPress={onToggle ? () => onToggle(entry.key) : undefined}
            accessibilityRole={onToggle ? 'button' : undefined}
            accessibilityState={onToggle ? { selected: !hidden } : undefined}
            accessibilityLabel={`${entry.label}: ${entry.lastValue}${hidden ? ', hidden' : ''}`}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: hexToRgba(entry.color, hidden ? 0.04 : 0.16),
                borderColor: hexToRgba(entry.color, hidden ? 0.16 : 0.5),
                opacity: pressed ? 0.75 : 1,
              },
              onToggle && webPointer,
            ]}
          >
            <Text
              style={[
                styles.value,
                { color: hidden ? colors.textFaint : entry.color },
                hidden && styles.valueHidden,
              ]}
              numberOfLines={1}
            >
              {entry.lastValue}
            </Text>
            <Text
              style={[styles.label, hidden && styles.labelHidden]}
              numberOfLines={1}
            >
              {entry.label}
            </Text>
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
    flexBasis: 92,
    minWidth: 84,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 1,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  valueHidden: {
    textDecorationLine: 'line-through',
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelHidden: {
    color: colors.textFaint,
  },
})
