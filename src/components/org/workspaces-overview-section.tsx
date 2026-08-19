import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { FirstRunWizard } from '@/components/org/first-run-wizard'
import { PlatformBadge } from '@/components/org/platform-badge'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { displayNameConflictMessage, isDisplayNameTaken } from '@/lib/display-name'
import { WORKSPACE_HAS_CHILDREN_ERROR } from '@/lib/instance-api'
import { useCreateWorkspace, useDeleteWorkspace, useWorkspaces } from '@/lib/queries'
import { useCan } from '@/lib/query-client'
import {
  isSystemWorkspace,
  SYSTEM_WORKSPACE_DESCRIPTION,
  userWorkspaces,
} from '@/lib/system-inventory'
import { colors, spacing } from '@/lib/theme'
import { validateWorkspaceName } from '@/lib/workspace-validation'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const CREATE_WORKSPACE_NOTES = [
  'Group projects by team, client, environment, or however you like.',
  'You can create as many workspaces as you want.',
  'Projects can be moved between workspaces at any time.',
] as const

export function WorkspacesOverviewSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const workspacesQuery = useWorkspaces(orgId)
  const createWorkspace = useCreateWorkspace(orgId)
  const deleteWorkspaceMutation = useDeleteWorkspace(orgId)

  const workspaces = orEmptyArray(workspacesQuery.data?.workspaces)
  const userFacingWorkspaces = useMemo(
    () => userWorkspaces(workspaces),
    [workspaces],
  )
  const loading = workspacesQuery.isLoading
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const queryError =
    workspacesQuery.error instanceof Error
      ? workspacesQuery.error.message
      : null

  const handleCreateWorkspace = async () => {
    const nameError = validateWorkspaceName(createName)
    if (nameError) {
      setCreateError(nameError)
      return
    }
    if (
      isDisplayNameTaken(
        createName,
        userFacingWorkspaces.map((workspace) => workspace.displayName),
      )
    ) {
      setCreateError(
        'A workspace with this name already exists in the organization.',
      )
      return
    }

    setCreateError(null)
    const result = await createWorkspace.run({ displayName: createName.trim() })
    if (!result.ok) {
      if (result.error) {
        setCreateError(displayNameConflictMessage(result.error) ?? result.error)
      }
      return
    }
    setCreateName('')
    await workspaceScope?.refreshWorkspaces()
  }

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    const result = await deleteWorkspaceMutation.run(id)
    if (!result.ok) {
      if (result.error) {
        if (result.error.includes(WORKSPACE_HAS_CHILDREN_ERROR)) {
          setError('This workspace has projects and cannot be deleted.')
        } else {
          setError(result.error)
        }
      }
    } else {
      await workspaceScope?.refreshWorkspaces()
    }
    setDeleting((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  let workspaceListContent
  if (loading && workspaces.length === 0) {
    workspaceListContent = (
      <Text style={orgPanelStyles.muted}>Loading…</Text>
    )
  } else if (workspaces.length === 0) {
    workspaceListContent = (
      <Text style={orgPanelStyles.muted}>No workspaces yet.</Text>
    )
  } else {
    workspaceListContent = (
      <View style={styles.list}>
        {workspaces.map((ws) => {
          const system = isSystemWorkspace(ws)
          return (
            <View key={ws.id} style={orgPanelStyles.detailCard}>
              <View style={styles.cardHeader}>
                <Pressable
                  style={styles.titlePress}
                  onPress={() => router.push(`/${orgId}/workspaces/${ws.id}`)}
                >
                  <View style={styles.titleRow}>
                    <Text style={orgPanelStyles.detailTitle}>
                      {ws.displayName?.trim() || 'Unnamed workspace'}
                    </Text>
                    {system ? <PlatformBadge /> : null}
                  </View>
                </Pressable>
                {canOwn && !system ? (
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
              {system ? (
                <Text style={orgPanelStyles.detailLine}>
                  {SYSTEM_WORKSPACE_DESCRIPTION}
                </Text>
              ) : ws.description ? (
                <Text style={orgPanelStyles.detailLine}>{ws.description}</Text>
              ) : null}
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Created: </Text>
                {new Date(ws.createdAt).toLocaleString()}
              </Text>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Workspaces</Text>
      <Text style={styles.copy}>
        New organizations start with a Default Workspace. Create more here, then
        use the workspace switcher on Projects to filter by workspace.
      </Text>

      {canOwn ? (
        <FirstRunWizard
          title="Create a workspace"
          description="A workspace is a place to organize projects — by team, client, environment, or however you like."
          notes={CREATE_WORKSPACE_NOTES}
          nameValue={createName}
          onNameChange={(text) => {
            setCreateName(text)
            setCreateError(null)
          }}
          namePlaceholder="Workspace name"
          nameLabel="Workspace name"
          primaryActionLabel="Create workspace"
          onPrimaryAction={() => void handleCreateWorkspace()}
          submitting={createWorkspace.isPending}
          error={createError}
        />
      ) : null}

      <SectionPanel title="Workspaces" hint="Organization workspaces">
        {error ?? queryError ? (
          <Text style={orgPanelStyles.error}>{error ?? queryError}</Text>
        ) : null}

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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titlePress: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
