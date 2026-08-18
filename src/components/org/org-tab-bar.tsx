import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OrgAreaIcon } from '@/components/icons/nav-icons'
import {
  ORG_AREAS,
  ORG_TAB_AREA_IDS,
  isOrgAreaActive,
  orgTabHref,
} from '@/lib/org-navigation'
import { glass } from '@/lib/glass'
import { chrome, colors, layout, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'

const TAB_AREAS = ORG_TAB_AREA_IDS.flatMap((id) => {
  const area = ORG_AREAS.find((entry) => entry.id === id)
  return area ? [{ area, id }] : []
})

/** Total height the shell should reserve for the tab bar + home-indicator inset. */
export function orgTabBarOccupiedHeight(safeBottom: number): number {
  return layout.bottomTabHeight + safeBottom
}

/**
 * Native bottom tabs — plain fill + top hairline only.
 *
 * Avoid {@link GlassSurface}/GlassView: liquid glass paints a system rim on
 * every edge that looks wrong against rounded device screens.
 *
 * Layout matches platform tab bars: a fixed content row (icon + label) sits
 * above the full safe-area inset — not vertically centered into the home
 * indicator.
 */
export function OrgTabBar({ orgId }: Readonly<{ orgId: string }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { scopeId } = useWorkspaceScope()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      <View style={styles.hairline} />
      <View style={styles.row}>
        {TAB_AREAS.map(({ area, id }) => {
          const href = orgTabHref(orgId, id, scopeId)
          const selected = isOrgAreaActive(pathname, orgId, area.pathSegment)
          const iconColor = selected ? chrome.accent : colors.textMuted

          return (
            <Pressable
              key={id}
              style={({ pressed }) => [
                styles.tab,
                pressed && styles.tabPressed,
              ]}
              onPress={() => {
                router.replace(href as Href)
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={area.label}
            >
              {selected ? <View style={styles.tabActiveBar} /> : null}
              <OrgAreaIcon areaId={id} size={22} color={iconColor} />
              <Text
                style={[styles.label, selected && styles.labelActive]}
                numberOfLines={1}
              >
                {area.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexShrink: 0,
    position: 'relative',
    backgroundColor: glass.fillStrong,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.border,
    zIndex: 1,
  },
  row: {
    height: layout.bottomTabHeight,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: spacing.xs,
    overflow: 'hidden',
  },
  tabPressed: {
    opacity: 0.85,
  },
  tabActiveBar: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    height: 2,
    borderRadius: 1,
    backgroundColor: chrome.accent,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  labelActive: {
    color: chrome.accent,
  },
})
