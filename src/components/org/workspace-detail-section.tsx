import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { useAuth } from '@/lib/auth-context'
import {
  fetchVisibleProjects,
  fetchWorkspace,
  isForbiddenError,
  type ProjectRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { chrome, colors, spacing } from '@/lib/theme'

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
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }
  if (!workspace) {
    return null
  }
  return (
    <>
      <View style={styles.header}>
        <Text style={orgPanelStyles.detailTitle}>
          {workspace.displayName?.trim() || 'Unnamed workspace'}
        </Text>
        <Pressable style={styles.secondaryButton} onPress={onEdit}>
          <Text style={styles.secondaryButtonText}>Edit</Text>
        </Pressable>
      </View>
      {workspace.description ? (
        <Text style={orgPanelStyles.detailLine}>{workspace.description}</Text>
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
    return <Text style={orgPanelStyles.muted}>Loading projects…</Text>
  }
  if (projects.length === 0) {
    return <Text style={orgPanelStyles.muted}>No projects yet.</Text>
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
            {project.displayName?.trim() || 'Unnamed project'}
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
  const { handleUnauthorized } = useAuth()
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(null)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [workspaceResult, projectsResult] = await Promise.all([
          fetchWorkspace(workspaceId),
          fetchVisibleProjects(workspaceId),
        ])
        if (!cancelled) {
          setWorkspace(workspaceResult.workspace)
          setProjects(projectsResult.projects)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(err instanceof Error ? err.message : 'Failed to load workspace')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [handleUnauthorized, workspaceId])

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{workspace?.displayName?.trim() || 'Workspace'}</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <SectionPanel title="Workspace" hint="Workspace details">
        {renderWorkspaceBody({
          loading,
          workspace,
          onEdit: () => router.push(`/${orgId}/workspaces/${workspaceId}/edit`),
        })}
      </SectionPanel>

      <SectionPanel title="Projects" hint="Projects in this workspace">
        <View style={styles.projectActions}>
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              router.push(
                `/${orgId}/projects/new?workspaceId=${encodeURIComponent(workspaceId)}`,
              )
            }
          >
            <Text style={styles.primaryButtonText}>New project</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.push(
                `/${orgId}/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
              )
            }
          >
            <Text style={styles.secondaryButtonText}>View in Projects</Text>
          </Pressable>
        </View>
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
  heading: { color: colors.text, fontSize: 28, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  list: { gap: spacing.sm },
  projectActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: { color: chrome.onAccent, fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
})
