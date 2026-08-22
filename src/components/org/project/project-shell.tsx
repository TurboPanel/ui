import { Link, usePathname, useRouter, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { BreadcrumbChevron } from '@/components/header-chevron'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { PlatformBadge } from '@/components/org/platform-badge'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  ProjectScopeSelector,
  ProjectSectionTabs,
  activeProjectTabFromPathname,
} from '@/components/org/project/project-section-tabs'
import { ProjectTitleIcon } from '@/components/org/project/project-title-icon'
import { TrashIcon } from '@/components/org/project/trash-icon'
import {
  isManagedProject,
  parseProjectEnvironmentId,
  projectOverviewHref,
} from '@/lib/project-navigation'
import {
  commandStatusById,
  isTerminalCommandStatus,
  useCommandsBatch,
  useDeleteEnvironment,
  useDeleteEnvironmentManagedMutation,
  useUpdateProject,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { MANAGED_RUNTIME_PRESENT_ERROR } from '@/lib/instance-api'
import { chrome, colors, layout, spacing } from '@/lib/theme'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

function EnvironmentSelector() {
  const {
    environments,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
  } = useProjectContext()

  if (environments.length === 0) {
    return (
      <Text style={orgPanelStyles.muted} accessibilityRole="text">
        No environments
      </Text>
    )
  }

  if (environments.length === 1) {
    const only = environments[0]!
    return (
      <View style={styles.envSingle} accessibilityLabel="Active environment">
        <Text style={styles.envSingleLabel}>Environment</Text>
        <Text style={styles.envSingleName}>
          {only.name?.trim() || 'Environment'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.envChips}
      accessibilityRole="tablist"
      accessibilityLabel="Environments"
    >
      {environments.map((env) => {
        const active = env.id === selectedEnvironmentId
        return (
          <Pressable
            key={env.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={env.name?.trim() || 'Environment'}
            style={[styles.envChip, active && styles.envChipActive, webPointer]}
            onPress={() => setSelectedEnvironmentId(env.id)}
          >
            <Text
              style={[styles.envChipText, active && styles.envChipTextActive]}
              numberOfLines={1}
            >
              {env.name?.trim() || 'Environment'}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/**
 * Managed projects still delete from the header trash; compose projects use
 * Danger sections in scope-chip settings
 * (ProjectSettingsPanel / EnvironmentSettingsPanel).
 */
function ManagedProjectTrashButton({
  deletingProject,
  onRequestDeleteProject,
}: Readonly<{
  deletingProject: boolean
  onRequestDeleteProject: () => void
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    orgId,
    projectId,
    environments,
    selectedEnvironment,
    canOwn,
    setError,
    invalidateEnvironments,
  } = useProjectContext()
  const deleteEnvironment = useDeleteEnvironment(orgId)
  const destroyManaged = useDeleteEnvironmentManagedMutation(orgId)
  const [envArmed, setEnvArmed] = useState(false)
  const [trackedDestroy, setTrackedDestroy] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const [pendingEnvDelete, setPendingEnvDelete] = useState<string | null>(null)
  const commandsQuery = useCommandsBatch(orgId, trackedDestroy)

  useEffect(() => {
    setEnvArmed(false)
  }, [selectedEnvironment?.id, environments.length])

  const commandsById = useMemo(
    () => commandStatusById(commandsQuery.data),
    [commandsQuery.data],
  )

  useEffect(() => {
    if (!pendingEnvDelete) return
    // Join on command id: unreadable ids are dropped from the batched response.
    const trackedCommandId = trackedDestroy[0]?.commandId
    const command = trackedCommandId
      ? commandsById.get(trackedCommandId)
      : undefined
    if (!command || !isTerminalCommandStatus(command.status)) return
    const environmentId = pendingEnvDelete
    setTrackedDestroy([])
    setPendingEnvDelete(null)
    if (command.status !== 'succeeded') {
      setError(command.errorMessage ?? `Destroy ${command.status}`)
      return
    }
    void (async () => {
      const result = await deleteEnvironment.run(environmentId)
      if (!result.ok) {
        if (deleteEnvironment.actionError?.includes(MANAGED_RUNTIME_PRESENT_ERROR)) {
          setError(
            'Destroy the database first — it is still running on the server.',
          )
        } else if (deleteEnvironment.actionError) {
          setError(deleteEnvironment.actionError)
        }
        return
      }
      setEnvArmed(false)
      await invalidateEnvironments()
      if (parseProjectEnvironmentId(pathname, projectId) === environmentId) {
        router.replace(projectOverviewHref(orgId, projectId) as Href)
      }
    })()
  }, [
    commandsById,
    trackedDestroy,
    pendingEnvDelete,
    pathname,
    projectId,
    orgId,
  ])

  if (!canOwn) return null

  const multiEnv = environments.length > 1
  const destroying = destroyManaged.isPending || trackedDestroy.length > 0
  const removing = deleteEnvironment.isPending || destroying

  const handlePress = () => {
    if (removing || deletingProject) return
    if (!multiEnv) {
      onRequestDeleteProject()
      return
    }
    if (!selectedEnvironment) {
      setError('Select an environment to delete.')
      return
    }
    if (!envArmed) {
      setEnvArmed(true)
      return
    }
    void (async () => {
      setError(null)
      const deletedId = selectedEnvironment.id
      const destroy = await destroyManaged.run(deletedId)
      if (!destroy.ok) {
        if (destroyManaged.actionError) setError(destroyManaged.actionError)
        return
      }
      if (destroy.value.deleted) {
        const result = await deleteEnvironment.run(deletedId)
        if (!result.ok) {
          if (deleteEnvironment.actionError) {
            setError(deleteEnvironment.actionError)
          }
          return
        }
        setEnvArmed(false)
        await invalidateEnvironments()
        if (parseProjectEnvironmentId(pathname, projectId) === deletedId) {
          router.replace(projectOverviewHref(orgId, projectId) as Href)
        }
        return
      }
      const { commandId, serverId } = destroy.value
      if (!commandId || !serverId) {
        setError('Destroy queued but target server was not returned')
        return
      }
      setPendingEnvDelete(deletedId)
      setTrackedDestroy([{ serverId, commandId }])
    })()
  }

  let accessibilityLabel = 'Delete this project'
  if (destroying) {
    accessibilityLabel = 'Destroying database'
  } else if (multiEnv && envArmed) {
    accessibilityLabel = 'Confirm delete this environment'
  } else if (multiEnv) {
    accessibilityLabel = 'Delete this environment'
  }

  return (
    <View style={styles.trashRow}>
      {envArmed ? (
        <Pressable
          style={[styles.trashCancel, webPointer]}
          onPress={() => setEnvArmed(false)}
          accessibilityRole="button"
          accessibilityLabel="Cancel delete"
        >
          <Text style={styles.trashCancelText}>Cancel</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[
          styles.trashButton,
          (envArmed || deletingProject) && styles.trashButtonArmed,
          (removing || deletingProject) && styles.trashButtonDisabled,
          webPointer,
        ]}
        onPress={handlePress}
        disabled={removing || deletingProject}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <TrashIcon size={18} color={colors.error} />
      </Pressable>
    </View>
  )
}

function ProjectHeader({
  showManagedTrash,
  deletingProject,
  onRequestDeleteProject,
  showScopeSelector,
}: Readonly<{
  showManagedTrash: boolean
  deletingProject: boolean
  onRequestDeleteProject: () => void
  showScopeSelector: boolean
}>) {
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
  const projectsHref = `/${orgId}/projects` as Href
  const crumbLinkStyle = StyleSheet.flatten([styles.crumbLink, webPointer])

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
          <Link href={projectsHref} asChild>
            <Pressable
              style={crumbLinkStyle}
              accessibilityRole="link"
              accessibilityLabel="Projects"
            >
              <Text style={styles.crumbLinkText}>Projects</Text>
            </Pressable>
          </Link>
          <BreadcrumbChevron size={12} color={colors.textMuted} />
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
        {showScopeSelector ? <ProjectScopeSelector /> : null}
        {showManagedTrash && showMutableChrome ? (
          <ManagedProjectTrashButton
            deletingProject={deletingProject}
            onRequestDeleteProject={onRequestDeleteProject}
          />
        ) : null}
      </View>
      {isSystemProject ? (
        <Text style={styles.platformEyebrow}>Platform managed</Text>
      ) : null}
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </View>
  )
}

function ProjectShellChrome({
  hideEnvSelector,
  showManagedSectionTabs,
  needsSetup,
  activeTab,
}: Readonly<{
  hideEnvSelector: boolean
  showManagedSectionTabs: boolean
  needsSetup: boolean
  activeTab: ReturnType<typeof activeProjectTabFromPathname>
}>) {
  if (needsSetup || activeTab === 'setup') return null
  return (
    <>
      {hideEnvSelector ? null : <EnvironmentSelector />}
      {showManagedSectionTabs ? (
        <View style={styles.sectionTabsRow}>
          <ProjectSectionTabs />
        </View>
      ) : null}
    </>
  )
}

export function ProjectShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    loading,
    error,
    needsSetup,
    isWorkspaceKindResolved,
    projectAllowsMutations,
    draft,
  } = useProjectContext()
  const [deletingProject, setDeletingProject] = useState(false)

  const activeTab = activeProjectTabFromPathname(pathname, projectId)
  const managed = project ? isManagedProject(project) : false
  // Managed: hide selector on Overview / Environments (those surfaces own their
  // own env chrome). Compose never uses EnvironmentSelector — scope chips live
  // in the header via ProjectScopeSelector.
  const hideEnvSelector = managed
    ? activeTab === 'environments' || activeTab === 'overview'
    : true
  // Drafts have no environments to scope to and no settings to open yet.
  const showScopeSelector =
    Boolean(project) &&
    !managed &&
    !needsSetup &&
    !draft &&
    activeTab !== 'setup'

  // Hold the shell until the owning workspace kind is known so system projects
  // never briefly mount rename/trash/compose mutation chrome as user projects.
  if ((loading && !project) || (project != null && !isWorkspaceKindResolved)) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.muted}>Loading project…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ProjectHeader
        showManagedTrash={managed}
        deletingProject={deletingProject}
        onRequestDeleteProject={() => setDeletingProject(true)}
        showScopeSelector={showScopeSelector}
      />

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {deletingProject && project && projectAllowsMutations && managed ? (
        <ProjectDeletePanel
          orgId={orgId}
          project={project}
          onCancel={() => setDeletingProject(false)}
          onDeleted={() => {
            router.replace(`/${orgId}/projects` as Href)
          }}
        />
      ) : (
        <>
          <ProjectShellChrome
            hideEnvSelector={hideEnvSelector}
            showManagedSectionTabs={managed}
            needsSetup={needsSetup}
            activeTab={activeTab}
          />
          <View style={styles.body}>{children}</View>
        </>
      )}
    </View>
  )
}

const titleInputWebStyle = {
  outlineStyle: 'none',
  borderWidth: 0,
  backgroundColor: 'transparent',
} as unknown as TextStyle

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
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
  trashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trashButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  trashButtonArmed: {
    borderColor: colors.error,
    backgroundColor: colors.bgSecondary,
  },
  trashButtonDisabled: {
    opacity: 0.5,
  },
  trashCancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  trashCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  envSingle: {
    gap: 2,
  },
  envSingleLabel: {
    color: colors.textLabel,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  envSingleName: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '600',
  },
  envChips: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  envChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: 200,
  },
  envChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  envChipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  envChipTextActive: {
    color: chrome.accent,
  },
  body: {
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionTabsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
})
