import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { EnvironmentsOverviewSection } from '@/components/org/environments-overview-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  normalizeCompose,
  readComposePlacementServerId,
  setComposePlacementServerId,
} from '@/lib/compose'
import {
  fetchOrgServers,
  fetchProject,
  isForbiddenError,
  updateProject,
  type ComposeDocument,
  type OrgServerRecord,
  type ProjectRecord,
} from '@/lib/instance-api'
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

function serverLabel(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname || server.id
}

function placementSummary(
  placementServerId: string | null,
  servers: OrgServerRecord[],
): string {
  if (!placementServerId) {
    return 'Not pinned — server chosen at deploy time.'
  }
  const pinned = servers.find((server) => server.id === placementServerId)
  if (!pinned) {
    return `Pinned to ${placementServerId}`
  }
  const offlineHint = pinned.connected ? '' : ' (offline)'
  return `Pinned to ${serverLabel(pinned)}${offlineHint}`
}

export function ProjectDetailSection({
  orgId,
  projectId,
}: Readonly<{
  orgId: string
  projectId: string
}>) {
  const { handleUnauthorized } = useAuth()
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCompose, setSavingCompose] = useState(false)
  const [savingPlacement, setSavingPlacement] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [projectResult, serversResult] = await Promise.all([
          fetchProject(projectId),
          fetchOrgServers(),
        ])
        if (!cancelled) {
          setProject(projectResult.project)
          setServers(serversResult.servers)
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

  const placementServerId = useMemo(
    () =>
      project
        ? readComposePlacementServerId(normalizeCompose(project.options?.compose))
        : null,
    [project],
  )

  const sortedServers = useMemo(
    () =>
      [...servers].sort((a, b) =>
        (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id),
      ),
    [servers],
  )

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

  const savePlacement = async (serverId: string | null) => {
    setSavingPlacement(true)
    setError(null)
    try {
      const compose = setComposePlacementServerId(
        normalizeCompose(project?.options?.compose),
        serverId,
      )
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
      setError(err instanceof Error ? err.message : 'Failed to save placement')
    } finally {
      setSavingPlacement(false)
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
            title="Server placement"
            hint="Pin this project (all environments) to one server"
          >
            <Text style={orgPanelStyles.detailLine}>
              {placementSummary(placementServerId, servers)}
            </Text>
            <Text style={orgPanelStyles.muted}>
              Save compose edits above before changing placement if both need updating.
            </Text>
            <View style={styles.serverList}>
              <Pressable
                style={[
                  styles.serverOption,
                  placementServerId === null && styles.serverOptionSelected,
                ]}
                disabled={savingPlacement}
                onPress={() => {
                  void savePlacement(null)
                }}
              >
                <Text style={styles.serverOptionText}>Unpinned</Text>
              </Pressable>
              {sortedServers.map((server) => {
                const selected = placementServerId === server.id
                const canSelect = server.connected
                if (!canSelect) {
                  return (
                    <View
                      key={server.id}
                      style={[
                        styles.serverOption,
                        styles.serverOptionDisabled,
                        selected && styles.serverOptionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.serverOptionText,
                          styles.serverOptionTextDisabled,
                        ]}
                      >
                        {serverLabel(server)} (offline)
                      </Text>
                    </View>
                  )
                }
                return (
                  <Pressable
                    key={server.id}
                    style={[
                      styles.serverOption,
                      selected && styles.serverOptionSelected,
                    ]}
                    disabled={savingPlacement}
                    onPress={() => {
                      void savePlacement(server.id)
                    }}
                  >
                    <Text style={styles.serverOptionText}>
                      {serverLabel(server)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {savingPlacement ? (
              <Text style={orgPanelStyles.muted}>Saving placement…</Text>
            ) : null}
          </SectionPanel>
        </>
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
  serverOptionDisabled: {
    opacity: 0.6,
  },
  serverOptionText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  serverOptionTextDisabled: {
    color: colors.textMuted,
  },
})
