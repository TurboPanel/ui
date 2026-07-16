import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { FirstRunWizard } from '@/components/org/first-run-wizard'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  createWorkspace,
  deleteWorkspace,
  fetchVisibleWorkspaces,
  WORKSPACE_HAS_CHILDREN_ERROR,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'
import { validateWorkspaceName } from '@/lib/workspace-validation'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const FIRST_RUN_NOTES = [
  'All of your projects can live in the same workspace.',
  'You can create as many workspaces as you want.',
  'Projects can be moved between workspaces at any time.',
] as const

export function WorkspacesOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [firstRunName, setFirstRunName] = useState('My Workspace')
  const [creatingFirst, setCreatingFirst] = useState(false)
  const [firstRunError, setFirstRunError] = useState<string | null>(null)

  const loadWorkspaces = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVisibleWorkspaces()
      setWorkspaces(result.workspaces)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load workspaces',
      )
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
        const result = await fetchVisibleWorkspaces()
        if (!cancelled) {
          setWorkspaces(result.workspaces)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load workspaces',
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
  }, [orgId])

  const handleCreateFirstWorkspace = async () => {
    const nameError = validateWorkspaceName(firstRunName)
    if (nameError) {
      setFirstRunError(nameError)
      return
    }

    setCreatingFirst(true)
    setFirstRunError(null)
    try {
      await createWorkspace({ displayName: firstRunName.trim() })
      await loadWorkspaces()
      await workspaceScope?.refreshWorkspaces()
    } catch (err) {
      setFirstRunError(
        err instanceof Error ? err.message : 'Failed to create workspace',
      )
    } finally {
      setCreatingFirst(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteWorkspace(id)
      await loadWorkspaces()
      await workspaceScope?.refreshWorkspaces()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete workspace'
      if (message.includes(WORKSPACE_HAS_CHILDREN_ERROR)) {
        setError('This workspace has projects and cannot be deleted.')
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

  const showFirstRunWizard =
    !loading && workspaces.length === 0 && canOwn

  let workspaceListContent
  if (loading && workspaces.length === 0) {
    workspaceListContent = (
      <Text style={orgPanelStyles.muted}>Loading…</Text>
    )
  } else if (workspaces.length === 0) {
    if (canOwn) {
      workspaceListContent = null
    } else {
      workspaceListContent = (
        <Text style={orgPanelStyles.muted}>No workspaces yet.</Text>
      )
    }
  } else {
    workspaceListContent = (
      <View style={styles.list}>
        {workspaces.map((ws) => (
          <View key={ws.id} style={orgPanelStyles.detailCard}>
            <View style={styles.cardHeader}>
              <Pressable onPress={() => router.push(`/${orgId}/workspaces/${ws.id}`)}>
                <Text style={orgPanelStyles.detailTitle}>
                  {ws.displayName?.trim() || 'Unnamed workspace'}
                </Text>
              </Pressable>
              {canOwn ? (
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      router.push(`/${orgId}/workspaces/${ws.id}/edit`)
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      deleting.has(ws.id) && styles.buttonDisabled,
                    ]}
                    disabled={deleting.has(ws.id)}
                    onPress={() => void handleDelete(ws.id)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {deleting.has(ws.id) ? 'Deleting…' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {ws.description ? (
              <Text style={orgPanelStyles.detailLine}>{ws.description}</Text>
            ) : null}
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Created: </Text>
              {new Date(ws.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Workspaces</Text>
      <Text style={styles.copy}>
        Create and edit workspaces here. Use the workspace switcher on the
        Projects screen to filter projects by workspace or view all workspaces.
      </Text>

      {showFirstRunWizard ? (
        <FirstRunWizard
          title="Create your first workspace"
          description="A workspace is a place to organize projects — by team, client, environment, or however you like. There's no wrong way to start: put everything in one workspace, or split things up from day one."
          notes={FIRST_RUN_NOTES}
          nameValue={firstRunName}
          onNameChange={(text) => {
            setFirstRunName(text)
            setFirstRunError(null)
          }}
          namePlaceholder="My Workspace"
          nameLabel="Workspace name"
          primaryActionLabel="Create workspace"
          onPrimaryAction={() => void handleCreateFirstWorkspace()}
          submitting={creatingFirst}
          error={firstRunError}
        />
      ) : null}

      <SectionPanel title="Workspaces" hint="Organization workspaces">
        {canOwn ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push(`/${orgId}/workspaces/new`)}
          >
            <Text style={styles.primaryButtonText}>New workspace</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

        {workspaceListContent}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
