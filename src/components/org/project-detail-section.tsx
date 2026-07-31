import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { ManagedProjectSection } from '@/components/org/managed/managed-project-section'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createProjectPrincipal,
  deleteProjectPrincipal,
  fetchProject,
  fetchProjectPrincipals,
  fetchVisibleEnvironments,
  fetchVisibleServices,
  fetchVisibleWorkspaces,
  isForbiddenError,
  updateProject,
  updateProjectPrincipalAssignments,
  type ComposeDocument,
  type EnvironmentRecord,
  type ProjectPrincipalRecord,
  type ProjectRecord,
  type ServiceRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

type ProjectServiceOption = {
  id: string
  label: string
}

function formatServiceOptionLabel(
  environment: EnvironmentRecord,
  service: ServiceRecord,
): string {
  const envName = environment.displayName ?? 'Environment'
  const serviceName =
    service.displayName ?? service.composeServiceName ?? service.id.slice(0, 8)
  return `${envName} · ${serviceName}`
}

function ProjectPrincipalsSection({
  projectId,
  canManage,
}: Readonly<{
  projectId: string
  canManage: boolean
}>) {
  const { handleUnauthorized } = useAuth()
  const [principals, setPrincipals] = useState<ProjectPrincipalRecord[]>([])
  const [serviceOptions, setServiceOptions] = useState<ProjectServiceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [savingAssignments, setSavingAssignments] = useState<Set<string>>(() => new Set())

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [principalResult, envResult] = await Promise.all([
        fetchProjectPrincipals(projectId),
        fetchVisibleEnvironments(projectId),
      ])
      setPrincipals(principalResult.principals)

      const envs = envResult.environments
      const serviceLists = await Promise.all(
        envs.map(async (env) => {
          const { services } = await fetchVisibleServices(env.id)
          return services.map((service) => ({
            id: service.id,
            label: formatServiceOptionLabel(env, service),
          }))
        }),
      )
      const flat = serviceLists.flat()
      flat.sort((a, b) => a.label.localeCompare(b.label))
      setServiceOptions(flat)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load principals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId, handleUnauthorized])

  const toggleServiceAssignment = async (principalId: string, serviceId: string) => {
    const row = principals.find((p) => p.id === principalId)
    if (!row) return
    const next = row.serviceIds.includes(serviceId)
      ? row.serviceIds.filter((id) => id !== serviceId)
      : [...row.serviceIds, serviceId].sort((a, b) => a.localeCompare(b))

    setSavingAssignments((current) => new Set(current).add(principalId))
    setError(null)
    try {
      const result = await updateProjectPrincipalAssignments(projectId, principalId, next)
      setPrincipals((current) =>
        current.map((p) =>
          p.id === principalId ? { ...p, serviceIds: result.serviceIds } : p
        ),
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to update assignments')
    } finally {
      setSavingAssignments((current) => {
        const copy = new Set(current)
        copy.delete(principalId)
        return copy
      })
    }
  }

  const handleAdd = async () => {
    const trimmed = username.trim()
    if (!trimmed) {
      setError('Username is required.')
      return
    }
    setAdding(true)
    setError(null)
    try {
      await createProjectPrincipal(projectId, { username: trimmed })
      setUsername('')
      await load()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to create principal')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteProjectPrincipal(projectId, id)
      await load()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to delete principal')
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <SectionPanel
      title="Project principals"
      hint="Linux system users for this project. Assign a service so deploy ensures the account on the host — traditional-web sites use that principal for document-root ownership (and Apache php-fpm run-as); storage chown follows the same pin. Assign at most one principal per traditional-web service."
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {loading && principals.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      ) : null}
      {!loading && principals.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No principals yet.</Text>
      ) : null}
      <View style={styles.principalList}>
        {principals.map((row) => (
          <View key={row.id} style={orgPanelStyles.detailCard}>
            <Text style={orgPanelStyles.detailTitle}>{row.username}</Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>UID/GID: </Text>
              {row.metadata?.uid ?? '—'} / {row.metadata?.gid ?? '—'}
            </Text>
            {serviceOptions.length > 0 ? (
              <View style={styles.serviceAssignRow}>
                <Text style={orgPanelStyles.detailLabel}>Services</Text>
                <View style={styles.serviceChipRow}>
                  {serviceOptions.map((option) => {
                    const assigned = row.serviceIds.includes(option.id)
                    const disabled =
                      !canManage || savingAssignments.has(row.id)
                    return (
                      <Pressable
                        key={option.id}
                        disabled={disabled}
                        style={[
                          styles.serviceChip,
                          assigned && styles.serviceChipOn,
                          disabled && styles.buttonDisabled,
                        ]}
                        onPress={() => {
                          void toggleServiceAssignment(row.id, option.id)
                        }}
                      >
                        <Text
                          style={[
                            styles.serviceChipText,
                            assigned && styles.serviceChipTextOn,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
                {savingAssignments.has(row.id) ? (
                  <Text style={orgPanelStyles.muted}>Saving assignments…</Text>
                ) : null}
              </View>
            ) : null}
            {canManage ? (
              <Pressable
                style={[styles.principalDelete, deleting.has(row.id) && styles.buttonDisabled]}
                disabled={deleting.has(row.id)}
                onPress={() => {
                  void handleDelete(row.id)
                }}
              >
                <Text style={styles.principalDeleteText}>
                  {deleting.has(row.id) ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {canManage ? (
        <View style={styles.principalForm}>
          <TextInput
            style={Platform.OS === 'web' ? webInputStyle : styles.inlineInput}
            value={username}
            onChangeText={setUsername}
            onBlur={() => setUsername((current) => current.trim())}
            placeholder="Username (e.g. appuser)"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!adding}
          />
          <Pressable
            style={[styles.principalAdd, adding && styles.buttonDisabled]}
            disabled={adding}
            onPress={() => {
              void handleAdd()
            }}
          >
            <Text style={styles.principalAddText}>
              {adding ? 'Adding…' : 'Add principal'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SectionPanel>
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

function workspaceLabel(ws: WorkspaceRecord): string {
  return ws.displayName?.trim() || ws.id
}

function isComposeProject(project: ProjectRecord): boolean {
  const type = project.metadata?.type
  return type === 'docker-compose' || type == null
}

function isManagedProject(project: ProjectRecord): boolean {
  return project.metadata?.type === 'managed'
}

function projectTitleField({
  canOwn,
  project,
  editDisplayName,
  savingMeta,
  onChangeDisplayName,
  onSave,
}: Readonly<{
  canOwn: boolean
  project: ProjectRecord
  editDisplayName: string
  savingMeta: boolean
  onChangeDisplayName: (value: string) => void
  onSave: () => void
}>) {
  const displayTitle = project.displayName?.trim() || 'Unnamed project'
  if (!canOwn) {
    return <Text style={orgPanelStyles.pageTitle}>{displayTitle}</Text>
  }
  return (
    <TextInput
      style={[
        styles.titleInput,
        Platform.OS === 'web' ? styles.titleInputWeb : null,
      ]}
      value={editDisplayName}
      onChangeText={onChangeDisplayName}
      onBlur={onSave}
      placeholder="Project name"
      placeholderTextColor={colors.textDim}
      editable={!savingMeta}
      maxLength={255}
    />
  )
}

function projectDescriptionField({
  canOwn,
  project,
  editDescription,
  savingMeta,
  onChangeDescription,
  onSave,
}: Readonly<{
  canOwn: boolean
  project: ProjectRecord
  editDescription: string
  savingMeta: boolean
  onChangeDescription: (value: string) => void
  onSave: () => void
}>) {
  if (canOwn) {
    return (
      <TextInput
        style={[
          styles.descriptionInput,
          Platform.OS === 'web' ? styles.descriptionInputWeb : null,
        ]}
        value={editDescription}
        onChangeText={onChangeDescription}
        onBlur={onSave}
        placeholder="Add a description (optional)"
        placeholderTextColor={colors.textDim}
        multiline
        numberOfLines={3}
        editable={!savingMeta}
        maxLength={255}
      />
    )
  }
  if (project.description) {
    return <Text style={orgPanelStyles.pageCopy}>{project.description}</Text>
  }
  return null
}

function ProjectPageHeader({
  project,
  canOwn,
  editDisplayName,
  editDescription,
  savingMeta,
  onChangeDisplayName,
  onChangeDescription,
  onSave,
}: Readonly<{
  project: ProjectRecord
  canOwn: boolean
  editDisplayName: string
  editDescription: string
  savingMeta: boolean
  onChangeDisplayName: (value: string) => void
  onChangeDescription: (value: string) => void
  onSave: () => void
}>) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.headerRow}>
        {projectTitleField({
          canOwn,
          project,
          editDisplayName,
          savingMeta,
          onChangeDisplayName,
          onSave,
        })}
        {projectTypeBadge(project)}
      </View>
      {projectDescriptionField({
        canOwn,
        project,
        editDescription,
        savingMeta,
        onChangeDescription,
        onSave,
      })}
      {savingMeta ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </View>
  )
}

type ContainerNamingMode = 'uuid' | 'custom'

function ContainerNamingPanel({
  canManage,
  value,
  saving,
  onChange,
}: Readonly<{
  canManage: boolean
  value: ContainerNamingMode
  saving: boolean
  onChange: (mode: ContainerNamingMode) => void
}>) {
  return (
    <SectionPanel
      title="Container naming"
      hint="How Docker container_name values are generated at deploy"
    >
      {canManage ? (
        <View style={orgPanelStyles.segmentGroup}>
          {(
            [
              { mode: 'uuid' as const, label: 'UUID' },
              { mode: 'custom' as const, label: 'Custom' },
            ] as const
          ).map((option) => {
            const active = value === option.mode
            return (
              <Pressable
                key={option.mode}
                style={[
                  orgPanelStyles.segmentChip,
                  active && orgPanelStyles.segmentChipActive,
                  webPointer,
                  saving && styles.namingDisabled,
                ]}
                disabled={saving}
                onPress={() => {
                  onChange(option.mode)
                }}
              >
                <Text
                  style={[
                    orgPanelStyles.segmentChipText,
                    active && orgPanelStyles.segmentChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <Text style={orgPanelStyles.detailLine}>
          {value === 'custom' ? 'Custom' : 'UUID'}
        </Text>
      )}
      <Text style={orgPanelStyles.muted}>
        {value === 'custom'
          ? 'Uses each service’s explicit container name when set; otherwise Compose default names.'
          : 'Default — each container is named from its service UUID (with -<n> when scaled).'}
      </Text>
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </SectionPanel>
  )
}

function WorkspaceMovePanel({
  canOwn,
  workspaces,
  currentWorkspaceId,
  currentWorkspaceLabel,
  savingWorkspace,
  onMove,
}: Readonly<{
  canOwn: boolean
  workspaces: WorkspaceRecord[]
  currentWorkspaceId: string
  currentWorkspaceLabel: string
  savingWorkspace: boolean
  onMove: (workspaceId: string) => void
}>) {
  return (
    <SectionPanel
      title="Workspace"
      hint="Move this project to another workspace"
    >
      {canOwn ? (
        <View style={styles.serverList}>
          {workspaces.map((ws) => (
            <WorkspaceOptionRow
              key={ws.id}
              workspace={ws}
              selected={ws.id === currentWorkspaceId}
              disabled={savingWorkspace}
              onSelect={onMove}
            />
          ))}
        </View>
      ) : (
        <Text style={orgPanelStyles.detailLine}>{currentWorkspaceLabel}</Text>
      )}
      {savingWorkspace ? <Text style={orgPanelStyles.muted}>Moving…</Text> : null}
    </SectionPanel>
  )
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
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCompose, setSavingCompose] = useState(false)
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [savingContainerNaming, setSavingContainerNaming] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

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
          setEditDisplayName(projectResult.project.displayName?.trim() ?? '')
          setEditDescription(projectResult.project.description?.trim() ?? '')
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
      const containerNaming = project?.options?.containerNaming
      const options = containerNaming
        ? { compose, containerNaming }
        : { compose }
      await updateProject(projectId, { options })
      setProject((current) =>
        current
          ? {
              ...current,
              options: {
                ...current.options,
                compose,
                ...(containerNaming ? { containerNaming } : {}),
              },
            }
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

  const saveContainerNaming = async (containerNaming: ContainerNamingMode) => {
    const currentMode = project?.options?.containerNaming ?? 'uuid'
    if (currentMode === containerNaming) return

    setSavingContainerNaming(true)
    setError(null)
    try {
      const compose = project?.options?.compose
      const options = compose
        ? { compose, containerNaming }
        : { containerNaming }
      await updateProject(projectId, { options })
      setProject((current) =>
        current
          ? {
              ...current,
              options: {
                ...current.options,
                ...(compose ? { compose } : {}),
                containerNaming,
              },
            }
          : current,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to save container naming',
      )
    } finally {
      setSavingContainerNaming(false)
    }
  }

  const saveProjectMeta = async () => {
    const displayName = editDisplayName.trim()
    const description = editDescription.trim()
    setSavingMeta(true)
    setError(null)
    try {
      await updateProject(projectId, {
        displayName: displayName || undefined,
        description: description || undefined,
      })
      setProject((current) =>
        current
          ? {
              ...current,
              displayName: displayName || null,
              description: description || null,
            }
          : current,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setSavingMeta(false)
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
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {project ? (
        <>
          <ProjectPageHeader
            project={project}
            canOwn={canOwn}
            editDisplayName={editDisplayName}
            editDescription={editDescription}
            savingMeta={savingMeta}
            onChangeDisplayName={setEditDisplayName}
            onChangeDescription={setEditDescription}
            onSave={() => {
              void saveProjectMeta()
            }}
          />

          {isManagedProject(project) ? (
            <>
              <ManagedProjectSection
                orgId={orgId}
                projectId={projectId}
                engineCode={project.metadata?.code ?? null}
                projectDisplayName={
                  project.displayName?.trim() || 'Unnamed project'
                }
              />
              <WorkspaceMovePanel
                canOwn={canOwn}
                workspaces={sortedWorkspaces}
                currentWorkspaceId={project.workspaceId}
                currentWorkspaceLabel={currentWorkspaceLabel}
                savingWorkspace={savingWorkspace}
                onMove={(id) => {
                  void moveToWorkspace(id)
                }}
              />
            </>
          ) : (
            <>
              <ProjectPrincipalsSection
                projectId={project.id}
                canManage={canManage}
              />

              {isComposeProject(project) ? (
                <>
                  <ContainerNamingPanel
                    canManage={canManage}
                    value={project.options?.containerNaming ?? 'uuid'}
                    saving={savingContainerNaming}
                    onChange={(mode) => {
                      void saveContainerNaming(mode)
                    }}
                  />

                  <SectionPanel
                    title="Compose"
                    hint="Shared stack — each environment can override"
                    accent
                  >
                    <ComposeBasePanel
                      document={project.options?.compose}
                      onSave={saveCompose}
                      saving={savingCompose}
                    />
                  </SectionPanel>

                  <ProjectVariablesSection orgId={orgId} projectId={project.id} />
                </>
              ) : null}

              <WorkspaceMovePanel
                canOwn={canOwn}
                workspaces={sortedWorkspaces}
                currentWorkspaceId={project.workspaceId}
                currentWorkspaceLabel={currentWorkspaceLabel}
                savingWorkspace={savingWorkspace}
                onMove={(id) => {
                  void moveToWorkspace(id)
                }}
              />

              <ProjectEnvironmentsSection orgId={orgId} projectId={projectId} />
            </>
          )}
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
  pageHeader: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleInput: {
    flex: 1,
    minWidth: 200,
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 36,
  },
  titleInputWeb: {
    outlineStyle: 'none',
    borderWidth: 0,
    backgroundColor: 'transparent',
  } as const,
  descriptionInput: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  descriptionInputWeb: {
    outlineStyle: 'none',
    borderWidth: 0,
    backgroundColor: 'transparent',
    resize: 'none',
  } as const,
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
  namingDisabled: { opacity: 0.55 },
  serverList: { gap: spacing.xs },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  serverOptionSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  workspaceOptionText: {
    color: colors.text,
    fontSize: 13,
  },
  inlineInput: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  principalList: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  serviceAssignRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  serviceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  serviceChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  serviceChipOn: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  serviceChipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  serviceChipTextOn: {
    color: chrome.accent,
    fontWeight: '600',
  },
  principalForm: {
    gap: spacing.sm,
  },
  principalAdd: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  principalAddText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  principalDelete: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  principalDeleteText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
