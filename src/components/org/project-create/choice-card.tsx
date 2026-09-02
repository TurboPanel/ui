import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/** Vertical stack of {@link ChoiceCard}s — catalog cards, lane cards. */
export function ChoiceGrid({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: ViewStyle }>) {
  return <View style={[styles.grid, style]}>{children}</View>
}

/**
 * Wrapping two-up grid for tile-shaped choices (the setup type picker). Tiles
 * size themselves via `flexBasis`, so wider containers get more columns.
 */
export function ChoiceTileGrid({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: ViewStyle }>) {
  return <View style={[styles.tileGrid, style]}>{children}</View>
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
  icon,
  onPress,
}: Readonly<{
  label: string
  description?: string
  selected?: boolean
  disabled?: boolean
  /** Trailing note under the description, e.g. "Coming soon". */
  badge?: string
  /** Leading SVG already colored by the caller. Never emoji. */
  icon?: ReactNode
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
      <View style={styles.row}>
        {icon ? (
          <View
            style={styles.icon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {icon}
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={styles.label}>{label}</Text>
          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    // Icon centers against the whole card, not just the first line of the label.
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 22,
    height: 22,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
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
