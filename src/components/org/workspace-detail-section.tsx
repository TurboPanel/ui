import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PlatformBadge } from '@/components/org/platform-badge'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { Button, ButtonRow, EmptyState, LoadingState } from '@/components/ui'
import { useProjects, useWorkspace } from '@/lib/queries'
import type { ProjectRecord, WorkspaceRecord } from '@/lib/instance-api'
import {
  isTurbopanelWorkspace,
  TURBOPANEL_WORKSPACE_DESCRIPTION,
} from '@/lib/system-inventory'
import { spacing } from '@/lib/theme'

function workspaceDescription(workspace: WorkspaceRecord): string | null {
  if (isTurbopanelWorkspace(workspace)) {
    return TURBOPANEL_WORKSPACE_DESCRIPTION
  }
  return workspace.description || null
}

function renderWorkspaceBody({
  loading,
  workspace,
  onEdit,
}: Readonly<{
  loading: boolean
  workspace: WorkspaceRecord | null
  onEdit: () => void
}>) {
  if (loading && !workspace) {
    return <LoadingState />
  }
  if (!workspace) {
    return null
  }
  const system = isTurbopanelWorkspace(workspace)
  const description = workspaceDescription(workspace)
  return (
    <>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={orgPanelStyles.detailTitle}>
            {workspace.name?.trim() || 'Unnamed workspace'}
          </Text>
          {system ? <PlatformBadge /> : null}
        </View>
        {!system ? (
          <Button label="Edit" variant="secondary" size="sm" onPress={onEdit} />
        ) : null}
      </View>
      {description ? (
        <Text style={orgPanelStyles.detailLine}>{description}</Text>
      ) : null}
    </>
  )
}

function renderProjectsBody({
  loading,
  projects,
  onOpenProject,
}: Readonly<{
  loading: boolean
  projects: ProjectRecord[]
  onOpenProject: (projectId: string) => void
}>) {
  if (loading) {
    return <LoadingState label="Loading projects…" />
  }
  if (projects.length === 0) {
    return <EmptyState title="No projects yet." />
  }
  return (
    <View style={styles.list}>
      {projects.map((project) => (
        <Pressable
          key={project.id}
          style={orgPanelStyles.detailCard}
          onPress={() => onOpenProject(project.id)}
        >
          <Text style={orgPanelStyles.detailTitle}>
            {project.name?.trim() || 'Unnamed project'}
          </Text>
          {project.description ? (
            <Text style={orgPanelStyles.detailLine}>{project.description}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}

export function WorkspaceDetailSection({
  orgId,
  workspaceId,
}: Readonly<{
  orgId: string
  workspaceId: string
}>) {
  const router = useRouter()
  const workspaceQuery = useWorkspace(orgId, workspaceId)
  const projectsQuery = useProjects(orgId, workspaceId)

  const workspace = workspaceQuery.data?.workspace ?? null
  const projects = projectsQuery.data?.projects ?? []
  const loading = workspaceQuery.isLoading || projectsQuery.isLoading
  const system = workspace != null && isTurbopanelWorkspace(workspace)
  let error: string | null = null
  if (workspaceQuery.error instanceof Error) {
    error = workspaceQuery.error.message
  } else if (projectsQuery.error instanceof Error) {
    error = projectsQuery.error.message
  }

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text style={orgPanelStyles.pageTitle}>
          {workspace?.name?.trim() || 'Workspace'}
        </Text>
        {system ? <PlatformBadge /> : null}
      </View>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <SectionPanel title="Workspace" hint="Workspace details">
        {renderWorkspaceBody({
          loading,
          workspace,
          onEdit: () => router.push(`/${orgId}/workspaces/${workspaceId}/edit`),
        })}
      </SectionPanel>

      <SectionPanel title="Projects" hint="Projects in this workspace">
        <ButtonRow>
          {!system ? (
            <Button
              label="New project"
              variant="primary"
              onPress={() =>
                router.push(
                  `/${orgId}/projects/new?workspaceId=${encodeURIComponent(workspaceId)}`,
                )
              }
            />
          ) : null}
          <Button
            label="View in Projects"
            variant="secondary"
            size="sm"
            onPress={() =>
              router.push(
                `/${orgId}/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
              )
            }
          />
        </ButtonRow>
        {renderProjectsBody({
          loading,
          projects,
          onOpenProject: (projectId) => router.push(`/${orgId}/projects/${projectId}`),
        })}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  list: { gap: spacing.sm },
})
