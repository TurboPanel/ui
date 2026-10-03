import { Pressable, StyleSheet, Text, View } from 'react-native'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

export type HostPickerEntry = Readonly<{ key: string; label: string }>

/**
 * One chip per hostname route on the environment. Choosing a chip shows that
 * hostname's settings below; the rest stay out of the way, so a project with
 * several sites reads one site at a time instead of one long stack.
 */
export function HostingHostPicker({
  entries,
  selectedKey,
  onSelect,
}: Readonly<{
  entries: readonly HostPickerEntry[]
  selectedKey: string | null
  onSelect: (key: string) => void
}>) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {entries.map((entry) => {
        const selected = entry.key === selectedKey
        return (
          <Pressable
            key={entry.key}
            style={[styles.chip, selected && styles.chipSelected, webPointer]}
            onPress={() => {
              onSelect(entry.key)
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={entry.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{entry.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  labelSelected: { color: chrome.accent },
})
