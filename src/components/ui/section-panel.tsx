import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderChevron } from '@/components/header-chevron'
import { glass } from '@/lib/glass'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

export function SectionPanel({
  title,
  hint,
  accent,
  headerRight,
  collapsible = false,
  defaultCollapsed = false,
  onToggle,
  children,
}: Readonly<{
  title?: string
  hint?: string
  accent?: boolean
  /** Optional trailing control in the title row (e.g. project server picker). */
  headerRight?: ReactNode
  /**
   * Collapsible header (chevron + press-to-toggle). Use for settings-y
   * panels that are rarely touched; pair with `defaultCollapsed` so the
   * page stays scannable without removing anything.
   */
  collapsible?: boolean
  defaultCollapsed?: boolean
  /** Fires after a collapsible header toggle with the new expanded state. */
  onToggle?: (expanded: boolean) => void
  children: ReactNode
}>) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed)
  const expanded = !collapsible || !collapsed

  const headerCopy = (
    <View style={styles.areaHeaderCopy}>
      <Text style={styles.areaTitle}>{title}</Text>
      {hint ? <Text style={styles.areaHint}>{hint}</Text> : null}
    </View>
  )

  return (
    <GlassSurface style={styles.area} intensity="soft">
      {title ? (
        <View
          style={[
            styles.areaHeader,
            accent && styles.areaHeaderAccent,
            !expanded && styles.areaHeaderCollapsed,
          ]}
        >
          {accent ? <View style={styles.accentStripe} /> : null}
          {collapsible ? (
            <Pressable
              style={[styles.headerToggle, webPointer]}
              onPress={() => {
                const nextCollapsed = !collapsed
                setCollapsed(nextCollapsed)
                onToggle?.(!nextCollapsed)
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={
                expanded ? `Collapse ${title}` : `Expand ${title}`
              }
            >
              {headerCopy}
              <View style={styles.chevronSlot}>
                <HeaderChevron
                  size={12}
                  color={colors.textMuted}
                  open={expanded}
                />
              </View>
            </Pressable>
          ) : (
            headerCopy
          )}
          {headerRight ? (
            <View style={styles.areaHeaderRight}>{headerRight}</View>
          ) : null}
        </View>
      ) : null}
      {expanded ? <View style={styles.areaBody}>{children}</View> : null}
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  area: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: glass.fillSoft,
  },
  areaHeaderCollapsed: {
    borderBottomWidth: 0,
  },
  areaHeaderAccent: {
    backgroundColor: colors.bgActive,
  },
  accentStripe: {
    width: 3,
    backgroundColor: chrome.accent,
  },
  headerToggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevronSlot: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  areaHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  areaHeaderRight: {
    flexShrink: 0,
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  areaTitle: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  areaHint: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  areaBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
})
