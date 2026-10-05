import { Link, usePathname, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  COMPOSE_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_LABELS,
  isManagedProject,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectTabHref,
  type ProjectTabId,
} from '@/lib/project-navigation'
import { colors, webPointer } from '@/lib/theme'

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

/** Retired `/services` and `/services/:id` detail both sit in Document context. */
function tabFromServicesSegment(): ProjectTabId {
  return 'overview'
}

/** Env-scoped compose tabs vs bare managed Environments tab. */
function tabFromEnvironmentsSegment(
  pathname: string,
  projectId: string,
): ProjectTabId {
  if (parseProjectEnvironmentId(pathname, projectId)) {
    return parseComposeProjectTab(pathname, projectId)
  }
  return 'environments'
}

/** Known managed/compose tab ids, retired routes → overview, else overview. */
function tabFromKnownSegment(segment: string): ProjectTabId {
  if (segment === 'data' || segment === 'backups' || segment === 'overview') {
    return segment
  }
  // Retired compose section routes redirect to the current scope; treat as Overview.
  if (segment === 'networking') {
    return 'overview'
  }
  if ((MANAGED_PROJECT_TAB_IDS as readonly string[]).includes(segment)) {
    return segment as ProjectTabId
  }
  if ((COMPOSE_PROJECT_TAB_IDS as readonly string[]).includes(segment)) {
    return segment as ProjectTabId
  }
  return 'overview'
}

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
  if (segment === 'compose') return 'compose'
  if (segment === 'services') return tabFromServicesSegment()
  if (segment === 'environments') {
    return tabFromEnvironmentsSegment(pathname, projectId)
  }
  return tabFromKnownSegment(segment)
}

function SectionTabStrip({
  tabIds,
  labels,
  hrefForTab,
  activeTab,
  accessibilityLabel,
}: Readonly<{
  tabIds: readonly ProjectTabId[]
  labels: Readonly<Record<string, string>>
  hrefForTab: (tabId: ProjectTabId) => string
  activeTab: ProjectTabId | 'setup' | null
  accessibilityLabel: string
}>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={scrollHostStyle}
      contentContainerStyle={styles.scroll}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[panelStyles.segmentGroup, styles.group]}>
        {tabIds.map((tabId) => {
          const active = activeTab === tabId
          const href = hrefForTab(tabId) as Href
          const tabStyle = StyleSheet.flatten([
            panelStyles.segmentChip,
            styles.chip,
            active ? panelStyles.segmentChipActive : null,
            webPointer,
          ])
          return (
            <Link key={tabId} href={href} asChild>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={labels[tabId] ?? tabId}
                hitSlop={{ top: 8, bottom: 8 }}
                style={tabStyle}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {labels[tabId] ?? tabId}
                </Text>
              </Pressable>
            </Link>
          )
        })}
      </View>
    </ScrollView>
  )
}

function ManagedSectionTabs() {
  const pathname = usePathname()
  const { orgId, projectId } = useProjectContext()
  const activeTab = activeProjectTabFromPathname(pathname, projectId)

  return (
    <SectionTabStrip
      tabIds={MANAGED_PROJECT_TAB_IDS}
      labels={MANAGED_PROJECT_TAB_LABELS}
      hrefForTab={(tabId) => projectTabHref(orgId, projectId, tabId)}
      activeTab={activeTab}
      accessibilityLabel="Project sections"
    />
  )
}

/**
 * Project area nav. Managed projects only — compose Overview / Compose /
 * Services / Hosting / Servers tabs live inside the compose surface chrome.
 */
export function ProjectSectionTabs() {
  const { project } = useProjectContext()
  if (!project) return null

  if (isManagedProject(project)) {
    return <ManagedSectionTabs />
  }
  return null
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    alignItems: 'center',
  },
  group: {
    flexWrap: 'nowrap',
    padding: 2,
    borderRadius: 8,
  },
  chip: {
    minWidth: 40,
    minHeight: 32,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.link,
    fontWeight: '700',
  },
})
