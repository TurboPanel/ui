import { Link, type Href } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { webPointer } from '@/components/org/org-panel-styles'
import type { StatTileIcon } from '@/components/ui/stat-tiles'
import { chrome, colors } from '@/lib/theme'

export type SectionNavItem = {
  id: string
  label: string
  icon: StatTileIcon
  /** Count at the trailing edge; omit or pass null for none. */
  badge?: number | string | null
  /** Route to push. Omit and pass `onPress` for state-driven navs. */
  href?: string
  onPress?: () => void
}

export const SECTION_NAV_HEIGHT = 40

function NavItemFace({
  item,
  active,
}: Readonly<{ item: SectionNavItem; active: boolean }>) {
  const Icon = item.icon
  const hasBadge = item.badge != null && item.badge !== ''
  return (
    <View style={styles.face}>
      <Icon size={15} color={active ? chrome.accent : colors.textMuted} />
      <Text
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
      {hasBadge ? (
        <Text style={[styles.badge, active && styles.badgeActive]}>
          {item.badge}
        </Text>
      ) : null}
    </View>
  )
}

function NavItem({
  item,
  active,
}: Readonly<{ item: SectionNavItem; active: boolean }>) {
  // Link `asChild` renders through a Slot, which rejects style arrays.
  const style = StyleSheet.flatten([
    styles.item,
    active && styles.itemActive,
    webPointer,
  ])
  const face = <NavItemFace item={item} active={active} />
  const a11y = {
    accessibilityRole: 'tab' as const,
    accessibilityState: { selected: active },
    accessibilityLabel: item.label,
  }

  if (item.href) {
    return (
      <Link href={item.href as Href} asChild>
        <Pressable {...a11y} style={style}>
          {face}
        </Pressable>
      </Link>
    )
  }
  return (
    <Pressable {...a11y} style={style} onPress={item.onPress}>
      {face}
    </Pressable>
  )
}

/**
 * A short horizontal strip of underline tabs for switching modes **within** a
 * surface — the embedded Compose/Services toggle, and the like.
 *
 * Deliberately horizontal-only and deliberately short. A growing list of
 * destinations does not belong here (and emphatically not in a side rail):
 * reach configuration from the object it belongs to, the way the project
 * editor's Document lens hangs it off each service.
 */
export function SectionNav({
  items,
  activeId,
  accessibilityLabel,
}: Readonly<{
  items: readonly SectionNavItem[]
  activeId: string
  accessibilityLabel: string
}>) {
  if (items.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.list}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => (
        <NavItem key={item.id} item={item} active={item.id === activeId} />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    height: SECTION_NAV_HEIGHT,
  },
  list: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: SECTION_NAV_HEIGHT,
  },
  item: {
    height: SECTION_NAV_HEIGHT,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  itemActive: {
    borderBottomColor: chrome.accent,
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  labelActive: {
    color: chrome.accent,
  },
  badge: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  badgeActive: {
    color: chrome.accent,
  },
})
