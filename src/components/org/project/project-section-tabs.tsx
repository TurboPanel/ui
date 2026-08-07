import { Link, usePathname, useRouter, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  environmentStatusTone,
} from '@/lib/container-status'
import {
  MANAGED_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_LABELS,
  isManagedProject,
  parseProjectEnvironmentId,
  projectEnvironmentHref,
  projectTabHref,
  type ProjectTabId,
} from '@/lib/project-navigation'
import { useContainersByEnvironments } from '@/lib/queries'
import { chrome, colors } from '@/lib/theme'
import { useMemo } from 'react'

/** RN Web ScrollView expands by default; keep the chip strip content-sized. */
const scrollHostWebStyle = {
  width: 'max-content',
  maxWidth: '100%',
} as unknown as ViewStyle

const scrollHostStyle = StyleSheet.flatten([
  {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%' as const,
  },
  Platform.OS === 'web' ? scrollHostWebStyle : null,
])

export function activeProjectTabFromPathname(
  pathname: string,
  projectId: string,
): ProjectTabId | 'setup' | null {
  const marker = `/projects/${projectId}/`
  const idx = pathname.indexOf(marker)
  if (idx < 0) {
    if (pathname.endsWith(`/projects/${projectId}`)) return 'overview'
    return null
  }
  const rest = pathname.slice(idx + marker.length)
  const segment = rest.split('/')[0] ?? ''
  if (segment === 'setup') return 'setup'
  // Service detail lives under /services/:id but belongs to Overview.
  if (segment === 'services') return 'overview'
  // `/environments/:id` is Overview with that environment selected.
  if (segment === 'environments' && parseProjectEnvironmentId(pathname, projectId)) {
    return 'overview'
  }
  // Bare `/environments` is the managed Environments tab (compose redirects to Overview).
  if (segment === 'environments') return 'environments'
  if (segment === 'data' || segment === 'backups') {
    return segment
  }
  // Retired compose section routes redirect to the current scope; treat as Overview.
  if (segment === 'networking' || segment === 'storage') {
    return 'overview'
  }
  if (segment === 'overview') {
    return 'overview'
  }
  if ((MANAGED_PROJECT_TAB_IDS as readonly string[]).includes(segment)) {
    return segment as ProjectTabId
  }
  return 'overview'
}

function ManagedSectionTabs() {
  const pathname = usePathname()
  const { orgId, projectId } = useProjectContext()
  const activeTab = activeProjectTabFromPathname(pathname, projectId)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={scrollHostStyle}
      contentContainerStyle={styles.scroll}
      accessibilityRole="tablist"
      accessibilityLabel="Project sections"
    >
      <View style={[orgPanelStyles.segmentGroup, styles.group]}>
        {MANAGED_PROJECT_TAB_IDS.map((tabId) => {
          const active = activeTab === tabId
          const href = projectTabHref(orgId, projectId, tabId) as Href
          const tabStyle = StyleSheet.flatten([
            orgPanelStyles.segmentChip,
            styles.chip,
            active ? orgPanelStyles.segmentChipActive : null,
            webPointer,
          ])
          return (
            <Link key={tabId} href={href} asChild>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={MANAGED_PROJECT_TAB_LABELS[tabId] ?? tabId}
                style={tabStyle}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {MANAGED_PROJECT_TAB_LABELS[tabId] ?? tabId}
                </Text>
              </Pressable>
            </Link>
          )
        })}
      </View>
    </ScrollView>
  )
}

/**
 * Compose scope selector: Project · environments only.
 * Lives in the project header (not the compose toolbar).
 */
export function ProjectScopeSelector() {
  const pathname = usePathname()
  const router = useRouter()
  const {
    orgId,
    projectId,
    environments,
    baseSelected,
    selectBaseCompose,
  } = useProjectContext()

  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)

  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByEnvironments(orgId, environmentIds)
  const containersByEnv = containersQuery.containersByEnv

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={scrollHostStyle}
      contentContainerStyle={styles.scroll}
      accessibilityRole="tablist"
      accessibilityLabel="Project and environments"
    >
      <View style={[orgPanelStyles.segmentGroup, styles.group]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: baseSelected }}
          accessibilityLabel="Project"
          style={[
            orgPanelStyles.segmentChip,
            styles.chip,
            baseSelected && orgPanelStyles.segmentChipActive,
            webPointer,
          ]}
          onPress={selectBaseCompose}
        >
          <Text
            style={[styles.tabText, baseSelected && styles.tabTextActive]}
            numberOfLines={1}
          >
            Project
          </Text>
        </Pressable>

        {environments.map((env) => {
          const active = env.id === pathEnvironmentId
          const name = env.displayName?.trim() || 'Environment'
          const tone = environmentStatusTone(containersByEnv[env.id] ?? [])
          return (
            <Pressable
              key={env.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${name}, ${tone.label}`}
              style={[
                orgPanelStyles.segmentChip,
                styles.chip,
                active && orgPanelStyles.segmentChipActive,
                webPointer,
              ]}
              onPress={() => {
                router.push(
                  projectEnvironmentHref(orgId, projectId, env.id) as Href,
                )
              }}
            >
              <View style={styles.chipContent}>
                <View
                  style={[styles.statusDot, { backgroundColor: tone.color }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}

/**
 * Project area nav. Compose: Project · environments scope selector.
 * Managed: Overview · Environments · Data · Backups.
 */
export function ProjectSectionTabs() {
  const { project } = useProjectContext()
  if (!project) return null

  if (isManagedProject(project)) {
    return <ManagedSectionTabs />
  }
  return <ProjectScopeSelector />
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    alignItems: 'center',
  },
  group: {
    flexWrap: 'nowrap',
    padding: 2,
    borderRadius: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 40,
    borderRadius: 5,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  tabText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: chrome.accent,
    fontWeight: '700',
  },
})
