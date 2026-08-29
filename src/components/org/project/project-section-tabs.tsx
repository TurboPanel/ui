import { Link, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo } from 'react'
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
import { StatusDot } from '@/components/ui'
import { useProjectContext } from '@/components/org/project/project-context'
import { readHostingIdParam } from '@/components/org/project-settings-area'
import { ProjectScopePicker } from '@/components/org/project/project-scope-picker'
import {
  environmentStatusTone,
} from '@/lib/container-status'
import {
  COMPOSE_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_LABELS,
  isManagedProject,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeSectionHref,
  projectTabHref,
  type ProjectTabId,
} from '@/lib/project-navigation'
import {
  shouldUseScopePicker,
  type ProjectScopeOption,
} from '@/lib/project-scope'
import { environmentDisplayName } from '@/lib/resource-labels'
import { useContainersByProject, useOrgServers } from '@/lib/queries'
import { chrome, colors, webPointer } from '@/lib/theme'

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

function ScopeChip({
  label,
  selected,
  statusColor,
  accessibilityLabel,
  onSelect,
}: Readonly<{
  label: string
  selected: boolean
  statusColor?: string
  accessibilityLabel: string
  onSelect: () => void
}>) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[
        panelStyles.segmentChip,
        styles.chip,
        selected && panelStyles.segmentChipActive,
        webPointer,
      ]}
      onPress={onSelect}
    >
      <View style={styles.chipContent}>
        {statusColor ? (
          <StatusDot size="sm" color={statusColor} />
        ) : null}
        <Text
          style={[styles.tabText, selected && styles.tabTextActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * Compose scope selector: **Project** · environments.
 *
 * Lives in the project header (not the compose toolbar). Pure scope switch —
 * per-scope configuration is the Settings tab inside the compose surface, so
 * the chips carry no settings gear.
 *
 * Project is always the first control and never collapses into the picker.
 * Environments sit to its right: chips while there is only one, and a
 * searchable {@link ProjectScopePicker} past that, since platform projects
 * place one environment per server and the list grows with the fleet. Either
 * way an environment is always named on screen — on Project scope the picker
 * shows the first one, unhighlighted.
 */
export function ProjectScopeSelector() {
  const pathname = usePathname()
  const router = useRouter()
  const { orgId, projectId, environments, baseSelected, isSystemProject } =
    useProjectContext()
  const { hostingId: hostingIdParam } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const focusHostingId = readHostingIdParam(hostingIdParam)
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const sectionTab = parseComposeProjectTab(pathname, projectId)

  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByProject(orgId, projectId, {
    environmentIds,
    observeUntilHostDeployed: isSystemProject,
  })
  const containersByEnv = containersQuery.containersByEnv
  // Platform projects run one environment per server and name every one after
  // the component, so the scopes only differ once the placement is resolved.
  const serversQuery = useOrgServers(orgId, { enabled: isSystemProject })
  const servers = serversQuery.data?.servers

  const navigateScope = (environmentId?: string | null) => {
    router.push(
      projectComposeSectionHref(
        orgId,
        projectId,
        sectionTab,
        environmentId,
      ) as Href,
    )
  }

  // Deep link: ?hostingId= on an environment path opens the Hosting tab.
  useEffect(() => {
    if (!focusHostingId || !pathEnvironmentId) return
    if (sectionTab === 'hosting') return
    const href = `${projectComposeSectionHref(
      orgId,
      projectId,
      'hosting',
      pathEnvironmentId,
    )}?hostingId=${encodeURIComponent(focusHostingId)}`
    router.replace(href as Href)
  }, [
    focusHostingId,
    pathEnvironmentId,
    sectionTab,
    orgId,
    projectId,
    router,
  ])

  const environmentTone = (environmentId: string) =>
    environmentStatusTone(containersByEnv[environmentId] ?? [])

  const environmentControl = () => {
    if (environments.length === 0) return null

    const options: ProjectScopeOption[] = environments.map((env) => ({
      environmentId: env.id,
      label: environmentDisplayName(env, {
        servers,
        preferServer: isSystemProject,
      }),
      detail: environmentTone(env.id).label,
    }))

    if (shouldUseScopePicker(environments.length)) {
      return (
        <ProjectScopePicker
          options={options}
          activeEnvironmentId={pathEnvironmentId}
          statusColorFor={(option) =>
            environmentTone(option.environmentId).color
          }
          onSelect={(option) => navigateScope(option.environmentId)}
        />
      )
    }

    return options.map((option) => {
      const tone = environmentTone(option.environmentId)
      return (
        <ScopeChip
          key={option.environmentId}
          label={option.label}
          selected={option.environmentId === pathEnvironmentId}
          statusColor={tone.color}
          accessibilityLabel={`${option.label}, ${tone.label}`}
          onSelect={() => navigateScope(option.environmentId)}
        />
      )
    })
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={scrollHostStyle}
      contentContainerStyle={styles.scroll}
      accessibilityRole="tablist"
      accessibilityLabel="Project and environments"
    >
      <View style={[panelStyles.segmentGroup, styles.group]}>
        {/* Project is always first and never collapses into the picker. */}
        <ScopeChip
          label="Project"
          selected={baseSelected}
          accessibilityLabel="Project"
          onSelect={() => navigateScope()}
        />
        {environmentControl()}
      </View>
    </ScrollView>
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
