import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { ListGroup, ListRow } from '@/components/ui/v4'
import type { ChangedSetting } from '@/lib/managed-advanced-settings'
import { colors, spacing, webPointer } from '@/lib/theme'

/**
 * The "Advanced" part of a managed section. Closed by default; the settings
 * changed from their defaults are listed under it even while it is closed,
 * so a changed value always shows.
 */
export function ManagedAdvancedDisclosure({
  note,
  changed,
  children,
}: Readonly<{
  /** What is inside, in a few words ("memory, CPU, engine settings"). */
  note: string
  changed: readonly ChangedSetting[]
  children: ReactNode
}>) {
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.root}>
      <Pressable
        style={[styles.toggle, webPointer]}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide advanced settings' : 'Show advanced settings'}
      >
        <HeaderChevron size={12} color={colors.textBody} open={open} />
        <Text style={styles.title}>Advanced</Text>
        <Text style={styles.note}>{note}</Text>
      </Pressable>
      {!open && changed.length > 0 ? (
        <ListGroup title="Changed from the defaults">
          {changed.map((row) => (
            <ListRow key={row.key} title={row.label} value={row.value} />
          ))}
        </ListGroup>
      ) : null}
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
  },
  body: {
    gap: spacing.sm,
  },
})
