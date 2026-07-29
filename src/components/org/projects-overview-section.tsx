import { useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { WorkspaceSwitcher } from '@/components/org/workspace-switcher'
import { useAuth } from '@/lib/auth-context'
import {
  fetchVisibleProjects,
  fetchVisibleWorkspaces,
  isForbiddenError,
  type ProjectRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'
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
  return null
}

export function ProjectsOverviewSection({
  orgId,
  workspaceId,
}: Readonly<{
  orgId: string
  workspaceId?: string
}>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  const scopeId = workspaceId ?? workspaceScope?.scopeId ?? ALL_WORKSPACES_SCOPE
  const scopedWorkspaceId =
    scopeId === ALL_WORKSPACES_SCOPE ? undefined : scopeId
  const showWorkspaceLabels = !scopedWorkspaceId

  const scopeWorkspaces = workspaceScope?.workspaces
  const scopeLabel = workspaceScope?.scope.label

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>()
    const source =
      scopeWorkspaces && scopeWorkspaces.length > 0 ? scopeWorkspaces : workspaces
    for (const workspace of source) {
      map.set(workspace.id, workspaceDisplayName(workspace))
    }
    return map
  }, [scopeWorkspaces, workspaces])

  const scopedWorkspaceName = scopedWorkspaceId
    ? (workspaceNameById.get(scopedWorkspaceId) ?? scopeLabel ?? 'this workspace')
    : null

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVisibleProjects(scopedWorkspaceId)
      setProjects(result.projects)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const needsWorkspaceNames =
          showWorkspaceLabels && (!scopeWorkspaces || scopeWorkspaces.length === 0)
        const [projectsResult, workspacesResult] = await Promise.all([
          fetchVisibleProjects(scopedWorkspaceId),
          needsWorkspaceNames
            ? fetchVisibleWorkspaces()
            : Promise.resolve({ workspaces: [] as WorkspaceRecord[] }),
        ])
        if (!cancelled) {
          setProjects(projectsResult.projects)
          if (needsWorkspaceNames) {
            setWorkspaces(workspacesResult.workspaces)
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load projects',
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
  }, [
    orgId,
    scopedWorkspaceId,
    showWorkspaceLabels,
    scopeWorkspaces,
    handleUnauthorized,
  ])

  const newProjectHref = newProjectHrefForScope(orgId, scopeId) as Href
  const deletingProject = deletingProjectId
    ? projects.find((project) => project.id === deletingProjectId) ?? null
    : null

  let headingCopy = 'Projects across every workspace in this organization.'
  let panelHint = 'All workspaces'
  if (scopedWorkspaceName) {
    headingCopy = `Projects in ${scopedWorkspaceName}.`
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
          <View key={project.id} style={orgPanelStyles.detailCard}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Text style={orgPanelStyles.detailTitle}>
                  {project.displayName?.trim() || 'Unnamed project'}
                </Text>
                {projectTypeBadge(project.metadata)}
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() =>
                    router.push(`/${orgId}/projects/${project.id}` as Href)
                  }
                >
                  <Text style={styles.secondaryButtonText}>Open</Text>
                </Pressable>
                {canOwn ? (
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      deletingProjectId === project.id && styles.buttonDisabled,
                    ]}
                    disabled={deletingProjectId === project.id}
                    onPress={() => {
                      setError(null)
                      setDeletingProjectId(project.id)
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {project.description ? (
              <Text style={orgPanelStyles.detailLine}>
                {project.description}
              </Text>
            ) : null}
            {showWorkspaceLabels ? (
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Workspace: </Text>
                {workspaceNameById.get(project.workspaceId) ?? 'Unknown'}
              </Text>
            ) : null}
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Created: </Text>
              {new Date(project.createdAt).toLocaleString()}
            </Text>
            {deletingProjectId === project.id && deletingProject ? (
              <ProjectDeletePanel
                project={deletingProject}
                onCancel={() => setDeletingProjectId(null)}
                onDeleted={() => {
                  setDeletingProjectId(null)
                  void loadProjects()
                }}
                onUnauthorized={handleUnauthorized}
              />
            ) : null}
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.pageHeader}>
        <View style={styles.pageIntro}>
          <Text style={orgPanelStyles.pageTitle}>Projects</Text>
          <Text style={orgPanelStyles.pageCopy}>{headingCopy}</Text>
        </View>
        <WorkspaceSwitcher orgId={orgId} />
      </View>

      <SectionPanel title="Projects" hint={panelHint}>
        {canOwn ? (
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  pageIntro: {
    flex: 1,
    minWidth: 200,
    gap: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
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
