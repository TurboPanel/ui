import { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native'
import {
  Badge,
  Button,
  EmptyState,
  InlineNotice,
  LoadingState,
  TextField,
} from '@/components/ui'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { ManagedProjectSection } from '@/components/org/managed/managed-project-section'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { usePersistProjectCompose } from '@/components/org/compose-persistence'
import { PrincipalAccessPanel } from '@/components/org/principal-access-panel'
import { unownedManagedDirectorySites } from '@/lib/compose/managed-directory-sites'
import {
  type ComposeDocument,
  type EnvironmentRecord,
  type PrincipalAccessLevel,
  type ProjectRecord,
  type ServiceRecord,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import {
  useCreateProjectPrincipal,
  useDeleteProjectPrincipal,
  useProject,
  useProjectPrincipals,
  useUpdateProject,
  useUpdateProjectPrincipal,
  useUpdateProjectPrincipalAssignments,
} from '@/lib/queries/projects'
import { useEnvironments } from '@/lib/queries/environments'
import { useServicesByEnvironments } from '@/lib/queries/services'
import { useWorkspaces } from '@/lib/queries/workspaces'
import { orEmptyArray } from '@/lib/or-empty-array'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import { DISPLAY_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '@/lib/display-name'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

type ProjectServiceOption = {
  id: string
  label: string
}

function formatServiceOptionLabel(
  environment: EnvironmentRecord,
  service: ServiceRecord,
): string {
  const envName = environment.name ?? 'Environment'
  const serviceName =
    service.name ?? service.composeServiceName ?? service.id.slice(0, 8)
  return `${envName} · ${serviceName}`
}

export function ProjectPrincipalsSection({
  orgId,
  projectId,
  canManage,
  embedded = false,
}: Readonly<{
  orgId: string
  projectId: string
  canManage: boolean
  /** Body only — no surrounding `SectionPanel` (Settings Add System user). */
  embedded?: boolean
}>) {
  const principalsQuery = useProjectPrincipals(orgId, projectId)
  const projectQuery = useProject(orgId, projectId)
  const environmentsQuery = useEnvironments(orgId, projectId)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )
  const servicesByEnvQuery = useServicesByEnvironments(orgId, environmentIds)
  const createPrincipal = useCreateProjectPrincipal(orgId, projectId)
  const deletePrincipal = useDeleteProjectPrincipal(orgId, projectId)
  const updateAssignments = useUpdateProjectPrincipalAssignments(orgId, projectId)
  const updatePrincipal = useUpdateProjectPrincipal(orgId, projectId)
  const [savingEntitlements, setSavingEntitlements] = useState<Set<string>>(
    new Set(),
  )
  const [savingAccess, setSavingAccess] = useState<Set<string>>(new Set())

  // Memoized because the `?? []` fallback is a fresh array on every render,
  // and `unownedSites` below depends on it.
  const principals = useMemo(
    () => principalsQuery.data?.principals ?? [],
    [principalsQuery.data],
  )
  const serviceOptions = useMemo(() => {
    const flat: ProjectServiceOption[] = []
    for (const env of environments) {
      const services = servicesByEnvQuery.servicesByEnv[env.id] ?? []
      for (const service of services) {
        flat.push({
          id: service.id,
          label: formatServiceOptionLabel(env, service),
        })
      }
    }
    flat.sort((a, b) => a.label.localeCompare(b.label))
    return flat
  }, [environments, servicesByEnvQuery.servicesByEnv])

  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [savingAssignments, setSavingAssignments] = useState<Set<string>>(
    () => new Set(),
  )

  /**
   * Uploaded-directory sites with no account to own them.
   *
   * Deploy-prepare already refuses this, but that is the moment the operator
   * presses Deploy — this says it while the fix is one control away. Before the
   * first deploy there are no service rows at all, so a freshly created Hosting
   * project lands here by construction, which is exactly when it is useful.
   */
  const unownedSites = useMemo(
    () =>
      unownedManagedDirectorySites({
        document: projectQuery.data?.project?.options?.compose,
        services: environments.flatMap(
          (env) => servicesByEnvQuery.servicesByEnv[env.id] ?? [],
        ),
        principals,
      }),
    [
      projectQuery.data,
      environments,
      servicesByEnvQuery.servicesByEnv,
      principals,
    ],
  )

  const loading =
    principalsQuery.isLoading ||
    environmentsQuery.isLoading ||
    servicesByEnvQuery.isLoading

  let queryError: string | null = null
  if (principalsQuery.error instanceof Error) {
    queryError = principalsQuery.error.message
  } else if (environmentsQuery.error instanceof Error) {
    queryError = environmentsQuery.error.message
  }

  useEffect(() => {
    setError(queryError)
  }, [queryError])

  const toggleServiceAssignment = async (
    principalId: string,
    serviceId: string,
  ) => {
    const row = principals.find((p) => p.id === principalId)
    if (!row) return
    const next = row.serviceIds.includes(serviceId)
      ? row.serviceIds.filter((id) => id !== serviceId)
      : [...row.serviceIds, serviceId].sort((a, b) => a.localeCompare(b))

    setSavingAssignments((current) => new Set(current).add(principalId))
    setError(null)
    const result = await updateAssignments.run({ principalId, serviceIds: next })
    if (!result.ok && updateAssignments.actionError) {
      setError(updateAssignments.actionError)
    }
    setSavingAssignments((current) => {
      const copy = new Set(current)
      copy.delete(principalId)
      return copy
    })
  }

  /**
   * Grant or revoke one runtime series.
   *
   * Sends `entitlements` only — never `serviceIds` — because the API reads an
   * absent field as "leave them alone". Including an empty steward list here
   * would silently unassign every service.
   */
  const toggleEntitlement = async (
    principalId: string,
    runtime: string,
    series: string,
  ) => {
    const row = principals.find((p) => p.id === principalId)
    if (!row) return
    const held = row.entitlements.some(
      (entry) => entry.runtime === runtime && entry.series === series,
    )
    const next = held
      ? row.entitlements.filter(
        (entry) => !(entry.runtime === runtime && entry.series === series),
      )
      : [...row.entitlements, { runtime, series, grantedBy: 'operator' as const }]

    setSavingEntitlements((current) => new Set(current).add(principalId))
    setError(null)
    const result = await updatePrincipal.run({
      principalId,
      entitlements: next.map(({ runtime: r, series: v }) => ({
        runtime: r,
        series: v,
      })),
    })
    if (!result.ok && updatePrincipal.actionError) {
      setError(updatePrincipal.actionError)
    }
    setSavingEntitlements((current) => {
      const copy = new Set(current)
      copy.delete(principalId)
      return copy
    })
  }

  /**
   * Set how an account may sign in.
   *
   * Sends `access` only, for the same reason `toggleEntitlement` sends only
   * `entitlements`: the API reads an absent field as "leave it alone", so
   * including an empty steward or entitlement list here would silently revoke
   * something the operator never touched.
   */
  const changeAccess = async (
    principalId: string,
    access: PrincipalAccessLevel,
  ) => {
    setSavingAccess((current) => new Set(current).add(principalId))
    setError(null)
    const result = await updatePrincipal.run({ principalId, access })
    if (!result.ok && updatePrincipal.actionError) {
      setError(updatePrincipal.actionError)
    }
    setSavingAccess((current) => {
      const copy = new Set(current)
      copy.delete(principalId)
      return copy
    })
  }

  const handleAdd = async () => {
    const trimmed = username.trim()
    if (!trimmed) {
      setError('Username is required.')
      return
    }
    setError(null)
    const result = await createPrincipal.run({ username: trimmed })
    if (!result.ok) {
      if (createPrincipal.actionError) {
        setError(createPrincipal.actionError)
      }
      return
    }
    setUsername('')
  }

  const handleDelete = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    const result = await deletePrincipal.run(id)
    if (!result.ok && deletePrincipal.actionError) {
      setError(deletePrincipal.actionError)
    }
    setDeleting((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  const adding = createPrincipal.isPending

  const body = (
    <>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {unownedSites.length > 0 ? (
        <InlineNotice
          tone="warning"
          title={
            unownedSites.length === 1
              ? `"${unownedSites[0]}" has no account yet`
              : `${unownedSites.length} sites have no account yet`
          }
          body={`An uploaded-directory site is a directory and an account — the webroot belongs to the account, and without one there is nobody to upload as. Add a system user below and assign it to ${
            unownedSites.length === 1 ? 'that service' : 'those services'
          }.`}
        />
      ) : null}
      {loading && principals.length === 0 ? <LoadingState /> : null}
      {!loading && principals.length === 0 ? (
        <EmptyState title="No principals yet." />
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
            <View style={styles.serviceAssignRow}>
              <Text style={orgPanelStyles.muted}>
                Runtimes this user may execute. Without a grant its processes
                cannot start the interpreter at all — the check is the kernel&apos;s,
                not ours.
              </Text>
              <View style={styles.serviceChipRow}>
                {RUNTIME_GRANTS.map((grant: RuntimeGrant) => {
                  const held = row.entitlements.find(
                    (entry) =>
                      entry.runtime === grant.runtime &&
                      entry.series === grant.series,
                  )
                  const disabled =
                    !canManage || savingEntitlements.has(row.id)
                  return (
                    <Pressable
                      key={`${grant.runtime}-${grant.series}`}
                      disabled={disabled}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: held != null, disabled }}
                      accessibilityLabel={grant.label}
                      style={[
                        styles.serviceChip,
                        held && styles.serviceChipOn,
                        disabled && styles.buttonDisabled,
                      ]}
                      onPress={() => {
                        void toggleEntitlement(
                          row.id,
                          grant.runtime,
                          grant.series,
                        )
                      }}
                    >
                      <Text
                        style={[
                          styles.serviceChipText,
                          held && styles.serviceChipTextOn,
                        ]}
                      >
                        {/* A deploy-inserted grant is still a real, revocable
                            grant — the marker says why it is there, not that
                            it is different. */}
                        {held?.grantedBy === 'deploy'
                          ? `${grant.label} · from a service`
                          : grant.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {savingEntitlements.has(row.id) ? (
                <Text style={orgPanelStyles.muted}>Saving runtimes…</Text>
              ) : null}
            </View>
            <View style={styles.serviceAssignRow}>
              <PrincipalAccessPanel
                orgId={orgId}
                projectId={projectId}
                principalId={row.id}
                username={row.username}
                access={row.access}
                canManage={canManage}
                savingAccess={savingAccess.has(row.id)}
                onChangeAccess={(next) => {
                  void changeAccess(row.id, next)
                }}
              />
            </View>
            {canManage ? (
              <View style={styles.principalDeleteRow}>
                <Button
                  label="Delete"
                  busyLabel="Deleting…"
                  variant="secondary"
                  size="sm"
                  busy={deleting.has(row.id)}
                  accessibilityLabel={`Delete ${row.username}`}
                  onPress={() => {
                    void handleDelete(row.id)
                  }}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {canManage ? (
        <View style={styles.principalForm}>
          <TextField
            label="Username"
            value={username}
            onChangeText={setUsername}
            onBlur={() => setUsername((current) => current.trim())}
            placeholder="Username (e.g. appuser)"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!adding}
          />
          <Button
            label="Add principal"
            busyLabel="Adding…"
            variant="primary"
            busy={adding}
            onPress={() => {
              void handleAdd()
            }}
          />
        </View>
      ) : null}
    </>
  )

  if (embedded) {
    return <View style={styles.principalEmbedded}>{body}</View>
  }

  return (
    <SectionPanel
      title="Project principals"
      hint="Linux system users for this project. Assign a service so deploy ensures the account on the host — sites use that principal for document-root ownership (and Apache php-fpm run-as); storage chown follows the same pin. Assign at most one principal per site service."
    >
      {body}
    </SectionPanel>
  )
}

type RuntimeGrant = { runtime: string; series: string; label: string }

/**
 * Runtime grants an operator can hand out.
 *
 * Per `(runtime, series)`, not per runtime: co-installed PHP versions are
 * distinct binaries, so granting 8.4 must not also grant 8.3 with whatever CVEs
 * another tenant's pinned app is carrying. Mirrors the daemon's runtime
 * registry, which stays the authority on what a given host can offer.
 */
const RUNTIME_GRANTS: readonly RuntimeGrant[] = [
  { runtime: 'php', series: '8.3', label: 'PHP 8.3' },
  { runtime: 'php', series: '8.4', label: 'PHP 8.4' },
  { runtime: 'node', series: '22', label: 'Node 22' },
  { runtime: 'node', series: '24', label: 'Node 24' },
]

function projectTypeBadge(project: ProjectRecord) {
  const type = project.metadata?.type
  if (type === 'managed') {
    return <Badge label="managed" tone="ok" />
  }
  if (type === 'template') {
    return <Badge label="template" tone="muted" />
  }
  return null
}

function workspaceLabel(ws: WorkspaceRecord): string {
  return ws.name?.trim() || ws.id
}

/** Platform type (`system`) is deliberately excluded. */
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
  const displayTitle = project.name?.trim() || 'Unnamed project'
  if (!canOwn) {
    return <Text style={orgPanelStyles.pageTitle}>{displayTitle}</Text>
  }
  return (
    <TextInput
      style={[
        styles.titleInput,
        Platform.OS === 'web' ? projectTitleInputWebStyle : null,
      ]}
      value={editDisplayName}
      onChangeText={onChangeDisplayName}
      onBlur={onSave}
      placeholder="Project name"
      placeholderTextColor={colors.textDim}
      editable={!savingMeta}
      maxLength={DISPLAY_NAME_MAX_LENGTH}
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
          Platform.OS === 'web' ? projectDescriptionInputWebStyle : null,
        ]}
        value={editDescription}
        onChangeText={onChangeDescription}
        onBlur={onSave}
        placeholder="Add a description (optional)"
        placeholderTextColor={colors.textDim}
        multiline
        numberOfLines={3}
        editable={!savingMeta}
        maxLength={DESCRIPTION_MAX_LENGTH}
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
  const keepOriginal = value === 'custom'
  return (
    <SectionPanel
      title="Container naming"
      hint="How Docker container_name values are generated at deploy"
    >
      {canManage ? (
        <View style={styles.namingBlock}>
          <View style={styles.namingSwitchRow}>
            <View style={styles.namingSwitchCopy}>
              <Text style={styles.namingSwitchLabel}>
                Keep original container names
              </Text>
              <Text style={orgPanelStyles.muted}>
                By default TurboPanel renames containers so you can run multiple
                instances of this project.
              </Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: keepOriginal, disabled: saving }}
              accessibilityLabel="Keep original container names"
              disabled={saving}
              hitSlop={6}
              onPress={() => {
                onChange(keepOriginal ? 'uuid' : 'custom')
              }}
              style={[
                styles.namingToggle,
                keepOriginal ? styles.namingToggleOn : styles.namingToggleOff,
                webPointer,
                saving && styles.namingDisabled,
              ]}
            >
              <Text style={styles.namingToggleText}>
                {keepOriginal ? 'On' : 'Off'}
              </Text>
            </Pressable>
          </View>
          {keepOriginal ? (
            <View style={orgPanelStyles.calloutWarning}>
              <Text style={orgPanelStyles.calloutWarningText}>
                Keeping original names disables rolling updates. We rename
                containers by default so multiple instances of this project can
                run side by side.
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={orgPanelStyles.detailLine}>
          {keepOriginal
            ? 'Keep original container names'
            : 'Rename containers (default)'}
        </Text>
      )}
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
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')
  const projectQuery = useProject(orgId, projectId)
  const workspacesQuery = useWorkspaces(orgId)
  const updateProjectMutation = useUpdateProject(orgId, projectId)
  const persistProjectCompose = usePersistProjectCompose(orgId, projectId)

  const project = projectQuery.data?.project ?? null
  const workspaces = orEmptyArray(workspacesQuery.data?.workspaces)
  const loading = projectQuery.isLoading || workspacesQuery.isLoading

  const [error, setError] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  useEffect(() => {
    if (!project) return
    setEditDisplayName(project.name?.trim() ?? '')
    setEditDescription(project.description?.trim() ?? '')
  }, [project])

  useEffect(() => {
    let queryError: string | null = null
    if (projectQuery.error instanceof Error) {
      queryError = projectQuery.error.message
    } else if (workspacesQuery.error instanceof Error) {
      queryError = workspacesQuery.error.message
    }
    setError(queryError)
  }, [projectQuery.error, workspacesQuery.error])

  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
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
    setError(null)
    const result = await persistProjectCompose.run(compose)
    if (!result.ok && persistProjectCompose.actionError) {
      setError(persistProjectCompose.actionError)
    }
  }

  const saveContainerNaming = async (containerNaming: ContainerNamingMode) => {
    const currentMode = project?.options?.containerNaming ?? 'uuid'
    if (currentMode === containerNaming || !project) return

    setError(null)
    const options = buildProjectOptionsPatch(project, { containerNaming })
    const result = await updateProjectMutation.run({ options })
    if (!result.ok && updateProjectMutation.actionError) {
      setError(updateProjectMutation.actionError)
    }
  }

  const saveProjectMeta = async () => {
    const displayName = editDisplayName.trim()
    const description = editDescription.trim()
    setError(null)
    const result = await updateProjectMutation.run({
      name: displayName || undefined,
      description: description || undefined,
    })
    if (!result.ok && updateProjectMutation.actionError) {
      setError(updateProjectMutation.actionError)
    }
  }

  const moveToWorkspace = async (workspaceId: string) => {
    if (workspaceId === project?.workspaceId) {
      return
    }
    setError(null)
    const result = await updateProjectMutation.run({ workspaceId })
    if (!result.ok && updateProjectMutation.actionError) {
      setError(updateProjectMutation.actionError)
    }
  }

  const savingCompose = persistProjectCompose.isPending
  const savingWorkspace = updateProjectMutation.isPending
  const savingContainerNaming = updateProjectMutation.isPending
  const savingMeta = updateProjectMutation.isPending

  if (loading && !project) {
    return (
      <View style={styles.root}>
        <LoadingState />
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
                projectName={
                  project.name?.trim() || 'Unnamed project'
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
                orgId={orgId}
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

const projectTitleInputWebStyle = {
  outlineStyle: 'none',
  borderWidth: 0,
  backgroundColor: 'transparent',
} as unknown as TextStyle

const projectDescriptionInputWebStyle = {
  outlineStyle: 'none',
  borderWidth: 0,
  backgroundColor: 'transparent',
  resize: 'none',
} as unknown as TextStyle

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
  descriptionInput: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  namingDisabled: { opacity: 0.55 },
  namingBlock: {
    gap: spacing.sm,
  },
  namingSwitchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  namingSwitchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  namingSwitchLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  namingToggle: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 32,
    justifyContent: 'center',
  },
  namingToggleOn: {
    backgroundColor: chrome.accent,
  },
  namingToggleOff: {
    backgroundColor: colors.border,
  },
  namingToggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  serverList: { gap: spacing.xs },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
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
  principalEmbedded: {
    gap: spacing.sm,
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
  principalDeleteRow: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
