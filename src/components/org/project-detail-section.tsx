import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EnvironmentsOverviewSection } from '@/components/org/environments-overview-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchProject,
  isForbiddenError,
  type ProjectRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function hasComposeOptions(
  options: { compose?: Record<string, unknown> } | null | undefined,
): boolean {
  return Boolean(
    options?.compose && Object.keys(options.compose).length > 0,
  )
}

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

export function ProjectDetailSection({
  orgId,
  projectId,
}: {
  orgId: string
  projectId: string
}) {
  const { handleUnauthorized } = useAuth()
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchProject(projectId)
        if (!cancelled) {
          setProject(result.project)
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
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Compose: </Text>
            {hasComposeOptions(project.options) ? 'configured' : 'none'}
          </Text>
        </SectionPanel>
      ) : null}

      <EnvironmentsOverviewSection orgId={orgId} projectId={projectId} />
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
})
