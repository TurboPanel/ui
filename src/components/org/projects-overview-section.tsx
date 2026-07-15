import { useRouter, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  deleteProject,
  fetchVisibleProjects,
  isForbiddenError,
  PROJECT_HAS_CHILDREN_ERROR,
  type ProjectRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

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
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVisibleProjects(workspaceId)
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
        const result = await fetchVisibleProjects(workspaceId)
        if (!cancelled) {
          setProjects(result.projects)
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
  }, [orgId, workspaceId, handleUnauthorized])

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteProject(id)
      await loadProjects()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      const message =
        err instanceof Error ? err.message : 'Failed to delete project'
      if (message.includes(PROJECT_HAS_CHILDREN_ERROR)) {
        setError('This project has environments and cannot be deleted.')
      } else {
        setError(message)
      }
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const newProjectHref = (
    workspaceId
      ? `/${orgId}/projects/new?workspaceId=${encodeURIComponent(workspaceId)}`
      : `/${orgId}/projects/new`
  ) as Href

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
                      deleting.has(project.id) && styles.buttonDisabled,
                    ]}
                    disabled={deleting.has(project.id)}
                    onPress={() => void handleDelete(project.id)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {deleting.has(project.id) ? 'Deleting…' : 'Delete'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {project.description ? (
              <Text style={orgPanelStyles.detailLine}>
                {project.description}
              </Text>
            ) : null}
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Created: </Text>
              {new Date(project.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Projects</Text>
      <Text style={styles.copy}>
        Manage projects and their environments for this organization.
      </Text>

      <SectionPanel title="Projects" hint="Organization projects">
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
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.accent,
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
