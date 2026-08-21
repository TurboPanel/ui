import {
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import { ManagedBackupsPanel } from '@/components/org/managed/managed-backups-panel'
import { ManagedBindingsPanel } from '@/components/org/managed/managed-bindings-panel'
import { ManagedClusterPanel } from '@/components/org/managed/managed-cluster-panel'
import { ManagedConnectionPanel } from '@/components/org/managed/managed-connection-panel'
import { ManagedCredentialsPanel } from '@/components/org/managed/managed-credentials-panel'
import { ManagedLifecyclePanel } from '@/components/org/managed/managed-lifecycle-panel'
import { ManagedSettingsPanel } from '@/components/org/managed/managed-settings-panel'
import { ManagedStatusPanel } from '@/components/org/managed/managed-status-panel'
import { ManagedUsersPanel } from '@/components/org/managed/managed-users-panel'
import {
    defaultManagedVersionSelection,
    ManagedVersionPicker,
    type ManagedVersionSelection,
} from '@/components/org/managed/managed-version-picker'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { type EnvironmentRecord } from '@/lib/instance-api'
import { hasReadEligibleReplica } from '@/lib/managed-read-endpoint'
import { managedReleaseSummary } from '@/lib/managed-releases'
import {
    managedCatalogEntryForCode,
    managedEngineSupportsBackup,
    managedErrorMessage,
    type ManagedDetailResponse,
    type ManagedSettings,
    type ManagedUserRecord,
} from '@/lib/managed-services'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import {
    isTerminalCommandStatus,
    useCommandsBatch,
    type TrackedCommandEntry,
} from '@/lib/queries/commands'
import {
    useCreateEnvironment,
    useDeleteEnvironment,
    useEnvironment,
    useEnvironments,
    useUpdateEnvironment,
} from '@/lib/queries/environments'
import {
    alignMemberStatusesWithCluster,
    mergeManagedMembers,
    useApplyEnvironmentManaged,
    useCreateEnvironmentManaged,
    useCreateManagedBackup,
    useCreateManagedDatabase,
    useCreateManagedUser,
    useDeleteEnvironmentManaged,
    useDeleteManagedBackup,
    useDeleteManagedDatabase,
    useDeleteManagedUser,
    useEnvironmentManaged,
    useManagedBackups,
    useManagedDatabases,
    useManagedStatus,
    useManagedUsers,
    useRestoreManagedBackup,
    useRotateManagedRootPassword,
    useRotateManagedUserPassword,
    useRunManagedLifecycle,
    useUpdateEnvironmentManaged,
} from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { chrome, colors, spacing } from '@/lib/theme'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

/** Fire-and-forget without the `void` operator (typescript:S3735). */
function ignorePromise(promise: Promise<unknown>): void {
  promise.catch(() => {
    // Best-effort; callers surface errors via query/mutation state.
  })
}

function resolveManagedLastError(
  clusterStatus: string,
  statusError: string | null | undefined,
  metadata: Record<string, unknown>,
): string | null {
  if (clusterStatus !== 'failed') return null
  const fromStatus = typeof statusError === 'string' ? statusError.trim() : ''
  if (fromStatus) return fromStatus
  const fromMeta = typeof metadata.error === 'string' ? metadata.error.trim() : ''
  return fromMeta || null
}

type ManagedBodyFocus =
  | 'all'
  | 'overview'
  | 'connect'
  | 'data'
  | 'backups'
  | 'settings'
  | 'environments'

function managedFocusVisibility(focus: ManagedBodyFocus): {
  showOverview: boolean
  showConnect: boolean
  showData: boolean
  showBackups: boolean
  showSettings: boolean
  showLifecycle: boolean
} {
  return {
    showOverview: focus === 'all' || focus === 'overview',
    showConnect: focus === 'all' || focus === 'connect',
    showData: focus === 'all' || focus === 'data',
    showBackups: focus === 'all' || focus === 'backups',
    showSettings: focus === 'all' || focus === 'settings',
    showLifecycle: focus === 'all' || focus === 'environments' || focus === 'settings',
  }
}

function invalidateEnvironmentManagedQueries(
  queryClient: QueryClient,
  orgId: string,
  environmentId: string
): void {
  const managed = queryKeys.org(orgId).managed
  ignorePromise(
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: managed.environment(environmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: managed.status(environmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: managed.users(environmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: managed.databases(environmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: managed.backups(environmentId),
      }),
    ])
  )
}

function environmentLabel(env: EnvironmentRecord): string {
  return env.name?.trim() || 'Environment'
}

function EnvironmentTabs({
  environments,
  selectedId,
  onSelect,
}: Readonly<{
  environments: EnvironmentRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
}>) {
  if (environments.length <= 1) {
    return null
  }
  return (
    <SegmentedControl
      options={environments.map((env) => ({
        value: env.id,
        label: environmentLabel(env),
      }))}
      value={selectedId ?? ''}
      onChange={onSelect}
      accessibilityLabel="Environment"
    />
  )
}

function ManagedSetupPanel({
  orgId,
  environmentId,
  engineCode,
  canManage,
  onCreated,
}: Readonly<{
  orgId: string
  environmentId: string
  engineCode: string | null
  canManage: boolean
  onCreated: (rootPassword?: string) => void
}>) {
  const [serverId, setServerId] = useState<string | null>(null)
  const [expose, setExpose] = useState(false)
  const [version, setVersion] = useState<ManagedVersionSelection | null>(() =>
    defaultManagedVersionSelection(engineCode)
  )
  const [error, setError] = useState<string | null>(null)
  const submitGuard = useRef(false)

  const serversQuery = useOrgServers(orgId)
  const updateEnvironmentMutation = useUpdateEnvironment(orgId, environmentId)
  const createManagedMutation = useCreateEnvironmentManaged(orgId, environmentId)

  const servers = orEmptyArray(serversQuery.data?.servers)
  const loading = serversQuery.isLoading
  const submitting = updateEnvironmentMutation.isPending || createManagedMutation.isPending

  useEffect(() => {
    if (serverId || servers.length === 0) return
    const connected = servers.find((row) => row.connected)
    setServerId(connected?.id ?? null)
  }, [serverId, servers])

  // The engine code arrives with the project record, which may resolve after
  // mount — reseed the recommended version once it does.
  useEffect(() => {
    setVersion(defaultManagedVersionSelection(engineCode))
  }, [engineCode])

  const create = async () => {
    if (submitGuard.current || !serverId) return
    submitGuard.current = true
    setError(null)
    try {
      const pinResult = await updateEnvironmentMutation.run({ serverId })
      if (!pinResult.ok) {
        if (updateEnvironmentMutation.actionError) {
          setError(updateEnvironmentMutation.actionError)
        }
        return
      }
      const result = await createManagedMutation.run({
        ...(version ? { engineSeries: version.series, imageVariant: version.variantId } : {}),
        ...(expose ? { exposure: { enabled: true } } : {}),
      })
      if (!result.ok) {
        if (createManagedMutation.actionError) {
          setError(createManagedMutation.actionError)
        }
        return
      }
      onCreated(result.value.rootPassword)
    } finally {
      submitGuard.current = false
    }
  }

  return (
    <SectionPanel title="Set up" hint="Pin a server and create the managed service" accent>
      {loading ? <LoadingState label="Loading servers…" /> : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <View style={styles.serverList}>
        {servers.map((server) => {
          const selected = server.id === serverId
          const offline = !server.connected
          return (
            <Pressable
              key={server.id}
              style={[
                styles.serverCard,
                selected && styles.serverCardSelected,
                offline && styles.serverCardDisabled,
                webPointer,
              ]}
              disabled={offline || submitting}
              onPress={() => setServerId(server.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: offline || submitting }}
              accessibilityLabel={server.name?.trim() || server.hostname || server.id}
            >
              <Text style={styles.serverLabel}>
                {server.name?.trim() || server.hostname || server.id}
              </Text>
              {offline ? <Text style={styles.offlineHint}>Offline</Text> : null}
            </Pressable>
          )
        })}
      </View>

      <ManagedVersionPicker
        engine={engineCode}
        value={version}
        disabled={submitting}
        onChange={setVersion}
      />

      <Checkbox
        label="Expose externally"
        checked={expose}
        disabled={submitting}
        onPress={() => setExpose((current) => !current)}
      />

      {canManage ? (
        <Button
          label="Create service"
          busyLabel="Creating…"
          variant="primary"
          busy={submitting}
          disabled={submitting || !serverId}
          onPress={() => {
            ignorePromise(create())
          }}
        />
      ) : (
        <Text style={orgPanelStyles.muted}>You need manage permission to create this service.</Text>
      )}
    </SectionPanel>
  )
}

function isServerPlacementRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('server_placement_required')
}

export function ManagedEnvironmentBody({
  orgId,
  environmentId,
  engineCode,
  projectName,
  focus = 'all',
}: Readonly<{
  orgId: string
  environmentId: string
  engineCode: string | null
  projectName: string
  /** When set, only render panels for that project shell tab. */
  focus?: ManagedBodyFocus
}>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [revealPassword, setRevealPassword] = useState<string | null>(null)
  const catalog = engineCode ? managedCatalogEntryForCode(engineCode) : undefined

  // Show-once passwords stay in local state only; clear on dismiss and unmount.
  useEffect(() => {
    return () => {
      setRevealPassword(null)
    }
  }, [])

  const environmentQuery = useEnvironment(orgId, environmentId)
  const hasServerPin = Boolean(environmentQuery.data?.environment.serverId)
  const managedQuery = useEnvironmentManaged(orgId, environmentId, {
    enabled: hasServerPin,
  })
  const detail = managedQuery.data ?? null

  const queryError = environmentQuery.error ?? (hasServerPin ? managedQuery.error : null)

  useEffect(() => {
    if (!queryError) return
    if (isServerPlacementRequiredError(queryError)) {
      setError(null)
      return
    }
    setError(managedErrorMessage(queryError, 'Failed to load managed service'))
  }, [queryError])

  const loading = environmentQuery.isLoading || (hasServerPin && managedQuery.isLoading && !detail)

  if (loading && !detail && !revealPassword) {
    return <LoadingState label="Loading managed service…" />
  }

  if (error) {
    return <Text style={orgPanelStyles.error}>{error}</Text>
  }

  if (revealPassword) {
    return (
      <SectionPanel title="Root password" hint="Shown once" accent>
        <SecretReveal
          username={detail?.rootUsername ?? catalog?.rootUsername}
          password={revealPassword}
          onContinue={() => setRevealPassword(null)}
          continueLabel="Continue"
        />
      </SectionPanel>
    )
  }

  const managed = detail?.managed ?? null
  if (!hasServerPin || !detail || !managed) {
    return (
      <ManagedSetupPanel
        orgId={orgId}
        environmentId={environmentId}
        engineCode={engineCode}
        canManage={canManage}
        onCreated={(rootPassword) => {
          if (rootPassword) {
            setRevealPassword(rootPassword)
          }
          invalidateEnvironmentManagedQueries(queryClient, orgId, environmentId)
          ignorePromise(environmentQuery.refetch())
          ignorePromise(managedQuery.refetch())
        }}
      />
    )
  }

  return (
    <ManagedEnvironmentReadyPanels
      orgId={orgId}
      environmentId={environmentId}
      focus={focus}
      projectName={projectName}
      supportsBackup={managedEngineSupportsBackup(engineCode)}
      canManage={canManage}
      detail={{ ...detail, managed }}
    />
  )
}

function ManagedEnvironmentReadyPanels({
  orgId,
  environmentId,
  focus,
  projectName,
  supportsBackup,
  canManage,
  detail,
}: Readonly<{
  orgId: string
  environmentId: string
  focus: ManagedBodyFocus
  projectName: string
  supportsBackup: boolean
  canManage: boolean
  detail: ManagedDetailResponse & {
    managed: NonNullable<ManagedDetailResponse['managed']>
  }
}>) {
  const queryClient = useQueryClient()
  const [trackedEntries, setTrackedEntries] = useState<readonly TrackedCommandEntry[]>([])
  const { showOverview, showConnect, showData, showBackups, showSettings, showLifecycle } =
    managedFocusVisibility(focus)

  const managed = detail.managed
  const settings = detail.settings
  const statusQuery = useManagedStatus(orgId, environmentId)
  const usersQuery = useManagedUsers(orgId, environmentId)
  const databasesQuery = useManagedDatabases(orgId, environmentId)
  const backupsQuery = useManagedBackups(orgId, environmentId, {
    enabled: supportsBackup,
  })

  const rotatePasswordMutation = useRotateManagedRootPassword(orgId, environmentId)
  const rotateUserPasswordMutation = useRotateManagedUserPassword(orgId, environmentId)
  const createDatabaseMutation = useCreateManagedDatabase(orgId, environmentId)
  const deleteDatabaseMutation = useDeleteManagedDatabase(orgId, environmentId)
  const createUserMutation = useCreateManagedUser(orgId, environmentId)
  const deleteUserMutation = useDeleteManagedUser(orgId, environmentId)
  const createBackupMutation = useCreateManagedBackup(orgId, environmentId)
  const deleteBackupMutation = useDeleteManagedBackup(orgId, environmentId)
  const restoreBackupMutation = useRestoreManagedBackup(orgId, environmentId)
  const lifecycleMutation = useRunManagedLifecycle(orgId, environmentId)
  const applyManagedMutation = useApplyEnvironmentManaged(orgId, environmentId)
  const deleteManagedMutation = useDeleteEnvironmentManaged(orgId, environmentId)
  const updateManagedMutation = useUpdateEnvironmentManaged(orgId, environmentId)
  const managedQuery = useEnvironmentManaged(orgId, environmentId)

  const status = statusQuery.data ?? null
  const clusterStatus = status?.status ?? managed.status
  const lastError = resolveManagedLastError(
    clusterStatus,
    status?.error,
    managed.metadata ?? {},
  )
  const users = usersQuery.data?.users ?? []
  const databases = databasesQuery.data?.databases ?? []
  const backups = backupsQuery.data?.backups ?? []
  const members = alignMemberStatusesWithCluster(
    mergeManagedMembers(detail.members ?? [], status?.members ?? []),
    status?.status ?? managed.status
  )
  const serverId = managed.serverId ?? detail.server?.id ?? null
  const commandsQuery = useCommandsBatch(orgId, trackedEntries)

  const invalidateManagedData = useCallback(() => {
    invalidateEnvironmentManagedQueries(queryClient, orgId, environmentId)
  }, [queryClient, orgId, environmentId])

  const registerCommand = (commandId: string, _label: string, commandServerId?: string) => {
    const resolvedServerId = commandServerId ?? serverId
    if (!resolvedServerId) return
    setTrackedEntries((current) => [...current, { serverId: resolvedServerId, commandId }])
  }

  useEffect(() => {
    if (!commandsQuery.data) return
    for (const [index, record] of commandsQuery.data.entries()) {
      const entry = trackedEntries[index]
      if (!entry || !isTerminalCommandStatus(record.status)) continue
      if (record.status === 'succeeded') {
        invalidateManagedData()
      }
      setTrackedEntries((current) => current.filter((row) => row.commandId !== entry.commandId))
    }
  }, [commandsQuery.data, trackedEntries, invalidateManagedData])

  const inFlight =
    trackedEntries.length > 0 &&
    (commandsQuery.data?.some((record) => !isTerminalCommandStatus(record.status)) ?? true)


  return (
    <View style={styles.panels}>
      {showOverview ? (
        <ManagedClusterPanel
          orgId={orgId}
          environmentId={environmentId}
          members={members}
          managedDisplayName={managed.name?.trim() || projectName}
          canManage={canManage}
          busy={inFlight}
          recovery={detail.recovery}
          lastError={lastError}
          onRegisterCommand={registerCommand}
        />
      ) : null}
      {showConnect ? (
        <>
          <ManagedConnectionPanel
            orgId={orgId}
            managed={managed}
            connection={detail.connection}
            endpoints={detail.endpoints}
            server={detail.server}
            members={members}
            users={users}
            ssl={detail.ssl}
          />
          <ManagedBindingsPanel
            orgId={orgId}
            environmentId={environmentId}
            engine={managed.engine}
            users={users}
            databases={databases}
            canManage={canManage}
            busy={inFlight}
          />
        </>
      ) : null}
      {showData ? (
        <ManagedDataPanels
          orgId={orgId}
          environmentId={environmentId}
          rootUsername={detail.rootUsername}
          databases={databases}
          users={users}
          canManage={canManage}
          inFlight={inFlight}
          hasReadTargets={hasReadEligibleReplica(members)}
          rotatePasswordMutation={rotatePasswordMutation}
          rotateUserPasswordMutation={rotateUserPasswordMutation}
          createDatabaseMutation={createDatabaseMutation}
          deleteDatabaseMutation={deleteDatabaseMutation}
          createUserMutation={createUserMutation}
          deleteUserMutation={deleteUserMutation}
          usersQuery={usersQuery}
          databasesQuery={databasesQuery}
          registerCommand={registerCommand}
        />
      ) : null}
      {showBackups ? (
        <ManagedBackupsPanel
          backups={backups}
          supported={supportsBackup}
          managedDisplayName={managed.name?.trim() || projectName}
          canManage={canManage}
          busy={inFlight}
          onBackupNow={async () => {
            const result = await createBackupMutation.mutateAsync(undefined)
            registerCommand(result.commandId, 'Back up now')
          }}
          onDelete={async (backupId) => {
            const result = await deleteBackupMutation.run(backupId)
            if (!result.ok) {
              throw new Error(deleteBackupMutation.actionError ?? 'Failed to delete backup')
            }
            registerCommand(result.value.commandId, 'Delete backup')
          }}
          onRestore={async (backupId) => {
            const result = await restoreBackupMutation.run(backupId)
            if (!result.ok) {
              throw new Error(restoreBackupMutation.actionError ?? 'Failed to restore backup')
            }
            registerCommand(result.value.commandId, 'Restore backup')
          }}
        />
      ) : null}
      {showLifecycle ? (
        <ManagedLifecyclePanel
          status={managed.status}
          projectName={projectName}
          canManage={canManage}
          busy={inFlight}
          onLifecycle={async (action) => {
            const result = await lifecycleMutation.run(action)
            if (!result.ok) {
              throw new Error(lifecycleMutation.actionError ?? 'Lifecycle action failed')
            }
            registerCommand(result.value.commandId, action)
          }}
          onApply={async () => {
            const result = await applyManagedMutation.mutateAsync()
            registerCommand(result.commandId, 'Apply')
          }}
          onDelete={async () => {
            const result = await deleteManagedMutation.mutateAsync()
            if (result.deleted) {
              invalidateManagedData()
              ignorePromise(managedQuery.refetch())
              return
            }
            if (result.commandId && result.serverId) {
              registerCommand(result.commandId, 'Delete', result.serverId)
            }
          }}
        />
      ) : null}
      {showSettings && settings ? (
        <ManagedSettingsPanel
          settings={settings}
          engineCode={managed.engine}
          organizationSslMode={detail.ssl?.organizationDefault ?? null}
          canManage={canManage}
          busy={inFlight}
          onApply={async (next: ManagedSettings) => {
            const updateResult = await updateManagedMutation.run({
              settings: next,
            })
            if (!updateResult.ok) {
              throw new Error(updateManagedMutation.actionError ?? 'Failed to save settings')
            }
            const applyResult = await applyManagedMutation.mutateAsync()
            registerCommand(applyResult.commandId, 'Apply settings')
            invalidateManagedData()
          }}
        />
      ) : null}
      {showOverview || showSettings ? (
        <ManagedStatusPanel
          orgId={orgId}
          environmentId={environmentId}
          status={status?.status ?? managed.status}
          host={status?.host ?? managed.host}
          port={status?.port ?? managed.port}
          containers={status?.containers ?? []}
          lastError={lastError}
          version={managedReleaseSummary(
            managed.engine ? managedCatalogEntryForCode(managed.engine)?.label : null,
            detail.release
          )}
        />
      ) : null}
    </View>
  )
}

function ManagedDataPanels({
  orgId,
  environmentId,
  rootUsername,
  databases,
  users,
  canManage,
  inFlight,
  hasReadTargets,
  rotatePasswordMutation,
  rotateUserPasswordMutation,
  createDatabaseMutation,
  deleteDatabaseMutation,
  createUserMutation,
  deleteUserMutation,
  usersQuery,
  databasesQuery,
  registerCommand,
}: Readonly<{
  orgId: string
  environmentId: string
  rootUsername: string | null
  databases: string[]
  users: ManagedUserRecord[]
  canManage: boolean
  inFlight: boolean
  hasReadTargets: boolean
  rotatePasswordMutation: ReturnType<typeof useRotateManagedRootPassword>
  rotateUserPasswordMutation: ReturnType<typeof useRotateManagedUserPassword>
  createDatabaseMutation: ReturnType<typeof useCreateManagedDatabase>
  deleteDatabaseMutation: ReturnType<typeof useDeleteManagedDatabase>
  createUserMutation: ReturnType<typeof useCreateManagedUser>
  deleteUserMutation: ReturnType<typeof useDeleteManagedUser>
  usersQuery: ReturnType<typeof useManagedUsers>
  databasesQuery: ReturnType<typeof useManagedDatabases>
  registerCommand: (commandId: string, label: string, commandServerId?: string) => void
}>) {
  return (
    <>
      <ManagedCredentialsPanel
        orgId={orgId}
        rootUsername={rootUsername}
        canManage={canManage}
        busy={inFlight}
        onRotate={async () => {
          const result = await rotatePasswordMutation.mutateAsync()
          registerCommand(result.commandId, 'Rotate root password')
          return {
            rootPassword: result.rootPassword,
            redeployRequired: result.redeployRequired,
          }
        }}
        onRedeployService={async (serviceEnvironmentId) => {
          const { deployEnvironment } = await import('@/lib/instance-api')
          const result = await deployEnvironment(serviceEnvironmentId)
          registerCommand(result.commandId, 'Redeploy service', result.serverId)
        }}
      />
      <ManagedUsersPanel
        orgId={orgId}
        environmentId={environmentId}
        databases={databases}
        users={users}
        canManage={canManage}
        busy={inFlight}
        hasReadTargets={hasReadTargets}
        onCreateDatabase={async (name) => {
          const result = await createDatabaseMutation.run({ name })
          if (!result.ok) {
            throw new Error(createDatabaseMutation.actionError ?? 'Failed to create database')
          }
          registerCommand(result.value.commandId, 'Create database')
        }}
        onDeleteDatabase={async (name) => {
          const result = await deleteDatabaseMutation.run(name)
          if (!result.ok) {
            throw new Error(deleteDatabaseMutation.actionError ?? 'Failed to delete database')
          }
          registerCommand(result.value.commandId, 'Delete database')
        }}
        onCreateUser={async (input) => {
          const result = await createUserMutation.run(input)
          if (!result.ok) {
            throw new Error(createUserMutation.actionError ?? 'Failed to create user')
          }
          registerCommand(result.value.commandId, 'Create user')
          return { password: result.value.password }
        }}
        onDeleteUser={async (principalId) => {
          const result = await deleteUserMutation.run(principalId)
          if (!result.ok) {
            throw new Error(deleteUserMutation.actionError ?? 'Failed to delete user')
          }
          registerCommand(result.value.commandId, 'Delete user')
        }}
        onRotateUserPassword={async (principalId) => {
          const result = await rotateUserPasswordMutation.mutateAsync(principalId)
          registerCommand(result.commandId, 'Rotate user password')
          return {
            password: result.password,
            redeployRequired: result.redeployRequired,
          }
        }}
        onRedeployService={async (serviceEnvironmentId) => {
          const { deployEnvironment } = await import('@/lib/instance-api')
          const result = await deployEnvironment(serviceEnvironmentId)
          registerCommand(result.commandId, 'Redeploy service', result.serverId)
        }}
        onReload={async () => {
          await Promise.all([usersQuery.refetch(), databasesQuery.refetch()])
        }}
      />
    </>
  )
}

function resolveSelectedEnvironmentId(
  previous: string | null,
  envs: EnvironmentRecord[]
): string | null {
  if (previous && envs.some((env) => env.id === previous)) {
    return previous
  }
  return envs[0]?.id ?? null
}

function EnvironmentToolbarActions({
  canOwn,
  showDelete,
  deleting,
  onRename,
  onNewEnvironment,
  onDeleteConfirm,
}: Readonly<{
  canOwn: boolean
  showDelete: boolean
  deleting: boolean
  onRename: () => void
  onNewEnvironment: () => void
  onDeleteConfirm: () => void
}>) {
  if (!canOwn) {
    return null
  }
  return (
    <ButtonRow>
      <Button label="Rename" size="sm" onPress={onRename} />
      <Button label="New environment" size="sm" onPress={onNewEnvironment} />
      {showDelete ? (
        <ConfirmButton
          label="Delete"
          confirmLabel={deleting ? 'Deleting…' : 'Confirm delete'}
          prompt="Delete this environment?"
          busy={deleting}
          onConfirm={onDeleteConfirm}
        />
      ) : null}
    </ButtonRow>
  )
}

function RenameEnvironmentForm({
  value,
  onChange,
  saving,
  onSave,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  saving: boolean
  onSave: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <TextField
        label="Environment name"
        value={value}
        onChangeText={onChange}
        editable={!saving}
      />
      <Button label="Save" variant="primary" busy={saving} onPress={onSave} />
    </View>
  )
}

function CreateEnvironmentForm({
  value,
  onChange,
  creating,
  onCreate,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  creating: boolean
  onCreate: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <TextField
        label="Environment name"
        value={value}
        onChangeText={onChange}
        placeholder="Environment name"
        editable={!creating}
      />
      <Button
        label="Create"
        busyLabel="Creating…"
        variant="primary"
        busy={creating}
        onPress={onCreate}
      />
    </View>
  )
}

function ActiveEnvironmentPanel({
  orgId,
  projectId,
  engineCode,
  projectName,
  environments,
  activeEnvironment,
  selectedId,
  canOwn,
  onSelect,
  onError,
}: Readonly<{
  orgId: string
  projectId: string
  engineCode: string | null
  projectName: string
  environments: EnvironmentRecord[]
  activeEnvironment: EnvironmentRecord
  selectedId: string | null
  canOwn: boolean
  onSelect: (id: string | null) => void
  onError: (error: string | null) => void
}>) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')

  const updateEnvironmentMutation = useUpdateEnvironment(orgId, activeEnvironment.id)
  const createEnvironmentMutation = useCreateEnvironment(orgId)
  const deleteEnvironmentMutation = useDeleteEnvironment(orgId)

  const saveRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      onError('Name is required.')
      return
    }
    onError(null)
    const result = await updateEnvironmentMutation.run({ name: trimmed })
    if (!result.ok) {
      if (updateEnvironmentMutation.actionError) {
        onError(updateEnvironmentMutation.actionError)
      }
      return
    }
    setRenaming(false)
  }

  const submitCreate = async () => {
    const trimmed = createName.trim()
    if (!trimmed) {
      onError('Name is required.')
      return
    }
    onError(null)
    const result = await createEnvironmentMutation.run({
      projectId,
      name: trimmed,
    })
    if (!result.ok) {
      if (createEnvironmentMutation.actionError) {
        onError(createEnvironmentMutation.actionError)
      }
      return
    }
    onSelect(result.value.id)
    setCreateName('')
    setShowCreate(false)
  }

  const deleteActive = async () => {
    onError(null)
    const result = await deleteEnvironmentMutation.run(activeEnvironment.id)
    if (!result.ok) {
      if (deleteEnvironmentMutation.actionError) {
        onError(deleteEnvironmentMutation.actionError)
      }
    }
  }

  const renameSaving = updateEnvironmentMutation.isPending
  const creating = createEnvironmentMutation.isPending
  const deleting = deleteEnvironmentMutation.isPending

  return (
    <>
      <EnvironmentTabs
        environments={environments}
        selectedId={selectedId}
        onSelect={(id) => {
          onSelect(id)
          setRenaming(false)
          setShowCreate(false)
        }}
      />

      <View style={styles.toolbar}>
        <Text style={styles.activeName}>{environmentLabel(activeEnvironment)}</Text>
        <EnvironmentToolbarActions
          key={activeEnvironment.id}
          canOwn={canOwn}
          showDelete={environments.length > 1}
          deleting={deleting}
          onRename={() => {
            setRenameValue(activeEnvironment.name?.trim() ?? '')
            setRenaming(true)
            setShowCreate(false)
          }}
          onNewEnvironment={() => {
            setShowCreate(true)
          }}
          onDeleteConfirm={() => {
            ignorePromise(deleteActive())
          }}
        />
      </View>

      {renaming ? (
        <RenameEnvironmentForm
          value={renameValue}
          onChange={setRenameValue}
          saving={renameSaving}
          onSave={() => {
            ignorePromise(saveRename())
          }}
        />
      ) : null}

      {showCreate && canOwn ? (
        <CreateEnvironmentForm
          value={createName}
          onChange={setCreateName}
          creating={creating}
          onCreate={() => {
            ignorePromise(submitCreate())
          }}
        />
      ) : null}

      <ManagedEnvironmentBody
        key={activeEnvironment.id}
        orgId={orgId}
        environmentId={activeEnvironment.id}
        engineCode={engineCode}
        projectName={projectName}
      />
    </>
  )
}

export function ManagedProjectSection({
  orgId,
  projectId,
  engineCode,
  projectName,
}: Readonly<{
  orgId: string
  projectId: string
  engineCode: string | null
  projectName: string
}>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const { defaultEnvironmentName, isLoading: defaultNameLoading } =
    useOrgDefaultEnvironmentName(orgId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const provisionAttemptedFor = useRef<string | null>(null)

  const environmentsQuery = useEnvironments(orgId, projectId, {
    enabled: !defaultNameLoading,
  })
  const createEnvironmentMutation = useCreateEnvironment(orgId)

  const environments = orEmptyArray(environmentsQuery.data?.environments)

  useEffect(() => {
    if (defaultNameLoading || environmentsQuery.isLoading) return
    if (
      environments.length === 0 &&
      canOwn &&
      provisionAttemptedFor.current !== projectId &&
      !createEnvironmentMutation.isPending
    ) {
      provisionAttemptedFor.current = projectId
      ignorePromise(
        createEnvironmentMutation
          .run({ projectId, name: defaultEnvironmentName })
          .then((result) => {
            if (!result.ok && createEnvironmentMutation.actionError) {
              setError(createEnvironmentMutation.actionError)
            }
          })
      )
    }
  }, [
    canOwn,
    createEnvironmentMutation,
    defaultEnvironmentName,
    defaultNameLoading,
    environments.length,
    environmentsQuery.isLoading,
    projectId,
  ])

  useEffect(() => {
    setSelectedId((previous) => resolveSelectedEnvironmentId(previous, environments))
  }, [environments])

  useEffect(() => {
    if (environmentsQuery.error) {
      setError(
        environmentsQuery.error instanceof Error
          ? environmentsQuery.error.message
          : 'Failed to load environments'
      )
    }
  }, [environmentsQuery.error])

  const activeEnvironment = environments.find((env) => env.id === selectedId) ?? null

  const loading =
    defaultNameLoading ||
    ((environmentsQuery.isLoading || createEnvironmentMutation.isPending) &&
      environments.length === 0)

  if (loading && environments.length === 0) {
    return <LoadingState label="Loading environments…" />
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Managed service</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {!activeEnvironment ? (
        <EmptyState title="No environments yet." />
      ) : (
        <ActiveEnvironmentPanel
          orgId={orgId}
          projectId={projectId}
          engineCode={engineCode}
          projectName={projectName}
          environments={environments}
          activeEnvironment={activeEnvironment}
          selectedId={selectedId}
          canOwn={canOwn}
          onSelect={setSelectedId}
          onError={setError}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  panels: {
    gap: spacing.lg,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activeName: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '600',
  },
  inlineForm: {
    gap: spacing.sm,
  },
  serverList: {
    gap: spacing.sm,
  },
  serverCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  serverCardSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  serverCardDisabled: {
    opacity: 0.55,
  },
  serverLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  offlineHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
})
