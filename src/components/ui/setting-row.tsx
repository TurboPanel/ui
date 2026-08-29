import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/lib/theme'

/**
 * Labelled setting: copy on the left, control on the right.
 *
 * The standard layout for a single preference inside a `SectionPanel` —
 * pair it with {@link Toggle}, `Select`, or a small `Button`. Wraps the
 * control under the copy on narrow viewports so a long description never
 * squeezes the control off the row.
 */
export function SettingRow({
  label,
  description,
  align = 'center',
  children,
}: Readonly<{
  label: string
  /** Secondary copy explaining what the setting does. */
  description?: string
  /** `start` when the control is taller than one line (e.g. a stacked group). */
  align?: 'center' | 'start'
  /** The control itself. */
  children: ReactNode
}>) {
  return (
    <View style={[styles.row, align === 'start' && styles.rowStart]}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.control}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowStart: {
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    minWidth: 200,
    gap: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 18,
  },
  control: {
    flexShrink: 0,
  },
})
