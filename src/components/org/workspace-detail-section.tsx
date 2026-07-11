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
import { colors, spacing } from '@/lib/theme'

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
        {loading && !workspace ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : workspace ? (
          <>
            <View style={styles.header}>
              <Text style={orgPanelStyles.detailTitle}>
                {workspace.displayName?.trim() || 'Unnamed workspace'}
              </Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push(`/${orgId}/workspaces/${workspaceId}/edit`)}
              >
                <Text style={styles.secondaryButtonText}>Edit</Text>
              </Pressable>
            </View>
            {workspace.description ? (
              <Text style={orgPanelStyles.detailLine}>{workspace.description}</Text>
            ) : null}
          </>
        ) : null}
      </SectionPanel>

      <SectionPanel title="Projects" hint="Projects in this workspace">
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push(`/${orgId}/projects/new?workspaceId=${workspaceId}`)}
        >
          <Text style={styles.primaryButtonText}>New project</Text>
        </Pressable>
        {loading ? (
          <Text style={orgPanelStyles.muted}>Loading projects…</Text>
        ) : projects.length === 0 ? (
          <Text style={orgPanelStyles.muted}>No projects yet.</Text>
        ) : (
          <View style={styles.list}>
            {projects.map((project) => (
              <Pressable
                key={project.id}
                style={orgPanelStyles.detailCard}
                onPress={() => router.push(`/${orgId}/projects/${project.id}`)}
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
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  heading: { color: colors.text, fontSize: 28, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  list: { gap: spacing.sm },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  primaryButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
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
