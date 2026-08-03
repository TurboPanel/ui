import { Link, usePathname, useRouter, type Href } from 'expo-router'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  environmentStatusTone,
} from '@/lib/container-status'
import {
  COMPOSE_SECTION_TAB_IDS,
  COMPOSE_PROJECT_TAB_LABELS,
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
  if (
    (COMPOSE_SECTION_TAB_IDS as readonly string[]).includes(segment) ||
    segment === 'overview'
  ) {
    return segment as ProjectTabId
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
 * Single compose tab group: Project · environments · Networking · Storage.
 * Networking / Storage only appear when an environment is selected (not Project).
 */
function ComposeUnifiedTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const {
    orgId,
    projectId,
    environments,
    selectedEnvironmentId,
    baseSelected,
    selectBaseCompose,
  } = useProjectContext()

  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const activeTab = activeProjectTabFromPathname(pathname, projectId)
  const showSectionTabs =
    Boolean(selectedEnvironmentId) && !baseSelected

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
                active && orgPanelStyles.segmentChipActive,
                webPointer,
              ]}
              onPress={() => {
                router.push(
                  projectEnvironmentHref(orgId, projectId, env.id) as Href,
                )
              }}
            >
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={1}
              >
                {name}
              </Text>
            </Pressable>
          )
        })}

        {showSectionTabs
          ? COMPOSE_SECTION_TAB_IDS.map((tabId) => {
              const active = activeTab === tabId
              const href = projectTabHref(orgId, projectId, tabId) as Href
              const label = COMPOSE_PROJECT_TAB_LABELS[tabId]
              const tabStyle = StyleSheet.flatten([
                orgPanelStyles.segmentChip,
                active ? orgPanelStyles.segmentChipActive : null,
                webPointer,
              ])
              return (
                <Link key={tabId} href={href} asChild>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={label}
                    style={tabStyle}
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                </Link>
              )
            })
          : null}
      </View>
    </ScrollView>
  )
}

/**
 * Project area nav. Compose: one group (Project · envs · Networking · Storage).
 * Managed: Overview · Environments · Data · Backups.
 */
export function ProjectSectionTabs() {
  const { project } = useProjectContext()
  if (!project) return null

  if (isManagedProject(project)) {
    return <ManagedSectionTabs />
  }
  return <ComposeUnifiedTabs />
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    alignItems: 'center',
  },
  group: {
    flexWrap: 'nowrap',
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
