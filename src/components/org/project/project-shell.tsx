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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  ProjectSectionTabs,
  activeProjectTabFromPathname,
} from '@/components/org/project/project-section-tabs'
import { TrashIcon } from '@/components/org/project/trash-icon'
import {
  isManagedProject,
  parseProjectEnvironmentId,
  projectOverviewHref,
} from '@/lib/project-navigation'
import { useDeleteEnvironment, useUpdateProject } from '@/lib/queries'
import { chrome, colors, layout, spacing } from '@/lib/theme'
import { useEffect, useState, type ReactNode } from 'react'

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
          {only.displayName?.trim() || 'Environment'}
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
            accessibilityLabel={env.displayName?.trim() || 'Environment'}
            style={[styles.envChip, active && styles.envChipActive, webPointer]}
            onPress={() => setSelectedEnvironmentId(env.id)}
          >
            <Text
              style={[styles.envChipText, active && styles.envChipTextActive]}
              numberOfLines={1}
            >
              {env.displayName?.trim() || 'Environment'}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function ProjectTrashButton({
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
  const [envArmed, setEnvArmed] = useState(false)

  useEffect(() => {
    setEnvArmed(false)
  }, [selectedEnvironment?.id, environments.length])

  if (!canOwn) return null

  const multiEnv = environments.length > 1
  const removing = deleteEnvironment.isPending

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
    })()
  }

  let accessibilityLabel = 'Delete this project'
  if (multiEnv && envArmed) {
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
  deletingProject,
  onRequestDeleteProject,
}: Readonly<{
  deletingProject: boolean
  onRequestDeleteProject: () => void
}>) {
  const {
    orgId,
    projectId,
    project,
    canOwn,
    setError,
  } = useProjectContext()
  const updateProject = useUpdateProject(orgId, projectId)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    setEditName(project?.displayName?.trim() ?? '')
  }, [project?.displayName, project?.id])

  if (!project) return null

  const saveName = async () => {
    const trimmed = editName.trim()
    if (trimmed === (project.displayName?.trim() ?? '')) return
    setError(null)
    const result = await updateProject.run({
      displayName: trimmed || undefined,
    })
    if (!result.ok) {
      if (updateProject.actionError) {
        setError(updateProject.actionError)
      }
    }
  }

  const saving = updateProject.isPending

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {canOwn ? (
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
          <Text style={styles.titleText} accessibilityRole="header">
            {project.displayName?.trim() || 'Unnamed project'}
          </Text>
        )}
        <ProjectTrashButton
          deletingProject={deletingProject}
          onRequestDeleteProject={onRequestDeleteProject}
        />
      </View>
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </View>
  )
}

function ProjectShellChrome({
  hideEnvSelector,
  sectionTabsInOverview,
  needsSetup,
  activeTab,
}: Readonly<{
  hideEnvSelector: boolean
  sectionTabsInOverview: boolean
  needsSetup: boolean
  activeTab: ReturnType<typeof activeProjectTabFromPathname>
}>) {
  if (needsSetup || activeTab === 'setup') return null
  return (
    <>
      {hideEnvSelector ? null : <EnvironmentSelector />}
      {sectionTabsInOverview ? null : <ProjectSectionTabs />}
    </>
  )
}

export function ProjectShell({ children }: Readonly<{ children: ReactNode }>) {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    loading,
    error,
    needsSetup,
  } = useProjectContext()
  const [deletingProject, setDeletingProject] = useState(false)

  const activeTab = activeProjectTabFromPathname(pathname, projectId)
  const managed = project ? isManagedProject(project) : false
  // Compose overview hosts the unified Project/env/section tabs in the editor toolbar.
  const sectionTabsInOverview = !managed && activeTab === 'overview'
  // Compose: env chips live in ProjectSectionTabs. Managed: hide selector on
  // Overview / Environments (those surfaces own their own env chrome).
  const hideEnvSelector = managed
    ? activeTab === 'environments' || activeTab === 'overview'
    : true

  const backStyle = StyleSheet.flatten([styles.backLink, webPointer])
  const rootPadding = {
    paddingBottom: Math.max(insets.bottom, spacing.md),
    paddingTop: Platform.OS === 'web' ? 0 : Math.max(insets.top - 8, 0),
  }

  if (loading && !project) {
    return (
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <Text style={orgPanelStyles.muted}>Loading project…</Text>
      </View>
    )
  }

  return (
    <View style={[styles.root, rootPadding]}>
      <Link href={`/${orgId}/projects` as Href} asChild>
        <Pressable
          style={backStyle}
          accessibilityRole="link"
          accessibilityLabel="Back to projects"
        >
          <Text style={styles.backLinkText}>← Projects</Text>
        </Pressable>
      </Link>

      <ProjectHeader
        deletingProject={deletingProject}
        onRequestDeleteProject={() => setDeletingProject(true)}
      />

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {deletingProject && project ? (
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
            sectionTabsInOverview={sectionTabsInOverview}
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
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  backLinkText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
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
  titleInput: {
    flex: 1,
    minWidth: 160,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingVertical: 0,
    minHeight: 44,
  },
  titleText: {
    flex: 1,
    minWidth: 160,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
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
})
