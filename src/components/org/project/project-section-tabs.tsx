import { Link, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { AdminNavIcon } from '@/components/icons/nav-icons'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  EnvironmentSettingsPanel,
  ProjectSettingsPanel,
  readHostingIdParam,
} from '@/components/org/project-settings-area'
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
import { useContainersByEnvironments } from '@/lib/queries'
import { chrome, colors, layout, spacing } from '@/lib/theme'

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

const SETTINGS_PANEL_WIDTH = 400

/** Settings panel target: project base or an environment id. */
type SettingsTarget = 'project' | { environmentId: string }

/** Bare `/services` section vs `/services/:id` detail (Overview context). */
function tabFromServicesSegment(rest: string): ProjectTabId {
  const after = rest.slice('services'.length)
  if (after === '' || after.startsWith('?') || after.startsWith('#')) {
    return 'services'
  }
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
  if (segment === 'networking' || segment === 'storage') {
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
  if (segment === 'services') return tabFromServicesSegment(rest)
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
      <View style={[orgPanelStyles.segmentGroup, styles.group]}>
        {tabIds.map((tabId) => {
          const active = activeTab === tabId
          const href = hrefForTab(tabId) as Href
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

function settingsTargetKey(target: SettingsTarget): string {
  return target === 'project' ? 'project' : target.environmentId
}

function ScopeSettingsModal({
  target,
  anchorRef,
  onClose,
  onOpenProjectSettings,
}: Readonly<{
  target: SettingsTarget
  anchorRef: RefObject<View | null>
  onClose: () => void
  onOpenProjectSettings: () => void
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const { environments, isSystemProject, projectAllowsMutations } =
    useProjectContext()
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

  useEffect(() => {
    if (isCompact) return
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      const left = Math.min(
        Math.max(12, x + w - SETTINGS_PANEL_WIDTH),
        Math.max(12, width - SETTINGS_PANEL_WIDTH - 12),
      )
      setMenuPosition({
        top: y + h + 6,
        left,
      })
    })
  }, [anchorRef, isCompact, target, width])

  if (isSystemProject || !projectAllowsMutations) {
    return (
      <Modal
        visible
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={onClose}
      >
        <View
          style={[
            styles.menuBackdrop,
            isCompact && styles.menuBackdropCompact,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss settings"
          />
          <View
            style={[
              styles.menuCard,
              isCompact
                ? styles.menuCardCompact
                : {
                    position: 'absolute',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    width: SETTINGS_PANEL_WIDTH,
                  },
            ]}
          >
            <Text style={styles.panelTitle}>Settings</Text>
            <Text style={orgPanelStyles.muted}>View only</Text>
          </View>
        </View>
      </Modal>
    )
  }

  let title = 'Project settings'
  let body: ReactNode = (
    <ProjectSettingsPanel onDeleted={onClose} />
  )
  if (target !== 'project') {
    const env = environments.find((row) => row.id === target.environmentId)
    title = `${env?.name?.trim() || 'Environment'} settings`
    body = env ? (
      <EnvironmentSettingsPanel
        key={env.id}
        selectedEnvironment={env}
        onOpenProjectSettings={onOpenProjectSettings}
      />
    ) : (
      <Text style={orgPanelStyles.muted}>Environment not found.</Text>
    )
  }

  return (
    <Modal
      visible
      transparent
      animationType={isCompact ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.menuBackdrop,
          isCompact && styles.menuBackdropCompact,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss settings"
        />
        <View
          style={[
            styles.menuCard,
            isCompact
              ? styles.menuCardCompact
              : {
                  position: 'absolute',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: SETTINGS_PANEL_WIDTH,
                  maxHeight: '80%',
                },
          ]}
        >
          <Text style={styles.panelTitle} accessibilityRole="header">
            {title}
          </Text>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {body}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function ScopeChip({
  label,
  selected,
  statusColor,
  accessibilityLabel,
  onSelect,
  onOpenSettings,
  settingsOpen,
  onChipRef,
  showSettings,
}: Readonly<{
  label: string
  selected: boolean
  statusColor?: string
  accessibilityLabel: string
  onSelect: () => void
  onOpenSettings: () => void
  settingsOpen: boolean
  onChipRef?: (node: View | null) => void
  showSettings: boolean
}>) {
  return (
    <View
      ref={onChipRef}
      collapsable={false}
      style={[
        orgPanelStyles.segmentChip,
        styles.chip,
        styles.chipSplit,
        selected && orgPanelStyles.segmentChipActive,
        settingsOpen && styles.chipSettingsOpen,
      ]}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[styles.chipLabelBtn, webPointer]}
        onPress={onSelect}
      >
        <View style={styles.chipContent}>
          {statusColor ? (
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
          <Text
            style={[styles.tabText, selected && styles.tabTextActive]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      </Pressable>
      {showSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} settings`}
          accessibilityState={{ expanded: settingsOpen }}
          hitSlop={{ top: 6, bottom: 6 }}
          style={[styles.gearBtn, webPointer]}
          onPress={onOpenSettings}
        >
          <AdminNavIcon
            size={12}
            color={settingsOpen || selected ? chrome.accent : colors.textMuted}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * Compose scope selector: Project · environments only.
 * Lives in the project header (not the compose toolbar).
 * Gear on each chip opens that scope’s settings panel.
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
    isSystemProject,
    projectAllowsMutations,
  } = useProjectContext()
  const { hostingId: hostingIdParam } = useLocalSearchParams<{
    hostingId?: string | string[]
  }>()
  const focusHostingId = readHostingIdParam(hostingIdParam)
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const sectionTab = parseComposeProjectTab(pathname, projectId)

  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(
    null,
  )
  const projectChipRef = useRef<View | null>(null)
  const envChipRefs = useRef(new Map<string, View | null>())
  const activeAnchorRef = useRef<View | null>(null)

  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const containersQuery = useContainersByEnvironments(orgId, environmentIds, {
    observeUntilHostDeployed: isSystemProject,
  })
  const containersByEnv = containersQuery.containersByEnv

  const showSettings = !isSystemProject && projectAllowsMutations

  const navigateProjectScope = () => {
    router.push(
      projectComposeSectionHref(orgId, projectId, sectionTab) as Href,
    )
  }

  const navigateEnvironmentScope = (environmentId: string) => {
    router.push(
      projectComposeSectionHref(
        orgId,
        projectId,
        sectionTab,
        environmentId,
      ) as Href,
    )
  }

  // Deep link: ?hostingId= on an environment path opens that env’s settings.
  useEffect(() => {
    if (!focusHostingId || !pathEnvironmentId || !showSettings) return
    setSettingsTarget({ environmentId: pathEnvironmentId })
  }, [focusHostingId, pathEnvironmentId, showSettings])

  const openSettings = (target: SettingsTarget) => {
    if (
      settingsTarget !== null &&
      settingsTargetKey(settingsTarget) === settingsTargetKey(target)
    ) {
      setSettingsTarget(null)
      return
    }
    if (target === 'project') {
      // Settings sit on Project scope; keep section tab when opening gear.
      navigateProjectScope()
      activeAnchorRef.current = projectChipRef.current
    } else {
      navigateEnvironmentScope(target.environmentId)
      activeAnchorRef.current =
        envChipRefs.current.get(target.environmentId) ?? null
    }
    setSettingsTarget(target)
  }

  const closeSettings = () => setSettingsTarget(null)

  const openProjectSettings = () => {
    selectBaseCompose()
    activeAnchorRef.current = projectChipRef.current
    setSettingsTarget('project')
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={scrollHostStyle}
        contentContainerStyle={styles.scroll}
        accessibilityRole="tablist"
        accessibilityLabel="Project and environments"
      >
        <View style={[orgPanelStyles.segmentGroup, styles.group]}>
          <ScopeChip
            onChipRef={(node) => {
              projectChipRef.current = node
            }}
            label="Project"
            selected={baseSelected}
            accessibilityLabel="Project"
            onSelect={navigateProjectScope}
            onOpenSettings={() => openSettings('project')}
            settingsOpen={settingsTarget === 'project'}
            showSettings={showSettings}
          />

          {environments.map((env) => {
            const active = env.id === pathEnvironmentId
            const name = env.name?.trim() || 'Environment'
            const tone = environmentStatusTone(containersByEnv[env.id] ?? [])
            const settingsOpen =
              settingsTarget !== null &&
              settingsTarget !== 'project' &&
              settingsTarget.environmentId === env.id
            return (
              <ScopeChip
                key={env.id}
                onChipRef={(node) => {
                  envChipRefs.current.set(env.id, node)
                }}
                label={name}
                selected={active}
                statusColor={tone.color}
                accessibilityLabel={`${name}, ${tone.label}`}
                onSelect={() => navigateEnvironmentScope(env.id)}
                onOpenSettings={() =>
                  openSettings({ environmentId: env.id })
                }
                settingsOpen={settingsOpen}
                showSettings={showSettings}
              />
            )
          })}
        </View>
      </ScrollView>

      {settingsTarget && showSettings ? (
        <ScopeSettingsModal
          key={settingsTargetKey(settingsTarget)}
          target={settingsTarget}
          anchorRef={activeAnchorRef}
          onClose={closeSettings}
          onOpenProjectSettings={openProjectSettings}
        />
      ) : null}
    </>
  )
}

/**
 * Project area nav. Managed projects only — compose Overview / Compose /
 * Services tabs live inside the compose surface chrome.
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
    paddingHorizontal: 0,
    paddingVertical: 0,
    minWidth: 40,
    borderRadius: 6,
    overflow: 'hidden',
  },
  chipSplit: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  chipSettingsOpen: {
    borderWidth: 1,
    borderColor: chrome.accent,
  },
  chipLabelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: 'center',
    minHeight: 28,
  },
  gearBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 32,
    minHeight: 32,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.borderChip,
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
  menuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuBackdropCompact: {
    justifyContent: 'flex-end',
  },
  menuCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
    padding: spacing.md,
    gap: spacing.sm,
  },
  menuCardCompact: {
    margin: spacing.md,
    marginBottom: spacing.xl,
    maxHeight: '85%',
  },
  panelTitle: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  panelScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  panelScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
})
