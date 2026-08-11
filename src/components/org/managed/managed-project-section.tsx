import { useEffect, useRef, useState } from 'react'
import {
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ManagedBackupsPanel } from '@/components/org/managed/managed-backups-panel'
import { ManagedBindingsPanel } from '@/components/org/managed/managed-bindings-panel'
import { ManagedClusterPanel } from '@/components/org/managed/managed-cluster-panel'
import { ManagedConnectionPanel } from '@/components/org/managed/managed-connection-panel'
import { ManagedCredentialsPanel } from '@/components/org/managed/managed-credentials-panel'
import { ManagedLifecyclePanel } from '@/components/org/managed/managed-lifecycle-panel'
import { ManagedSettingsPanel } from '@/components/org/managed/managed-settings-panel'
import { ManagedStatusPanel } from '@/components/org/managed/managed-status-panel'
import { ManagedUsersPanel } from '@/components/org/managed/managed-users-panel'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  type EnvironmentRecord,
} from '@/lib/instance-api'
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
  alignMemberStatusesWithCluster,
  mergeManagedMembers,
} from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import { queryKeys } from '@/lib/query-keys'
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

/** Fire-and-forget without the `void` operator (typescript:S3735). */
function ignorePromise(promise: Promise<unknown>): void {
  promise.catch(() => {
    // Best-effort; callers surface errors via query/mutation state.
  })
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
    showLifecycle:
      focus === 'all' || focus === 'environments' || focus === 'settings',
  }
}

function invalidateEnvironmentManagedQueries(
  queryClient: QueryClient,
  orgId: string,
  environmentId: string,
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
    ]),
  )
}

function environmentLabel(env: EnvironmentRecord): string {
  return env.displayName?.trim() || 'Environment'
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
    <View style={styles.tabBar}>
      {environments.map((env) => {
        const active = env.id === selectedId
        return (
          <Pressable
            key={env.id}
            style={[styles.tab, active && styles.tabActive, webPointer]}
            onPress={() => onSelect(env.id)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {environmentLabel(env)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ManagedSetupPanel({
  orgId,
  environmentId,
  engineCode: _engineCode,
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
  const [error, setError] = useState<string | null>(null)
  const submitGuard = useRef(false)

  const serversQuery = useOrgServers(orgId)
  const updateEnvironmentMutation = useUpdateEnvironment(orgId, environmentId)
  const createManagedMutation = useCreateEnvironmentManaged(orgId, environmentId)

  const servers = serversQuery.data?.servers ?? []
  const loading = serversQuery.isLoading
  const submitting =
    updateEnvironmentMutation.isPending || createManagedMutation.isPending

  useEffect(() => {
    if (serverId || servers.length === 0) return
    const connected = servers.find((row) => row.connected)
    setServerId(connected?.id ?? null)
  }, [serverId, servers])

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
      const result = await createManagedMutation.run(
        expose
          ? {
              exposure: {
                enabled: true,
              },
            }
          : undefined,
      )
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
      {loading ? <Text style={orgPanelStyles.muted}>Loading servers…</Text> : null}
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
            >
              <Text style={styles.serverLabel}>
                {server.displayName?.trim() || server.hostname || server.id}
              </Text>
              {offline ? (
                <Text style={styles.offlineHint}>Offline</Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      <Pressable
        style={[styles.toggleRow, webPointer]}
        onPress={() => setExpose((current) => !current)}
        disabled={submitting}
      >
        <View style={[styles.checkbox, expose && styles.checkboxChecked]}>
          {expose ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.toggleLabel}>Expose externally</Text>
      </Pressable>

      {canManage ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            (submitting || !serverId) && styles.disabled,
          ]}
          disabled={submitting || !serverId}
          onPress={() => {
            ignorePromise(create())
          }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            {submitting ? 'Creating…' : 'Create service'}
          </Text>
        </Pressable>
      ) : (
        <Text style={orgPanelStyles.muted}>
          You need manage permission to create this service.
        </Text>
      )}
    </SectionPanel>
  )
}

function isServerPlacementRequiredError(err: unknown): boolean {
  return (
    err instanceof Error && err.message.includes('server_placement_required')
  )
}

export function ManagedEnvironmentBody({
  orgId,
  environmentId,
  engineCode,
  projectDisplayName,
  focus = 'all',
}: Readonly<{
  orgId: string
  environmentId: string
  engineCode: string | null
  projectDisplayName: string
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

  const queryError =
    environmentQuery.error ?? (hasServerPin ? managedQuery.error : null)

  useEffect(() => {
    if (!queryError) return
    if (isServerPlacementRequiredError(queryError)) {
      setError(null)
      return
    }
    setError(managedErrorMessage(queryError, 'Failed to load managed service'))
  }, [queryError])

  const loading =
    environmentQuery.isLoading ||
    (hasServerPin && managedQuery.isLoading && !detail)

  if (loading && !detail && !revealPassword) {
    return <Text style={orgPanelStyles.muted}>Loading managed service…</Text>
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
          invalidateEnvironmentManagedQueries(
            queryClient,
            orgId,
            environmentId,
          )
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
      projectDisplayName={projectDisplayName}
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
  projectDisplayName,
  supportsBackup,
  canManage,
  detail,
}: Readonly<{
  orgId: string
  environmentId: string
  focus: ManagedBodyFocus
  projectDisplayName: string
  supportsBackup: boolean
  canManage: boolean
  detail: ManagedDetailResponse & {
    managed: NonNullable<ManagedDetailResponse['managed']>
  }
}>) {
  const queryClient = useQueryClient()
  const [trackedEntries, setTrackedEntries] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const {
    showOverview,
    showConnect,
    showData,
    showBackups,
    showSettings,
    showLifecycle,
  } = managedFocusVisibility(focus)

  const managed = detail.managed
  const settings = detail.settings
  const statusQuery = useManagedStatus(orgId, environmentId)
  const usersQuery = useManagedUsers(orgId, environmentId)
  const databasesQuery = useManagedDatabases(orgId, environmentId)
  const backupsQuery = useManagedBackups(orgId, environmentId, {
    enabled: supportsBackup,
  })

  const rotatePasswordMutation = useRotateManagedRootPassword(orgId, environmentId)
  const rotateUserPasswordMutation = useRotateManagedUserPassword(
    orgId,
    environmentId,
  )
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
  const users = usersQuery.data?.users ?? []
  const databases = databasesQuery.data?.databases ?? []
  const backups = backupsQuery.data?.backups ?? []
  const members = alignMemberStatusesWithCluster(
    mergeManagedMembers(detail.members ?? [], status?.members ?? []),
    status?.status ?? managed.status,
  )
  const serverId = managed.serverId ?? detail.server?.id ?? null
  const commandsQuery = useCommandsBatch(orgId, trackedEntries)

  const invalidateManagedData = () => {
    invalidateEnvironmentManagedQueries(queryClient, orgId, environmentId)
  }

  const registerCommand = (
    commandId: string,
    _label: string,
    commandServerId?: string,
  ) => {
    const resolvedServerId = commandServerId ?? serverId
    if (!resolvedServerId) return
    setTrackedEntries((current) => [
      ...current,
      { serverId: resolvedServerId, commandId },
    ])
  }

  useEffect(() => {
    if (!commandsQuery.data) return
    for (const [index, record] of commandsQuery.data.entries()) {
      const entry = trackedEntries[index]
      if (!entry || !isTerminalCommandStatus(record.status)) continue
      if (record.status === 'succeeded') {
        invalidateManagedData()
      }
      setTrackedEntries((current) =>
        current.filter((row) => row.commandId !== entry.commandId),
      )
    }
  }, [commandsQuery.data, trackedEntries, environmentId, orgId, queryClient])

  const inFlight =
    trackedEntries.length > 0 &&
    (commandsQuery.data?.some(
      (record) => !isTerminalCommandStatus(record.status),
    ) ??
      true)

  return (
    <View style={styles.panels}>
      {showOverview ? (
        <ManagedClusterPanel
          orgId={orgId}
          environmentId={environmentId}
          members={members}
          managedDisplayName={managed.displayName?.trim() || projectDisplayName}
          canManage={canManage}
          busy={inFlight}
          onRegisterCommand={registerCommand}
        />
      ) : null}
      {showConnect ? (
        <>
          <ManagedConnectionPanel
            managed={managed}
            connection={detail.connection}
            server={detail.server}
            members={members}
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
          managedDisplayName={managed.displayName?.trim() || projectDisplayName}
          canManage={canManage}
          busy={inFlight}
          onBackupNow={async () => {
            const result = await createBackupMutation.mutateAsync(undefined)
            registerCommand(result.commandId, 'Back up now')
          }}
          onDelete={async (backupId) => {
            const result = await deleteBackupMutation.run(backupId)
            if (!result.ok) {
              throw new Error(
                deleteBackupMutation.actionError ?? 'Failed to delete backup',
              )
            }
            registerCommand(result.value.commandId, 'Delete backup')
          }}
          onRestore={async (backupId) => {
            const result = await restoreBackupMutation.run(backupId)
            if (!result.ok) {
              throw new Error(
                restoreBackupMutation.actionError ?? 'Failed to restore backup',
              )
            }
            registerCommand(result.value.commandId, 'Restore backup')
          }}
        />
      ) : null}
      {showLifecycle ? (
        <ManagedLifecyclePanel
          status={managed.status}
          projectDisplayName={projectDisplayName}
          canManage={canManage}
          busy={inFlight}
          onLifecycle={async (action) => {
            const result = await lifecycleMutation.run(action)
            if (!result.ok) {
              throw new Error(
                lifecycleMutation.actionError ?? 'Lifecycle action failed',
              )
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
          canManage={canManage}
          busy={inFlight}
          onApply={async (next: ManagedSettings) => {
            const updateResult = await updateManagedMutation.run({
              settings: next,
            })
            if (!updateResult.ok) {
              throw new Error(
                updateManagedMutation.actionError ?? 'Failed to save settings',
              )
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
  rotatePasswordMutation: ReturnType<typeof useRotateManagedRootPassword>
  rotateUserPasswordMutation: ReturnType<typeof useRotateManagedUserPassword>
  createDatabaseMutation: ReturnType<typeof useCreateManagedDatabase>
  deleteDatabaseMutation: ReturnType<typeof useDeleteManagedDatabase>
  createUserMutation: ReturnType<typeof useCreateManagedUser>
  deleteUserMutation: ReturnType<typeof useDeleteManagedUser>
  usersQuery: ReturnType<typeof useManagedUsers>
  databasesQuery: ReturnType<typeof useManagedDatabases>
  registerCommand: (
    commandId: string,
    label: string,
    commandServerId?: string,
  ) => void
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
        onCreateDatabase={async (name) => {
          const result = await createDatabaseMutation.run({ name })
          if (!result.ok) {
            throw new Error(
              createDatabaseMutation.actionError ??
                'Failed to create database',
            )
          }
          registerCommand(result.value.commandId, 'Create database')
        }}
        onDeleteDatabase={async (name) => {
          const result = await deleteDatabaseMutation.run(name)
          if (!result.ok) {
            throw new Error(
              deleteDatabaseMutation.actionError ??
                'Failed to delete database',
            )
          }
          registerCommand(result.value.commandId, 'Delete database')
        }}
        onCreateUser={async (input) => {
          const result = await createUserMutation.run(input)
          if (!result.ok) {
            throw new Error(
              createUserMutation.actionError ?? 'Failed to create user',
            )
          }
          registerCommand(result.value.commandId, 'Create user')
          return { password: result.value.password }
        }}
        onDeleteUser={async (principalId) => {
          const result = await deleteUserMutation.run(principalId)
          if (!result.ok) {
            throw new Error(
              deleteUserMutation.actionError ?? 'Failed to delete user',
            )
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
  envs: EnvironmentRecord[],
): string | null {
  if (previous && envs.some((env) => env.id === previous)) {
    return previous
  }
  return envs[0]?.id ?? null
}

function deleteButtonLabel(deleteArmed: boolean, deleting: boolean): string {
  if (!deleteArmed) {
    return 'Delete'
  }
  return deleting ? 'Deleting…' : 'Confirm delete'
}

function EnvironmentToolbarActions({
  canOwn,
  showDelete,
  deleteArmed,
  deleting,
  onRename,
  onNewEnvironment,
  onDeletePress,
}: Readonly<{
  canOwn: boolean
  showDelete: boolean
  deleteArmed: boolean
  deleting: boolean
  onRename: () => void
  onNewEnvironment: () => void
  onDeletePress: () => void
}>) {
  if (!canOwn) {
    return null
  }
  return (
    <View style={styles.toolbarActions}>
      <Pressable
        style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
        onPress={onRename}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Rename</Text>
      </Pressable>
      <Pressable
        style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
        onPress={onNewEnvironment}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
          New environment
        </Text>
      </Pressable>
      {showDelete ? (
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={deleting}
          onPress={onDeletePress}
        >
          <Text
            style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}
          >
            {deleteButtonLabel(deleteArmed, deleting)}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
      <TextInput
        style={Platform.OS === 'web' ? webInputStyle : styles.input}
        value={value}
        onChangeText={onChange}
        editable={!saving}
      />
      <Pressable
        style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
        onPress={onSave}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
      </Pressable>
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
      <TextInput
        style={Platform.OS === 'web' ? webInputStyle : styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Environment name"
        placeholderTextColor={colors.textDim}
        editable={!creating}
      />
      <Pressable
        style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
        onPress={onCreate}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
          {creating ? 'Creating…' : 'Create'}
        </Text>
      </Pressable>
    </View>
  )
}

function ActiveEnvironmentPanel({
  orgId,
  projectId,
  engineCode,
  projectDisplayName,
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
  projectDisplayName: string
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
  const [deleteArmed, setDeleteArmed] = useState(false)

  const updateEnvironmentMutation = useUpdateEnvironment(
    orgId,
    activeEnvironment.id,
  )
  const createEnvironmentMutation = useCreateEnvironment(orgId)
  const deleteEnvironmentMutation = useDeleteEnvironment(orgId)

  const saveRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      onError('Name is required.')
      return
    }
    onError(null)
    const result = await updateEnvironmentMutation.run({ displayName: trimmed })
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
      displayName: trimmed,
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
      return
    }
    setDeleteArmed(false)
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
          setDeleteArmed(false)
        }}
      />

      <View style={styles.toolbar}>
        <Text style={styles.activeName}>
          {environmentLabel(activeEnvironment)}
        </Text>
        <EnvironmentToolbarActions
          canOwn={canOwn}
          showDelete={environments.length > 1}
          deleteArmed={deleteArmed}
          deleting={deleting}
          onRename={() => {
            setRenameValue(activeEnvironment.displayName?.trim() ?? '')
            setRenaming(true)
            setShowCreate(false)
          }}
          onNewEnvironment={() => {
            setShowCreate(true)
            setDeleteArmed(false)
          }}
          onDeletePress={() => {
            if (deleteArmed) {
              ignorePromise(deleteActive())
              return
            }
            setDeleteArmed(true)
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
        projectDisplayName={projectDisplayName}
      />
    </>
  )
}

export function ManagedProjectSection({
  orgId,
  projectId,
  engineCode,
  projectDisplayName,
}: Readonly<{
  orgId: string
  projectId: string
  engineCode: string | null
  projectDisplayName: string
}>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const {
    defaultEnvironmentName,
    isLoading: defaultNameLoading,
  } = useOrgDefaultEnvironmentName(orgId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const provisionAttemptedFor = useRef<string | null>(null)

  const environmentsQuery = useEnvironments(orgId, projectId, {
    enabled: !defaultNameLoading,
  })
  const createEnvironmentMutation = useCreateEnvironment(orgId)

  const environments = environmentsQuery.data?.environments ?? []

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
          .run({ projectId, displayName: defaultEnvironmentName })
          .then((result) => {
            if (!result.ok && createEnvironmentMutation.actionError) {
              setError(createEnvironmentMutation.actionError)
            }
          }),
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
    setSelectedId((previous) =>
      resolveSelectedEnvironmentId(previous, environments),
    )
  }, [environments])

  useEffect(() => {
    if (environmentsQuery.error) {
      setError(
        environmentsQuery.error instanceof Error
          ? environmentsQuery.error.message
          : 'Failed to load environments',
      )
    }
  }, [environmentsQuery.error])

  const activeEnvironment =
    environments.find((env) => env.id === selectedId) ?? null

  const loading =
    defaultNameLoading ||
    ((environmentsQuery.isLoading || createEnvironmentMutation.isPending) &&
      environments.length === 0)

  if (loading && environments.length === 0) {
    return <Text style={orgPanelStyles.muted}>Loading environments…</Text>
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Managed service</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {!activeEnvironment ? (
        <Text style={orgPanelStyles.muted}>No environments yet.</Text>
      ) : (
        <ActiveEnvironmentPanel
          orgId={orgId}
          projectId={projectId}
          engineCode={engineCode}
          projectDisplayName={projectDisplayName}
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
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    paddingBottom: spacing.xs,
  },
  tab: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: chrome.accent,
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
  toolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  inlineForm: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    minHeight: 44,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  checkmark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  danger: {
    color: colors.error,
  },
  disabled: {
    opacity: 0.55,
  },
})
