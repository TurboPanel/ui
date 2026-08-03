import { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ManagedBackupsPanel } from '@/components/org/managed/managed-backups-panel'
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
  COMMAND_POLL_MS,
  isTerminalCommandStatus,
} from '@/components/org/server-commands-panel'
import { useAuth } from '@/lib/auth-context'
import {
  applyEnvironmentManaged,
  createEnvironment,
  createEnvironmentManaged,
  createManagedBackup,
  createManagedDatabase,
  createManagedUser,
  deleteEnvironment,
  deleteEnvironmentManaged,
  deleteManagedBackup,
  deleteManagedDatabase,
  deleteManagedUser,
  fetchCommand,
  fetchEnvironment,
  fetchEnvironmentManaged,
  fetchManagedBackups,
  fetchManagedDatabases,
  fetchManagedLogs,
  fetchManagedStatus,
  fetchManagedUsers,
  fetchOrgServers,
  fetchVisibleEnvironments,
  isForbiddenError,
  restoreManagedBackup,
  rotateManagedRootPassword,
  runManagedLifecycle,
  updateEnvironment,
  updateEnvironmentManaged,
  type CommandStatus,
  type ContainerRecord,
  type EnvironmentRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  isValidPublishedPort,
  managedCatalogEntryForCode,
  managedErrorMessage,
  type ManagedBackupRecord,
  type ManagedDetailResponse,
  type ManagedSettings,
  type ManagedStatus,
  type ManagedUserRecord,
} from '@/lib/managed-services'
import { withGuardedAction } from '@/lib/guarded-action'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const STATUS_POLL_MS = 5_000

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

type TrackedCommand = {
  label: string
  status: CommandStatus
}

function useManagedCommands(
  serverId: string | null,
  onTerminalSuccess: () => void,
) {
  const [commands, setCommands] = useState<Record<string, TrackedCommand>>({})
  const onSuccessRef = useRef(onTerminalSuccess)
  useEffect(() => {
    onSuccessRef.current = onTerminalSuccess
  }, [onTerminalSuccess])

  const registerCommand = (commandId: string, label: string) => {
    setCommands((current) => ({
      ...current,
      [commandId]: { label, status: 'queued' },
    }))
  }

  const inFlight = Object.values(commands).some(
    (row) => !isTerminalCommandStatus(row.status),
  )

  useEffect(() => {
    if (!serverId) {
      return
    }
    const ids = Object.entries(commands)
      .filter(([, row]) => !isTerminalCommandStatus(row.status))
      .map(([id]) => id)
    if (ids.length === 0) {
      return
    }

    let cancelled = false
    const tick = async () => {
      for (const commandId of ids) {
        try {
          const record = await fetchCommand(serverId, commandId)
          if (cancelled) return
          setCommands((current) => {
            const prev = current[commandId]
            if (!prev) return current
            return {
              ...current,
              [commandId]: { ...prev, status: record.status },
            }
          })
          if (isTerminalCommandStatus(record.status) && record.status === 'succeeded') {
            onSuccessRef.current()
          }
        } catch {
          // Keep polling; next tick may succeed.
        }
      }
    }

    void tick()
    const timer = setInterval(() => {
      void tick()
    }, COMMAND_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [commands, serverId])

  return { registerCommand, inFlight, commands }
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
  environmentId,
  engineCode,
  canManage,
  onCreated,
}: Readonly<{
  environmentId: string
  engineCode: string | null
  canManage: boolean
  onCreated: (rootPassword?: string) => void
}>) {
  const { handleUnauthorized } = useAuth()
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [serverId, setServerId] = useState<string | null>(null)
  const [expose, setExpose] = useState(false)
  const [publishedPort, setPublishedPort] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitGuard = useRef(false)
  const catalog = engineCode ? managedCatalogEntryForCode(engineCode) : undefined

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const result = await fetchOrgServers()
        if (!cancelled) {
          setServers(result.servers)
          const connected = result.servers.find((row) => row.connected)
          setServerId(connected?.id ?? null)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(err instanceof Error ? err.message : 'Failed to load servers')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [handleUnauthorized])

  useEffect(() => {
    if (catalog?.defaultPort != null) {
      setPublishedPort(String(catalog.defaultPort))
    }
  }, [catalog?.defaultPort])

  const create = async () => {
    if (submitGuard.current || !serverId) return
    if (expose) {
      const port = Number(publishedPort)
      if (!isValidPublishedPort(port)) {
        setError('Enter a valid published port (1–65535, not reserved).')
        return
      }
    }
    submitGuard.current = true
    setSubmitting(true)
    setError(null)
    try {
      await updateEnvironment(environmentId, { serverId })
      const result = await createEnvironmentManaged(
        environmentId,
        expose
          ? {
              exposure: {
                enabled: true,
                publishedPort: Number(publishedPort),
              },
            }
          : undefined,
      )
      onCreated(result.rootPassword)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(managedErrorMessage(err, 'Failed to create managed service'))
    } finally {
      submitGuard.current = false
      setSubmitting(false)
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
        <Text style={styles.toggleLabel}>Expose on port</Text>
      </Pressable>
      {expose ? (
        <TextInput
          style={Platform.OS === 'web' ? webInputStyle : styles.input}
          value={publishedPort}
          onChangeText={setPublishedPort}
          keyboardType="numeric"
          editable={!submitting}
          placeholderTextColor={colors.textDim}
        />
      ) : null}

      {canManage ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            (submitting || !serverId) && styles.disabled,
          ]}
          disabled={submitting || !serverId}
          onPress={() => {
            void create()
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
  focus?: 'all' | 'overview' | 'data' | 'backups' | 'settings' | 'environments'
}>) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [detail, setDetail] = useState<ManagedDetailResponse | null>(null)
  const [status, setStatus] = useState<{
    status: ManagedStatus
    host: string | null
    port: number | null
    containers: ContainerRecord[]
  } | null>(null)
  const [users, setUsers] = useState<ManagedUserRecord[]>([])
  const [databases, setDatabases] = useState<string[]>([])
  const [backups, setBackups] = useState<ManagedBackupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealPassword, setRevealPassword] = useState<string | null>(null)
  const catalog = engineCode ? managedCatalogEntryForCode(engineCode) : undefined
  // Only Postgres ships `spec.backup` today (see `instance/src/lib/managed/postgres.ts`);
  // other catalog engines are `coming-soon` and unreachable from this body anyway.
  const supportsBackup = engineCode === 'postgres'

  const clearToSetup = () => {
    setDetail(null)
    setStatus(null)
    setUsers([])
    setDatabases([])
    setBackups([])
  }

  const reloadAll = async () => {
    // Unpinned environments cannot resolve /managed (409 server_placement_required).
    // Treat that as setup state instead of an error so Add environment works.
    const { environment } = await fetchEnvironment(environmentId)
    if (!environment.serverId) {
      clearToSetup()
      return
    }
    const managedDetail = await fetchEnvironmentManaged(environmentId)
    setDetail(managedDetail)
    if (!managedDetail.managed) {
      setStatus(null)
      setUsers([])
      setDatabases([])
      setBackups([])
      return
    }
    const [managedStatus, usersResult, databasesResult, backupsResult] =
      await Promise.all([
        fetchManagedStatus(environmentId),
        fetchManagedUsers(environmentId),
        fetchManagedDatabases(environmentId),
        supportsBackup
          ? fetchManagedBackups(environmentId)
          : Promise.resolve({ backups: [] as ManagedBackupRecord[] }),
      ])
    setStatus(managedStatus)
    setUsers(usersResult.users)
    setDatabases(databasesResult.databases)
    setBackups(backupsResult.backups)
  }

  const serverId =
    detail?.managed?.serverId ?? detail?.server?.id ?? null

  const { registerCommand, inFlight } = useManagedCommands(serverId, () => {
    void reloadAll().catch(() => {
      // surfaced via next manual refresh / status poll
    })
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        await reloadAll()
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        if (isServerPlacementRequiredError(err)) {
          clearToSetup()
          return
        }
        setError(managedErrorMessage(err, 'Failed to load managed service'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [environmentId, handleUnauthorized])

  const managedStatus = status?.status ?? detail?.managed?.status ?? null

  useEffect(() => {
    if (
      managedStatus !== 'provisioning' &&
      managedStatus !== 'applying'
    ) {
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const next = await fetchManagedStatus(environmentId)
        if (!cancelled) setStatus(next)
      } catch {
        // keep previous status
      }
    }
    const timer = setInterval(() => {
      void tick()
    }, STATUS_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [environmentId, managedStatus])

  if (loading && !detail) {
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

  if (!detail?.managed) {
    return (
      <ManagedSetupPanel
        environmentId={environmentId}
        engineCode={engineCode}
        canManage={canManage}
        onCreated={(rootPassword) => {
          if (rootPassword) {
            setRevealPassword(rootPassword)
          }
          void reloadAll()
        }}
      />
    )
  }

  const managed = detail.managed
  const settings = detail.settings
  const showOverview = focus === 'all' || focus === 'overview'
  const showData = focus === 'all' || focus === 'data'
  const showBackups = focus === 'all' || focus === 'backups'
  const showSettings = focus === 'all' || focus === 'settings'
  const showLifecycle =
    focus === 'all' || focus === 'environments' || focus === 'settings'

  return (
    <View style={styles.panels}>
      {showOverview || showData ? (
        <ManagedConnectionPanel
          managed={managed}
          connection={detail.connection}
          server={detail.server}
        />
      ) : null}
      {showData ? (
        <>
          <ManagedCredentialsPanel
            rootUsername={detail.rootUsername}
            canManage={canManage}
            busy={inFlight}
            onRotate={async () => {
              try {
                const result = await rotateManagedRootPassword(environmentId)
                registerCommand(result.commandId, 'Rotate root password')
                return { rootPassword: result.rootPassword }
              } catch (err) {
                if (isForbiddenError(err)) {
                  await handleUnauthorized()
                  return null
                }
                throw new Error(
                  managedErrorMessage(err, 'Failed to rotate password'),
                )
              }
            }}
          />
          <ManagedUsersPanel
            databases={databases}
            users={users}
            canManage={canManage}
            busy={inFlight}
            onCreateDatabase={async (name) => {
              const result = await createManagedDatabase(environmentId, { name })
              registerCommand(result.commandId, 'Create database')
            }}
            onDeleteDatabase={async (name) => {
              const result = await deleteManagedDatabase(environmentId, name)
              registerCommand(result.commandId, 'Delete database')
            }}
            onCreateUser={async (input) => {
              try {
                const result = await createManagedUser(environmentId, input)
                registerCommand(result.commandId, 'Create user')
                return { password: result.password }
              } catch (err) {
                if (isForbiddenError(err)) {
                  await handleUnauthorized()
                  return null
                }
                throw err
              }
            }}
            onDeleteUser={async (principalId) => {
              const result = await deleteManagedUser(environmentId, principalId)
              registerCommand(result.commandId, 'Delete user')
            }}
            onReload={reloadAll}
          />
        </>
      ) : null}
      {showBackups ? (
        <ManagedBackupsPanel
          backups={backups}
          supported={supportsBackup}
          managedDisplayName={managed.displayName?.trim() || projectDisplayName}
          canManage={canManage}
          busy={inFlight}
          onBackupNow={async () => {
            const result = await createManagedBackup(environmentId)
            registerCommand(result.commandId, 'Back up now')
          }}
          onDelete={async (backupId) => {
            const result = await deleteManagedBackup(environmentId, backupId)
            registerCommand(result.commandId, 'Delete backup')
          }}
          onRestore={async (backupId) => {
            const result = await restoreManagedBackup(environmentId, backupId)
            registerCommand(result.commandId, 'Restore backup')
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
            try {
              const result = await runManagedLifecycle(environmentId, action)
              registerCommand(result.commandId, action)
            } catch (err) {
              if (isForbiddenError(err)) {
                await handleUnauthorized()
                return
              }
              throw new Error(managedErrorMessage(err, 'Lifecycle action failed'))
            }
          }}
          onApply={async () => {
            try {
              const result = await applyEnvironmentManaged(environmentId)
              registerCommand(result.commandId, 'Apply')
            } catch (err) {
              if (isForbiddenError(err)) {
                await handleUnauthorized()
                return
              }
              throw new Error(managedErrorMessage(err, 'Apply failed'))
            }
          }}
          onDelete={async () => {
            try {
              const result = await deleteEnvironmentManaged(environmentId)
              if (result.deleted) {
                await reloadAll()
                return
              }
              if (result.commandId && result.serverId) {
                registerCommand(result.commandId, 'Delete')
              }
            } catch (err) {
              if (isForbiddenError(err)) {
                await handleUnauthorized()
                return
              }
              throw new Error(managedErrorMessage(err, 'Delete failed'))
            }
          }}
        />
      ) : null}
      {showSettings && settings ? (
        <ManagedSettingsPanel
          settings={settings}
          canManage={canManage}
          busy={inFlight}
          onApply={async (next: ManagedSettings) => {
            try {
              await updateEnvironmentManaged(environmentId, { settings: next })
              const result = await applyEnvironmentManaged(environmentId)
              registerCommand(result.commandId, 'Apply settings')
              await reloadAll()
            } catch (err) {
              if (isForbiddenError(err)) {
                await handleUnauthorized()
                return
              }
              throw err
            }
          }}
        />
      ) : null}
      {showOverview || showSettings ? (
        <ManagedStatusPanel
          status={status?.status ?? managed.status}
          host={status?.host ?? managed.host}
          port={status?.port ?? managed.port}
          containers={status?.containers ?? []}
          onFetchLogs={async (tail) => {
            const result = await fetchManagedLogs(environmentId, tail)
            return result.logs
          }}
        />
      ) : null}
    </View>
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

async function loadOrProvisionEnvironments(
  projectId: string,
  canOwn: boolean,
  provisionAttemptedFor: { current: string | null },
  displayName: string,
): Promise<EnvironmentRecord[]> {
  const envs = (await fetchVisibleEnvironments(projectId)).environments
  const shouldProvision =
    envs.length === 0 && canOwn && provisionAttemptedFor.current !== projectId
  if (!shouldProvision) {
    return envs
  }
  provisionAttemptedFor.current = projectId
  await createEnvironment({ projectId, displayName })
  return (await fetchVisibleEnvironments(projectId)).environments
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
  handleUnauthorized,
  onSelect,
  onEnvironmentsChanged,
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
  handleUnauthorized: () => Promise<void>
  onSelect: (id: string | null) => void
  onEnvironmentsChanged: (environments: EnvironmentRecord[]) => void
  onError: (error: string | null) => void
}>) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const saveRename = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      onError('Name is required.')
      return
    }
    setRenameSaving(true)
    onError(null)
    const result = await withGuardedAction(
      () => updateEnvironment(activeEnvironment.id, { displayName: trimmed }),
      handleUnauthorized,
      'Failed to rename',
    )
    setRenameSaving(false)
    if (!result.ok) {
      if (result.error) onError(result.error)
      return
    }
    onEnvironmentsChanged(
      environments.map((env) =>
        env.id === activeEnvironment.id
          ? { ...env, displayName: trimmed }
          : env,
      ),
    )
    setRenaming(false)
  }

  const submitCreate = async () => {
    const trimmed = createName.trim()
    if (!trimmed) {
      onError('Name is required.')
      return
    }
    setCreating(true)
    onError(null)
    const result = await withGuardedAction(
      () => createEnvironment({ projectId, displayName: trimmed }),
      handleUnauthorized,
      'Failed to create environment',
    )
    setCreating(false)
    if (!result.ok) {
      if (result.error) onError(result.error)
      return
    }
    onEnvironmentsChanged((await fetchVisibleEnvironments(projectId)).environments)
    onSelect(result.value.id)
    setCreateName('')
    setShowCreate(false)
  }

  const deleteActive = async () => {
    setDeleting(true)
    onError(null)
    const result = await withGuardedAction(
      () => deleteEnvironment(activeEnvironment.id),
      handleUnauthorized,
      'Failed to delete environment',
    )
    setDeleting(false)
    if (!result.ok) {
      if (result.error) onError(result.error)
      return
    }
    const envs = (await fetchVisibleEnvironments(projectId)).environments
    onEnvironmentsChanged(envs)
    onSelect(envs[0]?.id ?? null)
    setDeleteArmed(false)
  }

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
              void deleteActive()
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
            void saveRename()
          }}
        />
      ) : null}

      {showCreate && canOwn ? (
        <CreateEnvironmentForm
          value={createName}
          onChange={setCreateName}
          creating={creating}
          onCreate={() => {
            void submitCreate()
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
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const {
    defaultEnvironmentName,
    isLoading: defaultNameLoading,
  } = useOrgDefaultEnvironmentName(orgId)
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const provisionAttemptedFor = useRef<string | null>(null)

  useEffect(() => {
    // Wait for the org default name query to settle so a custom org default is
    // never raced by the platform fallback while still loading.
    if (defaultNameLoading) {
      return
    }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const result = await withGuardedAction(
        () =>
          loadOrProvisionEnvironments(
            projectId,
            canOwn,
            provisionAttemptedFor,
            defaultEnvironmentName,
          ),
        handleUnauthorized,
        'Failed to load environments',
      )
      if (cancelled) return
      if (!result.ok) {
        if (result.error) setError(result.error)
        setLoading(false)
        return
      }
      setEnvironments(result.value)
      setSelectedId((previous) =>
        resolveSelectedEnvironmentId(previous, result.value),
      )
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    canOwn,
    handleUnauthorized,
    defaultEnvironmentName,
    defaultNameLoading,
  ])

  const activeEnvironment =
    environments.find((env) => env.id === selectedId) ?? null

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
          handleUnauthorized={handleUnauthorized}
          onSelect={setSelectedId}
          onEnvironmentsChanged={setEnvironments}
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
