import { Link, usePathname, useRouter, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
} from 'react-native'
import { BreadcrumbChevron } from '@/components/header-chevron'
import { panelStyles } from '@/components/ui/panel-styles'
import { UnderlineTabs, type UnderlineTab } from '@/components/ui/v4'
import { PlatformBadge } from '@/components/org/platform-badge'
import { useEnvironmentChrome } from '@/components/org/project/environment-shell'
import { useProjectContext } from '@/components/org/project/project-context'
import { activeProjectTabFromPathname } from '@/components/org/project/project-section-tabs'
import { ProjectTitleIcon } from '@/components/org/project/project-title-icon'
import {
  COMPOSE_PROJECT_TAB_LABELS,
  DRAFT_COMPOSE_PROJECT_TAB_IDS,
  PROJECT_PAGE_TAB_IDS,
  PROJECT_PAGE_TAB_LABELS,
  isManagedProject,
  parseProjectPageTab,
  projectOverviewHref,
  projectPageTabHref,
  type ComposeProjectTabId,
  type ProjectPageTabId,
} from '@/lib/project-navigation'
import { managedProjectTabs } from '@/lib/managed-navigation'
import { useUpdateProject } from '@/lib/queries'
import { showsBreadcrumb } from '@/lib/header-breadcrumb'
import { colors, spacing, webPointer } from '@/lib/theme'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * What leads the project name: "Projects ›" on the project's own pages. An
 * environment page on a wide web screen has the full trail in the top bar,
 * so it shows none; everywhere else (a phone, the iPhone and iPad app) it gets
 * a back arrow to the project's environments.
 */
function ProjectHeaderLead() {
  const { orgId, projectId, pathEnvironmentId } = useProjectContext()
  const { width } = useWindowDimensions()
  const onEnvironmentPage = useEnvironmentChrome() && pathEnvironmentId != null
  if (!onEnvironmentPage) {
    return (
      <>
        <Link href={`/${orgId}/projects` as Href} asChild>
          <Pressable
            style={StyleSheet.flatten([styles.crumbLink, webPointer])}
            accessibilityRole="link"
            accessibilityLabel="Projects"
          >
            <Text style={styles.crumbLinkText}>Projects</Text>
          </Pressable>
        </Link>
        <BreadcrumbChevron size={12} color={colors.textMuted} />
      </>
    )
  }
  // Only the web top bar carries the trail; the native header has none.
  if (Platform.OS === 'web' && showsBreadcrumb(width)) return null
  return (
    <Link href={projectOverviewHref(orgId, projectId) as Href} asChild>
      <Pressable
        style={StyleSheet.flatten([styles.backLink, webPointer])}
        accessibilityRole="link"
        accessibilityLabel="All environments"
      >
        <Text style={styles.backLinkText}>‹</Text>
      </Pressable>
    </Link>
  )
}

function ProjectHeader() {
  const {
    orgId,
    projectId,
    project,
    canOwn,
    isSystemProject,
    projectAllowsMutations,
    draft,
    setError,
  } = useProjectContext()
  const updateProject = useUpdateProject(orgId, projectId)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    setEditName(project?.name?.trim() ?? '')
  }, [project?.name, project?.id])

  if (!project) return null

  const saveName = async () => {
    const trimmed = editName.trim()
    if (trimmed === (project.name?.trim() ?? '')) return
    // A draft has no row to PATCH — the rename lands in wizard state instead.
    if (draft) {
      draft.onProjectNameChange(trimmed)
      return
    }
    setError(null)
    const result = await updateProject.run({
      name: trimmed || undefined,
    })
    if (!result.ok) {
      if (updateProject.actionError) {
        setError(updateProject.actionError)
      }
    }
  }

  const saving = !draft && updateProject.isPending
  const showMutableChrome = canOwn && projectAllowsMutations

  return (
    <View style={styles.header}>
      <View
        style={styles.headerRow}
        accessibilityRole="header"
        accessibilityLabel="Project"
      >
        <View
          style={styles.breadcrumb}
          accessibilityLabel="Breadcrumb"
        >
          <ProjectHeaderLead />
          <View style={styles.currentCrumb}>
            <ProjectTitleIcon project={project} compact />
            {showMutableChrome ? (
              <TextInput
                value={editName}
                onChangeText={setEditName}
                onBlur={() => {
                  void saveName()
                }}
                onSubmitEditing={() => {
                  void saveName()
                }}
                placeholder="Project name"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Project name"
                style={[
                  styles.titleInput,
                  Platform.OS === 'web' ? titleInputWebStyle : null,
                ]}
              />
            ) : (
              <View style={styles.titleReadOnly}>
                <Text style={styles.titleText}>
                  {project.name?.trim() || 'Unnamed project'}
                </Text>
                {isSystemProject ? <PlatformBadge /> : null}
              </View>
            )}
          </View>
        </View>
      </View>
      {isSystemProject ? (
        <Text style={styles.platformEyebrow}>Platform managed</Text>
      ) : null}
      {saving ? <Text style={panelStyles.muted}>Saving…</Text> : null}
    </View>
  )
}

/**
 * Environments · Base · Compose · Bindings · Hosting · Settings, under the
 * header of a Compose project's own pages. The only tab bar those pages show.
 */
function ProjectPageTabs({ managed }: Readonly<{ managed: boolean }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { orgId, projectId } = useProjectContext()
  // A managed database greys Base and Compose ("Managed by TurboPanel").
  const tabs = useMemo<UnderlineTab[]>(
    () =>
      managed
        ? managedProjectTabs()
        : PROJECT_PAGE_TAB_IDS.map((key) => ({ key, label: PROJECT_PAGE_TAB_LABELS[key] })),
    [managed]
  )
  return (
    <UnderlineTabs
      tabs={tabs}
      value={parseProjectPageTab(pathname, projectId) ?? ''}
      onChange={(key) =>
        router.push(projectPageTabHref(orgId, projectId, key as ProjectPageTabId) as Href)
      }
      ariaLabel="Project sections"
    />
  )
}

/**
 * The create wizard's lens tabs (Overview · Compose · Services). A draft has no
 * route to navigate, so the tabs switch the draft's own section. A draft that
 * offers a single lens (a repository app) shows no tabs.
 */
function DraftLensTabs() {
  const { draft } = useProjectContext()
  const sections = draft?.sections ?? DRAFT_COMPOSE_PROJECT_TAB_IDS
  const tabs = useMemo<UnderlineTab[]>(
    () => sections.map((key) => ({ key, label: COMPOSE_PROJECT_TAB_LABELS[key] })),
    [sections]
  )
  if (!draft || tabs.length < 2) return null
  return (
    <UnderlineTabs
      tabs={tabs}
      value={draft.section}
      onChange={(key) => draft.setSection(key as ComposeProjectTabId)}
      ariaLabel="Project sections"
    />
  )
}

function ProjectShellChrome({
  managed,
  showPageTabs,
  showDraftTabs,
  needsSetup,
  activeTab,
}: Readonly<{
  managed: boolean
  showPageTabs: boolean
  showDraftTabs: boolean
  needsSetup: boolean
  activeTab: ReturnType<typeof activeProjectTabFromPathname>
}>) {
  if (needsSetup || activeTab === 'setup') return null
  return (
    <>
      {showPageTabs ? <ProjectPageTabs managed={managed} /> : null}
      {showDraftTabs ? <DraftLensTabs /> : null}
    </>
  )
}

export function ProjectShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const {
    projectId,
    project,
    loading,
    error,
    needsSetup,
    isWorkspaceKindResolved,
    isSystemProject,
    draft,
  } = useProjectContext()

  const activeTab = activeProjectTabFromPathname(pathname, projectId)
  const managed = project ? isManagedProject(project) : false
  // A project's own pages (Environments, Base and its sections, Settings)
  // carry tabs, for a managed database too. A create-wizard draft gets its
  // lens tabs instead; platform projects keep their own chrome, and an
  // environment page brings its own header and tabs.
  const showPageTabs =
    Boolean(project) &&
    !isSystemProject &&
    !needsSetup &&
    !draft &&
    parseProjectPageTab(pathname, projectId) != null

  // Hold the shell until the owning workspace kind is known so system projects
  // never briefly mount rename/trash/compose mutation chrome as user projects.
  if ((loading && !project) || (project != null && !isWorkspaceKindResolved)) {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.muted}>Loading project…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ProjectHeader />

      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <ProjectShellChrome
        managed={managed}
        showPageTabs={showPageTabs}
        showDraftTabs={Boolean(draft)}
        needsSetup={needsSetup}
        activeTab={activeTab}
      />
      <View style={styles.body}>{children}</View>
    </View>
  )
}

const titleInputWebStyle = {
  outlineStyle: 'none',
  borderWidth: 0,
  backgroundColor: 'transparent',
} as unknown as TextStyle

const styles = StyleSheet.create({
  // The shell's content column already applies the page-width cap (or none, in
  // wide mode); a second cap here would hold the project screen narrow.
  root: {
    width: '100%',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  breadcrumb: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  crumbLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingRight: 2,
  },
  crumbLinkText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  backLink: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backLinkText: {
    color: colors.link,
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  currentCrumb: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleInput: {
    flex: 1,
    minWidth: 120,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingVertical: 0,
    minHeight: 44,
  },
  titleReadOnly: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleText: {
    flexShrink: 1,
    minWidth: 80,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  platformEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  body: {
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
})
