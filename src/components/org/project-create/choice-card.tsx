import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { webPointer } from '@/components/org/org-panel-styles'
import { chrome, colors, spacing } from '@/lib/theme'

/** Vertical stack of {@link ChoiceCard}s — type cards, catalog cards. */
export function ChoiceGrid({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: ViewStyle }>) {
  return <View style={[styles.grid, style]}>{children}</View>
}

/**
 * Selectable card in the create wizard. Selection is local state only — nothing
 * is provisioned until the step's own Create button is pressed.
 */
export function ChoiceCard({
  label,
  description,
  selected = false,
  disabled = false,
  badge,
  onPress,
}: Readonly<{
  label: string
  description?: string
  selected?: boolean
  disabled?: boolean
  /** Trailing note under the description, e.g. "Coming soon". */
  badge?: string
  onPress: () => void
}>) {
  return (
    <Pressable
      style={[
        styles.card,
        webPointer,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
    >
      <Text style={styles.label}>{label}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  badge: {
    color: colors.pending,
    fontSize: 12,
    fontWeight: '600',
  },
})
