import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  LoadingState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import { ManagedBackupsPanel } from '@/components/org/managed/managed-backups-panel'
import { ManagedBackupSchedulesPanel } from '@/components/org/managed/managed-backup-schedules-panel'
import { ManagedBindingsPanel } from '@/components/org/managed/managed-bindings-panel'
import { ManagedClusterPanel } from '@/components/org/managed/managed-cluster-panel'
import { ManagedConnectionPanel } from '@/components/org/managed/managed-connection-panel'
import { ManagedCredentialsPanel } from '@/components/org/managed/managed-credentials-panel'
import { ManagedExternalAccessSwitch } from '@/components/org/managed/managed-external-access-switch'
import { ManagedLifecyclePanel } from '@/components/org/managed/managed-lifecycle-panel'
import {
  ManagedSettingsPanel,
  type ManagedSettingsSection,
} from '@/components/org/managed/managed-settings-panel'
import { ManagedStatusPanel } from '@/components/org/managed/managed-status-panel'
import { ManagedUsersPanel } from '@/components/org/managed/managed-users-panel'
import {
  defaultManagedVersionSelection,
  ManagedVersionPicker,
  type ManagedVersionSelection,
} from '@/components/org/managed/managed-version-picker'
import {
  invalidateEnvironmentManagedQueries,
  ManagedCommandsProvider,
  useManagedEnvironment,
  useOptionalManagedEnvironment,
} from '@/components/org/managed/managed-environment-context'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { SectionHeading } from '@/components/ui/v4'
import { panelStyles } from '@/components/ui/panel-styles'
import { type EnvironmentRecord } from '@/lib/instance-api'
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
  useCreateManagedAppLogins,
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
  useSaveServerManagedExternalAccess,
  useServerManagedExternalAccess,
  useUpdateEnvironmentManaged,
  useUpdateManagedUser,
} from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { failedRunMessage, userErrorMessage } from '@/lib/user-error'

/** Fire-and-forget without the `void` operator (typescript:S3735). */
function ignorePromise(promise: Promise<unknown>): void {
  promise.catch(() => {
    // Best-effort; callers surface errors via query/mutation state.
  })
}

function resolveManagedLastError(
  clusterStatus: string,
  statusError: string | null | undefined,
  metadata: Record<string, unknown>
): string | null {
  if (clusterStatus !== 'failed') return null
  const fromStatus = typeof statusError === 'string' ? statusError.trim() : ''
  if (fromStatus) return fromStatus
  const fromMeta = typeof metadata.error === 'string' ? metadata.error.trim() : ''
  return fromMeta || null
}

/**
 * Which environment tab the managed panels are drawn for, named after the
 * website tabs they sit in. `all` is every panel on one page.
 */
export type ManagedBodyFocus =
  'all' | 'overview' | 'deployments' | 'services' | 'bindings' | 'hosting' | 'settings'

/**
 * Overview: the members and the status. Deployments: backups and the apply
 * log. Services: the databases and logins. Bindings: how to connect and the
 * apps bound. Hosting: external access and client TLS. Settings: the engine,
 * resources and the danger zone.
 */
function managedFocusVisibility(focus: ManagedBodyFocus): {
  showOverview: boolean
  showConnect: boolean
  showData: boolean
  showBackups: boolean
  showStatus: boolean
  showHosting: boolean
  showSettings: boolean
} {
  const all = focus === 'all'
  return {
    showOverview: all || focus === 'overview',
    showConnect: all || focus === 'bindings',
    showData: all || focus === 'services',
    showBackups: all || focus === 'deployments',
    showStatus: all || focus === 'overview' || focus === 'deployments',
    showHosting: all || focus === 'hosting',
    showSettings: all || focus === 'settings',
  }
}

/** Which part of the settings a tab shows: Hosting has client TLS, Settings the rest. */
function settingsSectionFor(focus: ManagedBodyFocus): ManagedSettingsSection {
  if (focus === 'hosting') return 'hosting'
  if (focus === 'settings') return 'settings'
  return 'all'
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

export function ManagedSetupPanel({
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
  onCreated: (rootPassword?: string, rootUsername?: string) => void
}>) {
  const [serverId, setServerId] = useState<string | null>(null)
  const [version, setVersion] = useState<ManagedVersionSelection | null>(() =>
    defaultManagedVersionSelection(engineCode)
  )
  const [error, setError] = useState<string | null>(null)
  const submitGuard = useRef(false)

  const serversQuery = useOrgServers(orgId)
  const updateEnvironmentMutation = useUpdateEnvironment(orgId, environmentId)
  const createManagedMutation = useCreateEnvironmentManaged(orgId, environmentId)
  const externalAccessQuery = useServerManagedExternalAccess(orgId, serverId)
  const saveExternalAccessMutation = useSaveServerManagedExternalAccess(orgId)
  const canEditServer = useCan('server', serverId ?? '', 'organization:manage')
  // `null` until the person touches the switch: then nothing is saved for it.
  const [externalAccessChoice, setExternalAccessChoice] = useState<boolean | null>(null)
  const savedExternalAccess = externalAccessQuery.data?.enabled ?? false
  const externalAccess = externalAccessChoice ?? savedExternalAccess

  const servers = orEmptyArray(serversQuery.data?.servers)
  const loading = serversQuery.isLoading
  const submitting =
    updateEnvironmentMutation.isPending ||
    createManagedMutation.isPending ||
    saveExternalAccessMutation.isPending

  // The switch is per server: picking another server starts from that server's value.
  useEffect(() => {
    setExternalAccessChoice(null)
  }, [serverId])

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
        setError(failedRunMessage(pinResult, 'Failed to pick the server'))
        return
      }
      // Saved before the service exists, and only when it changed, so the
      // first apply already publishes the way the person chose.
      if (externalAccess !== savedExternalAccess) {
        const saved = await saveExternalAccessMutation.run({ serverId, enabled: externalAccess })
        if (!saved.ok) {
          // `actionError` is render state and stale inside this running call.
          // Through `managedErrorMessage`, so a refusal that names databases
          // (`external_access_weak_ssl`) shows its own sentence.
          setError(
            saved.error === null
              ? 'Failed to save external access'
              : managedErrorMessage(saved.cause, saved.error)
          )
          return
        }
      }
      const result = await createManagedMutation.run(
        version ? { engineSeries: version.series, imageVariant: version.variantId } : {}
      )
      if (!result.ok) {
        setError(failedRunMessage(result, 'Failed to create the database'))
        return
      }
      onCreated(result.value.rootPassword, result.value.rootUsername)
    } finally {
      submitGuard.current = false
    }
  }

  return (
    <View style={styles.setup}>
      <SectionHeading title="Create the database" note="Pick the server it runs on" />
      {loading ? <LoadingState label="Loading servers…" /> : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
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

      {serverId ? (
        <ManagedExternalAccessSwitch
          value={externalAccess}
          otherClusters={externalAccessQuery.data?.clusterCount ?? 0}
          disabled={submitting || !canManage || !canEditServer}
          // A spinner while the server's value loads, so the switch never looks
          // pressable while it ignores presses.
          busy={externalAccessQuery.isLoading}
          onChange={setExternalAccessChoice}
        />
      ) : null}

      {canManage ? (
        <Button
          label="Create database"
          busyLabel="Creating…"
          variant="primary"
          busy={submitting}
          disabled={submitting || !serverId}
          onPress={() => {
            ignorePromise(create())
          }}
        />
      ) : (
        <Text style={panelStyles.muted}>You need manage permission to create this database.</Text>
      )}
    </View>
  )
}

function isServerPlacementRequiredError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('server_placement_required')
}

type ManagedEnvironmentBodyProps = Readonly<{
  orgId: string
  environmentId: string
  engineCode: string | null
  projectName: string
  /** When set, only render panels for that environment tab. */
  focus?: ManagedBodyFocus
  /**
   * What a tab other than Overview shows before the database exists. The Set
   * up panel is drawn once, on Overview (and on the all-panels page).
   */
  notCreated?: ReactNode
}>

/**
 * The managed panels of one environment. Inside the shared environment shell
 * they use the shell's managed environment (the header's commands and these
 * are one list); anywhere else they bring their own.
 */
export function ManagedEnvironmentBody(props: ManagedEnvironmentBodyProps) {
  const outer = useOptionalManagedEnvironment()
  if (outer?.environmentId === props.environmentId) {
    return <ManagedEnvironmentBodyContent {...props} />
  }
  return (
    <ManagedCommandsProvider orgId={props.orgId} environmentId={props.environmentId}>
      <ManagedEnvironmentBodyContent {...props} />
    </ManagedCommandsProvider>
  )
}

function ManagedEnvironmentBodyContent({
  orgId,
  environmentId,
  engineCode,
  projectName,
  focus = 'all',
  notCreated = null,
}: ManagedEnvironmentBodyProps) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [revealPassword, setRevealPassword] = useState<string | null>(null)
  const [revealUsername, setRevealUsername] = useState<string | null>(null)

  // Show-once passwords stay in local state only; clear on dismiss and unmount.
  useEffect(() => {
    return () => {
      setRevealPassword(null)
      setRevealUsername(null)
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
    setError(managedErrorMessage(queryError, 'Failed to load the database'))
  }, [queryError])

  const loading = environmentQuery.isLoading || (hasServerPin && managedQuery.isLoading && !detail)

  if (loading && !detail && !revealPassword) {
    return <LoadingState label="Loading the database…" />
  }

  if (error) {
    return <Text style={panelStyles.error}>{error}</Text>
  }

  if (revealPassword) {
    return (
      <View style={styles.setup}>
        <SectionHeading title="Root password" note="Shown once" />
        <SecretReveal
          username={revealUsername ?? detail?.rootUsername ?? undefined}
          password={revealPassword}
          onContinue={() => {
            setRevealPassword(null)
            setRevealUsername(null)
          }}
          continueLabel="Continue"
        />
      </View>
    )
  }

  const managed = detail?.managed ?? null
  if (!hasServerPin || !detail || !managed) {
    if (focus !== 'all' && focus !== 'overview') return <>{notCreated}</>
    return (
      <ManagedSetupPanel
        orgId={orgId}
        environmentId={environmentId}
        engineCode={engineCode}
        canManage={canManage}
        onCreated={(rootPassword, rootUsername) => {
          if (rootPassword) {
            setRevealPassword(rootPassword)
            setRevealUsername(rootUsername ?? null)
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

export function ManagedEnvironmentReadyPanels({
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
  // The commands queued here and from the header, and the newest Apply (kept
  // after it finishes so its log stays readable), are the shell's.
  const { registerCommand, applyCommand, inFlight } = useManagedEnvironment()
  const {
    showOverview,
    showConnect,
    showData,
    showBackups,
    showStatus,
    showHosting,
    showSettings,
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
  const lastError = resolveManagedLastError(clusterStatus, status?.error, managed.metadata ?? {})
  const users = usersQuery.data?.users ?? []
  const databases = databasesQuery.data?.databases ?? []
  const backups = backupsQuery.data?.backups ?? []
  const members = alignMemberStatusesWithCluster(
    mergeManagedMembers(detail.members ?? [], status?.members ?? []),
    clusterStatus
  )
  const invalidateManagedData = useCallback(() => {
    invalidateEnvironmentManagedQueries(queryClient, orgId, environmentId)
  }, [queryClient, orgId, environmentId])

  return (
    <View style={styles.panels}>
      {showOverview ? (
        <ManagedClusterPanel
          orgId={orgId}
          environmentId={environmentId}
          members={members}
          managedDisplayName={managed.name?.trim() || projectName}
          engine={managed.engine}
          imageOrSeries={detail.release?.series ?? detail.settings?.image ?? null}
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
            connections={detail.connections}
            addressNeeded={detail.addressNeeded === true}
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
          engine={managed.engine}
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
              throw new Error(result.error ?? 'Failed to delete backup')
            }
            registerCommand(result.value.commandId, 'Delete backup')
          }}
          onRestore={async (backupId) => {
            const result = await restoreBackupMutation.run(backupId)
            if (!result.ok) {
              throw new Error(result.error ?? 'Failed to restore backup')
            }
            registerCommand(result.value.commandId, 'Restore backup')
          }}
        />
      ) : null}
      {showBackups ? (
        <ManagedBackupSchedulesPanel
          orgId={orgId}
          environmentId={environmentId}
          canManage={canManage}
          supported={supportsBackup}
        />
      ) : null}
      {(showSettings || showHosting) && settings ? (
        <ManagedSettingsPanel
          section={settingsSectionFor(focus)}
          settings={settings}
          engineCode={managed.engine}
          organizationSslMode={detail.ssl?.organizationDefault ?? null}
          orgId={orgId}
          externalAccess={detail.externalAccess ?? null}
          canManage={canManage}
          busy={inFlight}
          running={clusterStatus === 'ready'}
          onApply={async (next: ManagedSettings) => {
            const updateResult = await updateManagedMutation.run({
              settings: next,
            })
            if (!updateResult.ok) {
              invalidateManagedData()
              throw new Error(updateResult.error ?? 'Failed to save settings')
            }
            const applyResult = await applyManagedMutation.mutateAsync()
            registerCommand(applyResult.commandId, 'Apply settings')
            invalidateManagedData()
          }}
        />
      ) : null}
      {showSettings ? (
        <ManagedLifecyclePanel
          status={clusterStatus}
          projectName={projectName}
          canManage={canManage}
          busy={inFlight}
          onLifecycle={async (action) => {
            const result = await lifecycleMutation.run(action)
            if (!result.ok) {
              throw new Error(result.error ?? 'Lifecycle action failed')
            }
            registerCommand(result.value.commandId, action, result.value.serverId)
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
      {showStatus ? (
        <ManagedStatusPanel
          orgId={orgId}
          environmentId={environmentId}
          applyCommand={applyCommand}
          status={clusterStatus}
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
  engine,
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
  engine: string | null
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
  registerCommand: (commandId: string, label: string, commandServerId?: string) => void
}>) {
  const updateUserMutation = useUpdateManagedUser(orgId, environmentId)
  const appLoginsMutation = useCreateManagedAppLogins(orgId, environmentId)
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
        engine={engine}
        databases={databases}
        users={users}
        canManage={canManage}
        busy={inFlight}
        onCreateDatabase={async (name) => {
          const result = await createDatabaseMutation.run({ name })
          if (!result.ok) {
            throw new Error(result.error ?? 'Failed to create database')
          }
          registerCommand(result.value.commandId, 'Create database')
        }}
        onDeleteDatabase={async (name) => {
          const result = await deleteDatabaseMutation.run(name)
          if (!result.ok) {
            throw new Error(result.error ?? 'Failed to delete database')
          }
          registerCommand(result.value.commandId, 'Delete database')
        }}
        onCreateUser={async (input) => {
          const result = await createUserMutation.run(input)
          if (!result.ok) {
            // The run result carries the server's refusal; `actionError` is stale until the next render.
            throw new Error(result.error ?? 'Failed to create user')
          }
          registerCommand(result.value.commandId, 'Create user')
          return {
            password: result.value.password,
            appliedUsername: result.value.user.appliedUsername,
          }
        }}
        onDeleteUser={async (loginId) => {
          const result = await deleteUserMutation.run(loginId)
          if (!result.ok) {
            throw new Error(result.error ?? 'Failed to delete user')
          }
          registerCommand(result.value.commandId, 'Delete user')
        }}
        onUpdateUser={async (loginId, body) => {
          const result = await updateUserMutation.mutateAsync({ loginId, body })
          if (result.commandId) registerCommand(result.commandId, 'Change user permissions')
          return result
        }}
        onRotateUserPassword={async (loginId) => {
          const result = await rotateUserPasswordMutation.mutateAsync(loginId)
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
        onCreateAppLogins={async (databaseName, body) => {
          const result = await appLoginsMutation.run({ databaseName, body })
          if (!result.ok) throw new Error(result.error ?? 'Failed to add the app logins')
          registerCommand(result.value.commandId, 'Add app logins')
          return { logins: result.value.logins, notes: result.value.notes }
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
      onError(failedRunMessage(result, 'Failed to rename the environment'))
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
      onError(failedRunMessage(result, 'Failed to create the environment'))
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
      onError(failedRunMessage(result, 'Failed to delete the environment'))
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
            if (!result.ok) {
              setError(failedRunMessage(result, 'Failed to create the environment'))
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
      setError(userErrorMessage(environmentsQuery.error, 'Failed to load environments'))
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
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

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
  setup: {
    gap: spacing.md,
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
