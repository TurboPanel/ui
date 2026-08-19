import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { PlatformBadge } from '@/components/org/platform-badge'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { WorkspaceSwitcher } from '@/components/org/workspace-switcher'
import { useProjects, useWorkspaces } from '@/lib/queries'
import type { ProjectRecord } from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  isSystemProject,
  isSystemWorkspace,
} from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import {
  ALL_WORKSPACES_SCOPE,
  newProjectHrefForScope,
  workspaceDisplayName,
} from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

function projectTypeBadge(type: ProjectRecord['metadata']) {
  const projectType = type?.type
  if (projectType === 'managed') {
    return (
      <View style={styles.badgeAccent}>
        <Text style={styles.badgeAccentText}>managed</Text>
      </View>
    )
  }
  if (projectType === 'template') {
    return (
      <View style={styles.badgeMuted}>
        <Text style={styles.badgeMutedText}>template</Text>
      </View>
    )
  }
  if (projectType === 'docker-compose') {
    return (
      <View style={styles.badgeMuted}>
        <Text style={styles.badgeMutedText}>compose</Text>
      </View>
    )
  }
  return (
    <View style={styles.badgeMuted}>
      <Text style={styles.badgeMutedText}>setup</Text>
    </View>
  )
}

function queryErrorMessage(
  projectsError: unknown,
  workspacesError: unknown,
): string | null {
  if (projectsError instanceof Error) {
    return projectsError.message
  }
  if (workspacesError instanceof Error) {
    return workspacesError.message
  }
  return null
}

function ProjectOverviewCard({
  orgId,
  project,
  canOwn,
  showWorkspaceLabels,
  workspaceName,
  showPlatformBadge,
  hideDelete,
  isDeleting,
  deletingProject,
  onOpen,
  onDelete,
  onCancelDelete,
  onDeleted,
}: Readonly<{
  orgId: string
  project: ProjectRecord
  canOwn: boolean
  showWorkspaceLabels: boolean
  workspaceName: string
  showPlatformBadge: boolean
  hideDelete: boolean
  isDeleting: boolean
  deletingProject: ProjectRecord | null
  onOpen: () => void
  onDelete: () => void
  onCancelDelete: () => void
  onDeleted: () => void
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text style={orgPanelStyles.detailTitle}>
            {project.displayName?.trim() || 'Unnamed project'}
          </Text>
          {projectTypeBadge(project.metadata)}
          {showPlatformBadge ? <PlatformBadge /> : null}
        </View>
        <View style={styles.cardActions}>
          <Pressable style={styles.secondaryButton} onPress={onOpen}>
            <Text style={styles.secondaryButtonText}>Open</Text>
          </Pressable>
          {canOwn && !hideDelete ? (
            <Pressable
              style={[
                styles.secondaryButton,
                isDeleting && styles.buttonDisabled,
              ]}
              disabled={isDeleting}
              onPress={onDelete}
            >
              <Text style={styles.secondaryButtonText}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {project.description ? (
        <Text style={orgPanelStyles.detailLine}>{project.description}</Text>
      ) : null}
      {showWorkspaceLabels ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Workspace: </Text>
          {workspaceName}
        </Text>
      ) : null}
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {new Date(project.createdAt).toLocaleString()}
      </Text>
      {isDeleting && deletingProject ? (
        <ProjectDeletePanel
          orgId={orgId}
          project={deletingProject}
          onCancel={onCancelDelete}
          onDeleted={onDeleted}
        />
      ) : null}
    </View>
  )
}

export function ProjectsOverviewSection({
  orgId,
  workspaceId,
}: Readonly<{
  orgId: string
  workspaceId?: string
}>) {
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  const scopeId = workspaceId ?? workspaceScope?.scopeId ?? ALL_WORKSPACES_SCOPE
  const scopedWorkspaceId =
    scopeId === ALL_WORKSPACES_SCOPE ? undefined : scopeId
  const showWorkspaceLabels = !scopedWorkspaceId

  const scopeWorkspaces = workspaceScope?.workspaces
  const scopeLabel = workspaceScope?.scope.label
  const scopeWorkspace = workspaceScope?.scope.workspace
  const isSystemScope =
    scopeWorkspace != null && isSystemWorkspace(scopeWorkspace)

  const projectsQuery = useProjects(orgId, scopedWorkspaceId)
  const needsWorkspaceNames =
    showWorkspaceLabels && (!scopeWorkspaces || scopeWorkspaces.length === 0)
  const workspacesQuery = useWorkspaces(orgId, {
    enabled: needsWorkspaceNames || showWorkspaceLabels,
  })

  usePullToRefresh(async () => {
    await Promise.all([
      projectsQuery.refetch(),
      ...(needsWorkspaceNames || showWorkspaceLabels
        ? [workspacesQuery.refetch()]
        : []),
    ])
    await workspaceScope?.refreshWorkspaces()
  })

  const allWorkspaces = useMemo(() => {
    if (scopeWorkspaces && scopeWorkspaces.length > 0) {
      return scopeWorkspaces
    }
    return workspacesQuery.data?.workspaces ?? []
  }, [scopeWorkspaces, workspacesQuery.data?.workspaces])

  const rawProjects = orEmptyArray(projectsQuery.data?.projects)
  const projects = useMemo(() => {
    // All-workspaces scope hides platform infrastructure projects.
    if (scopeId === ALL_WORKSPACES_SCOPE) {
      return rawProjects.filter(
        (project) => !isSystemProject(project, allWorkspaces),
      )
    }
    return rawProjects
  }, [rawProjects, scopeId, allWorkspaces])

  const workspaces = useMemo(
    () =>
      needsWorkspaceNames
        ? orEmptyArray(workspacesQuery.data?.workspaces)
        : [],
    [needsWorkspaceNames, workspacesQuery.data?.workspaces],
  )
  const loading =
    projectsQuery.isLoading || (needsWorkspaceNames && workspacesQuery.isLoading)
  const error = queryErrorMessage(projectsQuery.error, workspacesQuery.error)

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const workspace of allWorkspaces.length > 0 ? allWorkspaces : workspaces) {
      map.set(workspace.id, workspaceDisplayName(workspace))
    }
    return map
  }, [allWorkspaces, workspaces])

  const scopedWorkspaceName = scopedWorkspaceId
    ? (workspaceNameById.get(scopedWorkspaceId) ?? scopeLabel ?? 'this workspace')
    : null

  const newProjectHref = newProjectHrefForScope(orgId, scopeId) as Href
  const deletingProject = deletingProjectId
    ? projects.find((project) => project.id === deletingProjectId) ?? null
    : null

  let panelHint = 'All workspaces'
  if (scopedWorkspaceName) {
    panelHint = scopedWorkspaceName
  }

  let projectListContent
  if (loading && projects.length === 0) {
    projectListContent = (
      <Text style={orgPanelStyles.muted}>Loading…</Text>
    )
  } else if (projects.length === 0) {
    projectListContent = (
      <Text style={orgPanelStyles.muted}>No projects yet.</Text>
    )
  } else {
    projectListContent = (
      <View style={styles.list}>
        {projects.map((project) => (
          <ProjectOverviewCard
            key={project.id}
            orgId={orgId}
            project={project}
            canOwn={canOwn}
            showWorkspaceLabels={showWorkspaceLabels}
            workspaceName={
              workspaceNameById.get(project.workspaceId) ?? 'Unknown'
            }
            showPlatformBadge={isSystemScope}
            hideDelete={isSystemScope}
            isDeleting={deletingProjectId === project.id}
            deletingProject={deletingProject}
            onOpen={() =>
              router.push(`/${orgId}/projects/${project.id}` as Href)
            }
            onDelete={() => setDeletingProjectId(project.id)}
            onCancelDelete={() => setDeletingProjectId(null)}
            onDeleted={() => setDeletingProjectId(null)}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.pageHeader}>
        <Text style={orgPanelStyles.pageTitle}>Projects</Text>
        <WorkspaceSwitcher orgId={orgId} />
      </View>

      <SectionPanel title="Projects" hint={panelHint}>
        {canOwn && !isSystemScope ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push(newProjectHref)}
          >
            <Text style={styles.primaryButtonText}>New project</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

        {projectListContent}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  pageHeader: {
    width: '100%',
    gap: spacing.md,
  },
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  badgeAccent: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeAccentText: {
    color: chrome.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeMuted: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeMutedText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: chrome.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
