import { Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '@/lib/admin-theme'

export function TargetChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textChip,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  chipTextActive: {
    color: colors.accent,
  },
})
