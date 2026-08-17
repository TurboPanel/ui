import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GlassSurface } from '@/components/glass/glass-surface'
import { OrgAreaIcon } from '@/components/icons/nav-icons'
import {
  ORG_AREAS,
  ORG_TAB_AREA_IDS,
  isOrgAreaActive,
  orgAreaHref,
} from '@/lib/org-navigation'
import { chrome, colors, layout, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import { projectsHrefForScope } from '@/lib/workspace-scope'

const TAB_AREAS = ORG_TAB_AREA_IDS.flatMap((id) => {
  const area = ORG_AREAS.find((entry) => entry.id === id)
  return area ? [area] : []
})

export function OrgTabBar({ orgId }: Readonly<{ orgId: string }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { scopeId } = useWorkspaceScope()
  const insets = useSafeAreaInsets()

  return (
    <GlassSurface
      style={[styles.bar, { paddingBottom: insets.bottom }]}
      intensity="strong"
    >
      <View style={styles.row}>
        {TAB_AREAS.map((area) => {
          const href =
            area.id === 'projects'
              ? projectsHrefForScope(orgId, scopeId)
              : orgAreaHref(orgId, area.pathSegment)
          const selected = isOrgAreaActive(pathname, orgId, area.pathSegment)
          const iconColor = selected ? chrome.accent : colors.textMuted

          return (
            <Pressable
              key={area.id}
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
              <OrgAreaIcon areaId={area.id} size={22} color={iconColor} />
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
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexShrink: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    minHeight: layout.bottomTabHeight,
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
