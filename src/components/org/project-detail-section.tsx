import { useEffect, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import {
  Badge,
  Button,
  ConfirmButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import { HeaderChevron } from '@/components/header-chevron'
import { ComposeBasePanel } from '@/components/org/compose-base-panel'
import { ManagedProjectSection } from '@/components/org/managed/managed-project-section'
import { ProjectVariablesSection } from '@/components/org/project-variables-section'
import { ProjectEnvironmentsSection } from '@/components/org/project-environments-section'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  usePersistAccountWrites,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import { PrincipalAccessPanel } from '@/components/org/principal-access-panel'
import { nextPrincipalAlias } from '@/lib/compose/principals-document'
import {
  declaredAccountsWithoutRows,
  knownAccountNames,
  planAccountDeclaration,
  servicePrincipalAlias,
} from '@/lib/compose/principal-required'
import { unownedSitesAcrossDocuments } from '@/lib/compose/managed-directory-sites'
import {
  type ComposeDocument,
  type EnvironmentRecord,
  type PrincipalAccessLevel,
  type ProjectPrincipalRecord,
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
import { isManagedProject, isTemplateProject, projectDisplayType } from '@/lib/project-navigation'
import { DISPLAY_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '@/lib/display-name'
import { useCan } from '@/lib/query-client'
import {
  PrincipalNameSchemeField,
  usePrincipalNameScheme,
} from '@/components/org/principal-name-scheme-field'
import { principalNamesLabel, principalSchemeErrorMessage } from '@/lib/principal-name-scheme'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

type ProjectServiceOption = {
  id: string
  label: string
  /** Lowercase compose account alias the service names, if any. */
  alias: string | null
}

function formatServiceOptionLabel(environment: EnvironmentRecord, service: ServiceRecord): string {
  const envName = environment.name ?? 'Environment'
  const serviceName = service.name ?? service.composeServiceName ?? service.id.slice(0, 8)
  return `${envName} · ${serviceName}`
}

/**
 * What "Add Hosting Account" would do while apps wait for an account: the plan for
 * a given name, whether any app is waiting, and the name suggested for it.
 */
function useAccountPlan({
  project,
  environments,
  servicesByEnv,
  principals,
  loading,
}: Readonly<{
  project: ProjectRecord | undefined
  environments: readonly EnvironmentRecord[]
  servicesByEnv: Readonly<Record<string, readonly ServiceRecord[] | undefined>>
  principals: readonly ProjectPrincipalRecord[]
  loading: boolean
}>) {
  const planFor = (name: string) =>
    planAccountDeclaration({
      username: name,
      base: project?.options?.compose,
      environments: environments.map((env) => ({
        id: env.id,
        document: env.options?.compose,
        services: servicesByEnv[env.id] ?? [],
      })),
      principals,
    })
  return {
    planFor,
    waitingForAccount: !loading && planFor('') !== null,
    suggestedUsername: suggestedAccountName(project, environments, principals),
  }
}

/** A blank username means the suggested one only while an app is waiting. */
function blankUsernameFallback(waiting: boolean, suggested: string): string {
  return waiting ? suggested : ''
}

function usernamePlaceholder(waiting: boolean, suggested: string): string {
  return waiting ? suggested : 'Username (e.g. appuser)'
}

/**
 * The name offered for a waiting app: the project's only existing account when
 * it has exactly one (adding it again attaches it, and the panel reuses the
 * same account), otherwise the project's name.
 */
function suggestedAccountName(
  project: ProjectRecord | undefined,
  environments: readonly EnvironmentRecord[],
  principals: readonly ProjectPrincipalRecord[]
): string {
  const known = knownAccountNames(
    [project?.options?.compose, ...environments.map((env) => env.options?.compose)],
    principals
  )
  const only = known.size === 1 ? [...known][0] : undefined
  return only ?? nextPrincipalAlias([], project?.name ?? '')
}

function WaitingForAccountNotice({ suggested }: Readonly<{ suggested: string }>) {
  return (
    <InlineNotice
      tone="warning"
      title="An app is waiting for a Hosting Account"
      body={`Add one below (${suggested} if you leave it blank) and the app runs as it, so Deploy is ready. With more than one Hosting Account, pick which one each app runs as in Configuration.`}
    />
  )
}

/**
 * Whether an app in this project is waiting for a Hosting Account, read from
 * the same documents and rows the Hosting Account list uses. Screens outside
 * Bindings (Set Up Production) use it to offer the add form in place.
 */
export function useProjectAccountWaiting(orgId: string, projectId: string): boolean {
  const principalsQuery = useProjectPrincipals(orgId, projectId)
  const projectQuery = useProject(orgId, projectId)
  const environmentsQuery = useEnvironments(orgId, projectId)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const servicesByEnvQuery = useServicesByEnvironments(orgId, environmentIds)
  const principals = useMemo(() => principalsQuery.data?.principals ?? [], [principalsQuery.data])
  const { waitingForAccount } = useAccountPlan({
    project: projectQuery.data?.project,
    environments,
    servicesByEnv: servicesByEnvQuery.servicesByEnv,
    principals,
    loading:
      principalsQuery.isLoading || environmentsQuery.isLoading || servicesByEnvQuery.isLoading,
  })
  return waitingForAccount
}

/**
 * Accounts the compose declares that have no row yet: the panel creates each
 * one on the next deploy, so the list shows them instead of looking empty.
 */
function DeclaredAccountRows({ names }: Readonly<{ names: readonly string[] }>) {
  return names.map((name) => (
    <View key={name} style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{name}</Text>
      <Text style={styles.principalSummary} numberOfLines={2}>
        Declared in the configuration file. It is created on the server with the next deploy.
      </Text>
    </View>
  ))
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
  /** Body only — no surrounding `SectionPanel` (Bindings, Set Up Production). */
  embedded?: boolean
}>) {
  const principalsQuery = useProjectPrincipals(orgId, projectId)
  const projectQuery = useProject(orgId, projectId)
  const environmentsQuery = useEnvironments(orgId, projectId)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const servicesByEnvQuery = useServicesByEnvironments(orgId, environmentIds)
  const createPrincipal = useCreateProjectPrincipal(orgId, projectId)
  const persistAccount = usePersistAccountWrites(orgId, projectId)
  const nameScheme = usePrincipalNameScheme(orgId)
  const deletePrincipal = useDeleteProjectPrincipal(orgId, projectId)
  const updateAssignments = useUpdateProjectPrincipalAssignments(orgId, projectId)
  const updatePrincipal = useUpdateProjectPrincipal(orgId, projectId)
  const [savingAccess, setSavingAccess] = useState<Set<string>>(new Set())

  // Memoized because the `?? []` fallback is a fresh array on every render,
  // and `unownedSites` below depends on it.
  const principals = useMemo(() => principalsQuery.data?.principals ?? [], [principalsQuery.data])
  const serviceOptions = useMemo(() => {
    const flat: ProjectServiceOption[] = []
    for (const env of environments) {
      const services = servicesByEnvQuery.servicesByEnv[env.id] ?? []
      for (const service of services) {
        // The compose alias wins over serviceIds at deploy, so a service whose
        // document names an account is linked to it whatever the row says.
        const alias =
          servicePrincipalAlias(env.options?.compose, service.composeServiceName) ??
          servicePrincipalAlias(
            projectQuery.data?.project?.options?.compose,
            service.composeServiceName
          )
        flat.push({
          id: service.id,
          label: formatServiceOptionLabel(env, service),
          alias: alias?.toLowerCase() ?? null,
        })
      }
    }
    flat.sort((a, b) => a.label.localeCompare(b.label))
    return flat
  }, [environments, servicesByEnvQuery.servicesByEnv, projectQuery.data])

  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [savingAssignments, setSavingAssignments] = useState<Set<string>>(() => new Set())
  // Collapsed by default: the list is for scanning; one row expands in place
  // when it is being worked on (MASTER: expand-in-place, not a page of forms).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const toggleExpanded = (principalId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(principalId)) {
        next.delete(principalId)
      } else {
        next.add(principalId)
      }
      return next
    })
  }

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
      // The Base may be empty (the content lives in the primary environment), so
      // every environment's own compose is read as well as the Base's.
      unownedSitesAcrossDocuments({
        documents: [
          projectQuery.data?.project?.options?.compose,
          ...environments.map((env) => env.options?.compose),
        ],
        services: environments.flatMap((env) => servicesByEnvQuery.servicesByEnv[env.id] ?? []),
        principals,
      }),
    [projectQuery.data, environments, servicesByEnvQuery.servicesByEnv, principals]
  )

  const declaredOnly = useMemo(
    () =>
      declaredAccountsWithoutRows(
        [
          projectQuery.data?.project?.options?.compose,
          ...environments.map((env) => env.options?.compose),
        ],
        principals
      ),
    [projectQuery.data, environments, principals]
  )

  const loading =
    principalsQuery.isLoading || environmentsQuery.isLoading || servicesByEnvQuery.isLoading

  let queryError: string | null = null
  if (principalsQuery.error instanceof Error) {
    queryError = userErrorMessage(principalsQuery.error, '')
  } else if (environmentsQuery.error instanceof Error) {
    queryError = userErrorMessage(environmentsQuery.error, '')
  }

  useEffect(() => {
    setError(queryError)
  }, [queryError])

  const toggleServiceAssignment = async (principalId: string, serviceId: string) => {
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
   * Set how an account may sign in.
   *
   * Sends `access` only: the API reads an absent field as "leave it alone",
   * so including an empty steward list here would silently revoke something
   * the operator never touched.
   */
  const changeAccess = async (principalId: string, access: PrincipalAccessLevel) => {
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

  const { planFor, waitingForAccount, suggestedUsername } = useAccountPlan({
    project: projectQuery.data?.project,
    environments,
    servicesByEnv: servicesByEnvQuery.servicesByEnv,
    principals,
    loading,
  })

  const saveDeclaredAccount = async (writes: Parameters<typeof persistAccount.run>[0]) => {
    const saved = await persistAccount.run(writes)
    if (saved.ok) setUsername('')
    else setError(persistAccount.actionError ?? 'Could not add the Hosting Account.')
  }

  const handleAdd = async () => {
    const trimmed = username.trim() || blankUsernameFallback(waitingForAccount, suggestedUsername)
    if (!trimmed) {
      setError('Username is required.')
      return
    }
    setError(null)
    // An app is waiting for an account: declare the account where the app is
    // declared (and attach it when it is the only one) instead of adding a
    // loose account row nothing is attached to.
    const plan = planFor(trimmed)
    if (plan) {
      await saveDeclaredAccount(plan.writes)
      return
    }
    const result = await createPrincipal.run({
      username: trimmed,
      nameScheme: nameScheme.requestScheme,
    })
    if (!result.ok) {
      const raw = result.error ?? createPrincipal.actionError
      if (raw) {
        setError(principalSchemeErrorMessage(raw, trimmed))
      }
      return
    }
    setUsername('')
    nameScheme.reset()
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

  const adding = createPrincipal.isPending || persistAccount.isPending

  const body = (
    <>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {unownedSites.length > 0 ? (
        <InlineNotice
          tone="warning"
          title={
            unownedSites.length === 1
              ? `"${unownedSites[0]}" has no account yet`
              : `${unownedSites.length} sites have no account yet`
          }
          body={`An uploaded-directory site is a directory and an account — the webroot belongs to the account, and without one there is nobody to upload as. Add a Hosting Account below and assign it to ${
            unownedSites.length === 1 ? 'that service' : 'those services'
          }.`}
        />
      ) : null}
      {waitingForAccount ? <WaitingForAccountNotice suggested={suggestedUsername} /> : null}
      {loading && principals.length === 0 ? <LoadingState /> : null}
      {!loading && principals.length === 0 && declaredOnly.length === 0 ? (
        <EmptyState title="No Hosting Accounts yet." />
      ) : null}
      <View style={styles.principalList}>
        <DeclaredAccountRows names={declaredOnly} />
        {principals.map((row) => {
          const expanded = expandedIds.has(row.id)
          const header = (
            <Pressable
              style={[styles.principalHeader, webPointer]}
              onPress={() => toggleExpanded(row.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? `Collapse ${row.username}` : `Expand ${row.username}`}
            >
              <View style={styles.principalHeaderText}>
                <Text style={panelStyles.detailTitle}>
                  {principalNamesLabel(row.username, row.appliedUsername)}
                </Text>
                <Text style={styles.principalSummary} numberOfLines={1}>
                  {principalRowSummary(row)}
                </Text>
              </View>
              <HeaderChevron size={12} color={colors.textMuted} open={expanded} />
            </Pressable>
          )

          if (!expanded) {
            return (
              <View key={row.id} style={panelStyles.detailCard}>
                {header}
              </View>
            )
          }

          return (
            <View key={row.id} style={panelStyles.detailCard}>
              {header}
              <Text style={panelStyles.detailLine}>
                <Text style={panelStyles.detailLabel}>UID/GID: </Text>
                {row.metadata?.uid ?? '—'} / {row.metadata?.gid ?? '—'}
              </Text>
              {serviceOptions.length > 0 ? (
                <View style={styles.serviceAssignRow}>
                  <Text style={panelStyles.detailLabel}>Services</Text>
                  <View style={styles.serviceChipRow}>
                    {serviceOptions.map((option) => {
                      const rowAlias = (row.metadata?.composeAlias ?? row.username).toLowerCase()
                      const assigned =
                        row.serviceIds.includes(option.id) || option.alias === rowAlias
                      // A document that names this account owns the link; the row
                      // cannot undo it from here.
                      const fromDocument = option.alias === rowAlias
                      const disabled = !canManage || savingAssignments.has(row.id)
                      return (
                        <View key={option.id} style={styles.serviceLinkRow}>
                          <Text style={styles.serviceLinkName} numberOfLines={1}>
                            {option.label}
                          </Text>
                          {assigned ? (
                            <>
                              <Text style={styles.serviceLinkedText}>Linked</Text>
                              {fromDocument ? null : (
                                <Button
                                  label="Unlink"
                                  size="sm"
                                  disabled={disabled}
                                  accessibilityLabel={`Unlink ${row.username} from ${option.label}`}
                                  onPress={() => {
                                    void toggleServiceAssignment(row.id, option.id)
                                  }}
                                />
                              )}
                            </>
                          ) : (
                            <Button
                              label={`Link to ${option.label}`}
                              size="sm"
                              variant="primary"
                              disabled={disabled}
                              accessibilityLabel={`Link ${row.username} to ${option.label}`}
                              onPress={() => {
                                void toggleServiceAssignment(row.id, option.id)
                              }}
                            />
                          )}
                        </View>
                      )
                    })}
                  </View>
                  {savingAssignments.has(row.id) ? (
                    <Text style={panelStyles.muted}>Saving assignments…</Text>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.serviceAssignRow}>
                <PrincipalAccessPanel
                  orgId={orgId}
                  projectId={projectId}
                  principalId={row.id}
                  username={row.appliedUsername}
                  access={row.access}
                  passwordAuth={row.passwordAuth}
                  canManage={canManage}
                  savingAccess={savingAccess.has(row.id)}
                  onChangeAccess={(next) => {
                    void changeAccess(row.id, next)
                  }}
                />
              </View>
              {canManage ? (
                <View style={styles.principalDeleteRow}>
                  <ConfirmButton
                    label="Delete"
                    prompt={`Delete ${row.username}?`}
                    confirmLabel="Delete"
                    size="sm"
                    busy={deleting.has(row.id)}
                    onConfirm={() => {
                      void handleDelete(row.id)
                    }}
                  />
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
      {canManage ? (
        <View style={styles.principalForm}>
          <View style={styles.principalFormField}>
            <TextField
              label="Add Hosting Account"
              value={username}
              onChangeText={setUsername}
              onBlur={() => setUsername((current) => current.trim())}
              placeholder={usernamePlaceholder(waitingForAccount, suggestedUsername)}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!adding}
            />
            <PrincipalNameSchemeField scheme={nameScheme} disabled={adding} />
          </View>
          <Button
            label="Add"
            busyLabel="Adding…"
            variant="primary"
            size="sm"
            busy={adding}
            accessibilityLabel="Add Hosting Account"
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
      title="Project Hosting Accounts"
      hint="The Linux accounts for this project. Assign a service so deploy ensures the account on the host — sites use that Hosting Account for document-root ownership (and Apache php-fpm run-as); storage chown follows the same pin. Assign at most one Hosting Account per site service."
    >
      {body}
    </SectionPanel>
  )
}

const ACCESS_SUMMARY_LABELS: Record<PrincipalAccessLevel, string> = {
  none: 'No access',
  sftp: 'Files only',
  shell: 'Shell',
}

/**
 * One scannable line for a collapsed principal row: access, credentials,
 * assignments. "No credentials" earns a place because a level with nothing to
 * present is the row an operator is usually hunting for.
 */
function principalRowSummary(row: ProjectPrincipalRecord): string {
  const parts: string[] = []
  parts.push(ACCESS_SUMMARY_LABELS[row.access])
  if (row.sshKeyCount > 0) {
    parts.push(row.sshKeyCount === 1 ? '1 key' : `${row.sshKeyCount} keys`)
  }
  if (row.passwordAuth) parts.push('password')
  if (row.access !== 'none' && row.sshKeyCount === 0 && !row.passwordAuth) {
    parts.push('no credentials')
  }
  if (row.serviceIds.length > 0) {
    parts.push(row.serviceIds.length === 1 ? '1 service' : `${row.serviceIds.length} services`)
  }
  return parts.join(' · ')
}

function projectTypeBadge(project: ProjectRecord) {
  const type = projectDisplayType(project)
  if (type === 'managed') {
    return <Badge label="managed" tone="ok" />
  }
  if (type === 'template') {
    return <Badge label="template" tone="muted" />
  }
  return null
}

/** Platform type (`system`) and templates are deliberately excluded. */
function isComposeProject(project: ProjectRecord): boolean {
  return project.kind == null || (project.kind === 'compose' && !isTemplateProject(project))
}

function workspaceLabel(ws: WorkspaceRecord): string {
  return ws.name?.trim() || ws.id
}

/** Platform type (`system`) is deliberately excluded. */
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
    return <Text style={panelStyles.pageTitle}>{displayTitle}</Text>
  }
  return (
    <TextInput
      style={[styles.titleInput, Platform.OS === 'web' ? projectTitleInputWebStyle : null]}
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
    return <Text style={panelStyles.pageCopy}>{project.description}</Text>
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
      {savingMeta ? <Text style={panelStyles.muted}>Saving…</Text> : null}
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
          <SettingRow
            label="Keep original container names"
            description="By default TurboPanel renames containers so you can run multiple instances of this project."
          >
            <Toggle
              value={keepOriginal}
              busy={saving}
              accessibilityLabel="Keep original container names"
              onValueChange={(next) => onChange(next ? 'custom' : 'uuid')}
            />
          </SettingRow>
          {keepOriginal ? (
            <View style={panelStyles.calloutWarning}>
              <Text style={panelStyles.calloutWarningText}>
                Keeping original names disables rolling updates. We rename containers by default so
                multiple instances of this project can run side by side.
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={panelStyles.detailLine}>
          {keepOriginal ? 'Keep original container names' : 'Rename containers (default)'}
        </Text>
      )}
      {saving ? <Text style={panelStyles.muted}>Saving…</Text> : null}
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
    <SectionPanel title="Workspace" hint="Move this project to another workspace">
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
        <Text style={panelStyles.detailLine}>{currentWorkspaceLabel}</Text>
      )}
      {savingWorkspace ? <Text style={panelStyles.muted}>Moving…</Text> : null}
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
      queryError = userErrorMessage(projectQuery.error, '')
    } else if (workspacesQuery.error instanceof Error) {
      queryError = userErrorMessage(workspacesQuery.error, '')
    }
    setError(queryError)
  }, [projectQuery.error, workspacesQuery.error])

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
    [workspaces]
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
    const result = await updateProjectMutation.run({ options, target: 'base' })
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
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

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
                projectName={project.name?.trim() || 'Unnamed project'}
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
  namingBlock: {
    gap: spacing.sm,
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
  principalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  principalHeaderText: {
    flex: 1,
    gap: 2,
  },
  principalSummary: {
    color: colors.textMuted,
    fontSize: 12,
  },
  serviceAssignRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  serviceChipRow: {
    gap: spacing.xs,
  },
  serviceLinkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serviceLinkName: {
    color: colors.textMuted,
    fontSize: 12,
  },
  serviceLinkedText: {
    color: colors.link,
    fontSize: 12,
    fontWeight: '600',
  },
  principalForm: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  principalFormField: {
    flex: 1,
  },
  principalDeleteRow: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
