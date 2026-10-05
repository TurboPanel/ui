import { Link, type Href } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { chrome, colors, webPointer } from '@/lib/theme'

/** One tab: a label and the page it opens. */
export type PageTab = Readonly<{
  id: string
  label: string
  href: string
}>

export const PAGE_TABS_HEIGHT = 40

/**
 * Underline tabs for a page's own sections (project, environment, organization
 * settings). Every tab is a link, so the browser's back button and a shared
 * link both land on the same tab.
 *
 * Local stand-in: the v4 primitives slice (fonts and primitives in
 * `components/ui`) brings the final tab bar, which replaces this one.
 */
export function PageTabs({
  tabs,
  activeId,
  accessibilityLabel,
}: Readonly<{
  tabs: readonly PageTab[]
  activeId: string | null
  accessibilityLabel: string
}>) {
  if (tabs.length === 0) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.list}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId
        // Link `asChild` renders through a Slot, which rejects style arrays.
        const style = StyleSheet.flatten([
          styles.item,
          active && styles.itemActive,
          webPointer,
        ])
        return (
          <Link key={tab.id} href={tab.href as Href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              style={style}
            >
              <Text
                style={[styles.label, active && styles.labelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          </Link>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
    height: PAGE_TABS_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  list: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: PAGE_TABS_HEIGHT,
  },
  item: {
    height: PAGE_TABS_HEIGHT,
    paddingHorizontal: 16,
    justifyContent: 'center',
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  itemActive: {
    borderBottomColor: chrome.accent,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  labelActive: {
    color: colors.text,
  },
})
