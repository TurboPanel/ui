import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchProject,
  fetchVisibleWorkspaces,
  isForbiddenError,
  updateProject,
  type ComposeDocument,
  type ProjectRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function projectTypeBadge(project: ProjectRecord) {
  const type = project.metadata?.type
  if (type === 'managed') {
    return (
      <View style={styles.badgeAccent}>
        <Text style={styles.badgeAccentText}>managed</Text>
      </View>
    )
  }
  if (type === 'template') {
    return (
      <View style={styles.badgeMuted}>
        <Text style={styles.badgeMutedText}>template</Text>
      </View>
    )
  }
  return null
}

function workspaceLabel(ws: WorkspaceRecord): string {
  return ws.displayName?.trim() || ws.id
}

function WorkspaceOptionRow({
  workspace,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  workspace: WorkspaceRecord
  selected: boolean
  disabled: boolean
  onSelect: (workspaceId: string) => void
}>) {
  const label = workspaceLabel(workspace)
  if (selected) {
    return (
      <View style={[styles.serverOption, styles.serverOptionSelected]}>
        <Text style={styles.workspaceOptionText}>{label}</Text>
      </View>
    )
  }
  return (
    <Pressable
      style={styles.serverOption}
      disabled={disabled}
      onPress={() => {
        onSelect(workspace.id)
      }}
    >
      <Text style={styles.workspaceOptionText}>{label}</Text>
    </Pressable>
  )
}

export function ProjectDetailSection({
  orgId,
  projectId,
}: Readonly<{
  orgId: string
  projectId: string
}>) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCompose, setSavingCompose] = useState(false)
  const [savingWorkspace, setSavingWorkspace] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [projectResult, workspacesResult] = await Promise.all([
          fetchProject(projectId),
          fetchVisibleWorkspaces(),
        ])
        if (!cancelled) {
          setProject(projectResult.project)
          setWorkspaces(workspacesResult.workspaces)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load project',
          )
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
  }, [projectId, handleUnauthorized])

  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [workspaces],
  )

  const currentWorkspaceLabel = useMemo(() => {
    if (!project) {
      return ''
    }
    const current = workspaces.find((ws) => ws.id === project.workspaceId)
    return current ? workspaceLabel(current) : project.workspaceId
  }, [project, workspaces])

  const saveCompose = async (compose: ComposeDocument) => {
    setSavingCompose(true)
    setError(null)
    try {
      await updateProject(projectId, { options: { compose } })
      setProject((current) =>
        current
          ? { ...current, options: { compose } }
          : current,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save compose')
    } finally {
      setSavingCompose(false)
    }
  }

  const moveToWorkspace = async (workspaceId: string) => {
    if (workspaceId === project?.workspaceId) {
      return
    }
    setSavingWorkspace(true)
    setError(null)
    try {
      await updateProject(projectId, { workspaceId })
      setProject((current) =>
        current ? { ...current, workspaceId } : current,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to move project',
      )
    } finally {
      setSavingWorkspace(false)
    }
  }

  if (loading && !project) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>
        {project?.displayName?.trim() || 'Project'}
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {project ? (
        <>
          <SectionPanel title="Project" hint="Project details">
            <View style={styles.headerRow}>
              <Text style={orgPanelStyles.detailTitle}>
                {project.displayName?.trim() || 'Unnamed project'}
              </Text>
              {projectTypeBadge(project)}
            </View>
            {project.description ? (
              <Text style={orgPanelStyles.detailLine}>{project.description}</Text>
            ) : null}
            <ComposeEditorSection
              document={project.options?.compose}
              onSave={saveCompose}
              saving={savingCompose}
            />
          </SectionPanel>

          <SectionPanel
            title="Workspace"
            hint="Move this project to another workspace"
          >
            {canOwn ? (
              <View style={styles.serverList}>
                {sortedWorkspaces.map((ws) => (
                  <WorkspaceOptionRow
                    key={ws.id}
                    workspace={ws}
                    selected={ws.id === project.workspaceId}
                    disabled={savingWorkspace}
                    onSelect={(id) => {
                      void moveToWorkspace(id)
                    }}
                  />
                ))}
              </View>
            ) : (
              <Text style={orgPanelStyles.detailLine}>
                {currentWorkspaceLabel}
              </Text>
            )}
            {savingWorkspace ? (
              <Text style={orgPanelStyles.muted}>Moving…</Text>
            ) : null}
          </SectionPanel>

          <ProjectEnvironmentsSection orgId={orgId} projectId={projectId} />
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeAccent: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeAccentText: {
    color: colors.accent,
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
  serverList: { gap: spacing.xs },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  serverOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  workspaceOptionText: {
    color: colors.text,
    fontSize: 13,
  },
})
