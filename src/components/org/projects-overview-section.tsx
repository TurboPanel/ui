import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { PlatformBadge } from '@/components/org/platform-badge'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { panelStyles } from '@/components/ui/panel-styles'
import { WorkspaceSwitcher } from '@/components/org/workspace-switcher'
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import { useProjects, useWorkspaces } from '@/lib/queries'
import type { ProjectRecord } from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  SYSTEM_PROJECT_METADATA_TYPE,
  isTurbopanelProject,
  isTurbopanelWorkspace,
} from '@/lib/system-inventory'
import { spacing } from '@/lib/theme'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import {
  ALL_WORKSPACES_SCOPE,
  newProjectHrefForScope,
  workspaceName,
} from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

function projectTypeBadge(type: ProjectRecord['metadata']) {
  const projectType = type?.type
  if (projectType === SYSTEM_PROJECT_METADATA_TYPE) {
    return null
  }
  if (projectType === 'managed') {
    return <Badge label="managed" tone="ok" />
  }
  if (projectType === 'template') {
    return <Badge label="template" tone="muted" />
  }
  if (projectType === 'docker-compose') {
    return <Badge label="compose" tone="muted" />
  }
  return <Badge label="setup" tone="muted" />
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
    <View style={panelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text style={panelStyles.detailTitle}>
            {project.name?.trim() || 'Unnamed project'}
          </Text>
          {projectTypeBadge(project.metadata)}
          {showPlatformBadge ? <PlatformBadge /> : null}
        </View>
        <View style={styles.cardActions}>
          <Button label="Open" variant="secondary" size="sm" onPress={onOpen} />
          {canOwn && !hideDelete ? (
            <Button
              label="Delete"
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onPress={onDelete}
            />
          ) : null}
        </View>
      </View>
      {project.description ? (
        <Text style={panelStyles.detailLine}>{project.description}</Text>
      ) : null}
      {showWorkspaceLabels ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Workspace: </Text>
          {workspaceName}
        </Text>
      ) : null}
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Created: </Text>
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
    scopeWorkspace != null && isTurbopanelWorkspace(scopeWorkspace)

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
        (project) => !isTurbopanelProject(project, allWorkspaces),
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
      map.set(workspace.id, workspaceName(workspace))
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
    projectListContent = <LoadingState />
  } else if (projects.length === 0) {
    projectListContent = <EmptyState title="No projects yet." />
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
        <Text style={panelStyles.pageTitle}>Projects</Text>
        <WorkspaceSwitcher orgId={orgId} />
      </View>

      <SectionPanel title="Projects" hint={panelHint}>
        {canOwn && !isSystemScope ? (
          <Button
            label="New project"
            variant="primary"
            onPress={() => router.push(newProjectHref)}
          />
        ) : null}

        {error ? <Text style={panelStyles.error}>{error}</Text> : null}

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
})
