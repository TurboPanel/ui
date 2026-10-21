import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  SectionPanel,
  TextField,
} from '@/components/ui'
import {
  LoginStraightThroughEditor,
  NewLoginStraightThroughField,
} from '@/components/org/managed/managed-login-straight-through'
import { newLoginStraightThroughPayload } from '@/lib/managed-straight-through'
import {
  LoginLimitBadges,
  LoginLimitsEditor,
  LoginLimitsFields,
} from '@/components/org/managed/managed-login-limits'
import {
  LoginAdminBadge,
  LoginAdminEditor,
  NewLoginAdminField,
} from '@/components/org/managed/managed-login-admin'
import {
  jobConnectionRole,
  LoginJobEditor,
  NewLoginJobField,
  type LoginJob,
} from '@/components/org/managed/managed-login-job'
import { LoginPermissionsPanel } from '@/components/org/managed/managed-login-permissions'
import {
  LoginModeBadges,
  LoginModeEditor,
  NewLoginModeFields,
  type LoginMode,
} from '@/components/org/managed/managed-login-mode'
import type {
  BindingRedeployRequired,
  ManagedUserPatch,
  ManagedUserPatchResult,
} from '@/lib/instance-api'
import {
  managedErrorMessage,
  MANAGED_ADMIN_PRIVILEGE,
  type ManagedConnectionRole,
  type ManagedUserRecord,
} from '@/lib/managed-services'
import { useManagedEnvironmentBindings } from '@/lib/queries/bindings'
import { useOrgServers } from '@/lib/queries/servers'
import {
  EMPTY_LIMITS_DRAFT,
  describeCap,
  describeWhere,
  limitsFromDraft,
  type LoginLimitsDraft,
} from '@/lib/managed-login-limits'
import { orEmptyArray } from '@/lib/or-empty-array'
import { PrincipalNameSchemeField, usePrincipalNameScheme } from '@/components/org/principal-name-scheme-field'
import { principalNamesLabel, principalSchemeErrorMessage, type NameScheme } from '@/lib/principal-name-scheme'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

const USERNAME_PATTERN = /^[a-zA-Z_]\w{0,62}$/
const DATABASE_PATTERN = /^[a-zA-Z_]\w{0,62}$/

function Chip({ label }: Readonly<{ label: string }>) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

function RedeployServicesPanel({
  redeployRequired,
  onRedeploy,
  onDismiss,
}: Readonly<{
  redeployRequired: BindingRedeployRequired
  onRedeploy: (environmentId: string) => Promise<void>
  onDismiss: () => void
}>) {
  const [busyId, setBusyId] = useState<string | null>(null)
  return (
    <View style={styles.redeployCard}>
      <Text style={panelStyles.detailTitle}>
        {redeployRequired.count} service(s) need a redeploy to pick up the new
        password
      </Text>
      {redeployRequired.services.map((service) => (
        <View key={service.serviceId} style={styles.redeployRow}>
          <Text style={styles.rowLabel}>
            {service.name?.trim() || service.keyPrefix}
          </Text>
          <Button
            label="Redeploy"
            busyLabel="Redeploying…"
            size="sm"
            busy={busyId === service.serviceId}
            onPress={() => {
              setBusyId(service.serviceId)
              void onRedeploy(service.environmentId).finally(() =>
                setBusyId(null),
              )
            }}
          />
        </View>
      ))}
      <Button label="Done" onPress={onDismiss} />
    </View>
  )
}

export function ManagedUsersPanel({
  orgId,
  environmentId,
  engine,
  databases,
  users,
  canManage,
  busy,
  onCreateDatabase,
  onDeleteDatabase,
  onCreateUser,
  onDeleteUser,
  onUpdateUser,
  onRotateUserPassword,
  onRedeployService,
  onReload,
}: Readonly<{
  orgId: string
  environmentId: string
  /** Engine code of the cluster; the straight-through switch is PostgreSQL only. */
  engine?: string | null
  databases: string[]
  users: ManagedUserRecord[]
  canManage: boolean
  busy: boolean
  onCreateDatabase: (name: string) => Promise<void>
  onDeleteDatabase: (name: string) => Promise<void>
  onCreateUser: (input: {
    username: string
    databases: string[]
    privileges?: string[]
    connectionRole: ManagedConnectionRole
    grantMode: LoginMode
    tool: boolean
    allowedSources?: string[]
    maxConnections?: number
    straightThrough?: boolean
    nameScheme?: NameScheme
  }) => Promise<{ password: string; appliedUsername?: string } | null>
  onDeleteUser: (loginId: string) => Promise<void>
  onUpdateUser: (loginId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onRotateUserPassword: (loginId: string) => Promise<{
    password: string
    redeployRequired?: BindingRedeployRequired
  } | null>
  onRedeployService: (environmentId: string) => Promise<void>
  onReload: () => Promise<void>
}>) {
  const bindingsQuery = useManagedEnvironmentBindings(orgId, environmentId)
  const nameScheme = usePrincipalNameScheme(orgId)
  const serversQuery = useOrgServers(orgId)
  const servers = orEmptyArray(serversQuery.data?.servers)
  const [dbName, setDbName] = useState('')
  const [username, setUsername] = useState('')
  const [selectedDbs, setSelectedDbs] = useState<string[]>([])
  const [job, setJob] = useState<LoginJob>('read-write')
  const [grantMode, setGrantMode] = useState<LoginMode>('recipe')
  const [tool, setTool] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [toolBeforeAdmin, setToolBeforeAdmin] = useState(false)
  const [limits, setLimits] = useState<LoginLimitsDraft>(EMPTY_LIMITS_DRAFT)
  const [limitsProblem, setLimitsProblem] = useState<string | null>(null)
  // null = the owner has not touched the switch, so the default for the chosen level shows.
  const [straightChoice, setStraightChoice] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usernameHint, setUsernameHint] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [revealedUsername, setRevealedUsername] = useState<string | null>(null)
  const [redeployRequired, setRedeployRequired] =
    useState<BindingRedeployRequired | null>(null)

  const bindings = orEmptyArray(bindingsQuery.data?.bindings)
  const bindingCountByPrincipal = useMemo(() => {
    const map = new Map<string, number>()
    for (const binding of bindings) {
      map.set(binding.loginId, (map.get(binding.loginId) ?? 0) + 1)
    }
    return map
  }, [bindings])
  const bindingCountByDatabase = useMemo(() => {
    const map = new Map<string, number>()
    for (const binding of bindings) {
      map.set(
        binding.databaseName,
        (map.get(binding.databaseName) ?? 0) + 1,
      )
    }
    return map
  }, [bindings])

  useEffect(() => {
    setSelectedDbs((current) => {
      const filtered = current.filter((name) => databases.includes(name))
      if (filtered.length > 0) {
        return filtered.length === current.length ? current : filtered
      }
      if (databases.length > 0) {
        return [databases[0]!]
      }
      return filtered
    })
  }, [databases])

  const toggleDb = (name: string) => {
    setSelectedDbs((current) => {
      if (current.includes(name)) {
        return current.filter((row) => row !== name)
      }
      return [...current, name]
    })
  }

  const createDatabase = async () => {
    const trimmed = dbName.trim()
    if (!DATABASE_PATTERN.test(trimmed)) {
      setError('Database name must start with a letter or underscore.')
      return
    }
    setWorking(true)
    setError(null)
    try {
      await onCreateDatabase(trimmed)
      setDbName('')
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to create database'))
    } finally {
      setWorking(false)
    }
  }

  const deleteDatabase = async (name: string) => {
    setWorking(true)
    setError(null)
    try {
      await onDeleteDatabase(name)
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete database'))
    } finally {
      setWorking(false)
    }
  }

  const createUser = async () => {
    const trimmed = username.trim()
    if (!USERNAME_PATTERN.test(trimmed)) {
      setError('Username must start with a letter or underscore.')
      return
    }
    if (selectedDbs.length === 0) {
      setError('Select at least one database.')
      return
    }
    const parsedLimits = limitsFromDraft(limits)
    if (!parsedLimits.ok) {
      // Next to the fields, where the owner is looking.
      setLimitsProblem(parsedLimits.error)
      return
    }
    setLimitsProblem(null)
    const { allowedSources, maxConnections } = parsedLimits.payload
    setWorking(true)
    setError(null)
    setUsernameHint(null)
    try {
      const result = await onCreateUser({
        username: trimmed,
        databases: selectedDbs,
        privileges: [admin ? MANAGED_ADMIN_PRIVILEGE : job],
        connectionRole: admin ? 'read-write' : jobConnectionRole(job),
        grantMode,
        tool,
        ...(allowedSources ? { allowedSources } : {}),
        ...(maxConnections ? { maxConnections } : {}),
        ...newLoginStraightThroughPayload(engine, straightChoice, allowedSources !== null),
        nameScheme: nameScheme.requestScheme,
      })
      if (result?.password) {
        // Reveal the applied login — the name the engine actually accepts.
        setRevealedUsername(result.appliedUsername ?? trimmed)
        setRevealedPassword(result.password)
      }
      setUsername('')
      setJob('read-write')
      setGrantMode('recipe')
      setTool(false)
      setAdmin(false)
      setLimits(EMPTY_LIMITS_DRAFT)
      setStraightChoice(null)
      nameScheme.reset()
      await onReload()
    } catch (err) {
      const message = principalSchemeErrorMessage(
        managedErrorMessage(err, 'Failed to create user'),
      )
      const code =
        err instanceof Error
          ? /HTTP \d+:\s*([a-z0-9_]+)/i.exec(err.message)?.[1]
          : null
      if (code === 'username_in_use') {
        const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 3)
        setUsernameHint(`${message} Try ${trimmed}_${suffix}.`)
        setError(null)
      } else {
        setError(message)
      }
    } finally {
      setWorking(false)
    }
  }

  const deleteUser = async (loginId: string) => {
    setWorking(true)
    setError(null)
    try {
      await onDeleteUser(loginId)
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete user'))
    } finally {
      setWorking(false)
    }
  }

  const rotateUser = async (loginId: string, uname: string) => {
    setWorking(true)
    setError(null)
    try {
      const result = await onRotateUserPassword(loginId)
      if (result?.password) {
        setRevealedUsername(uname)
        setRevealedPassword(result.password)
        if (result.redeployRequired && result.redeployRequired.count > 0) {
          setRedeployRequired(result.redeployRequired)
        }
      }
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to rotate user password'))
    } finally {
      setWorking(false)
    }
  }

  if (revealedPassword) {
    return (
      <SectionPanel title="Users & databases" hint="Engine users and databases">
        <SecretReveal
          username={revealedUsername}
          password={revealedPassword}
          onContinue={() => {
            setRevealedPassword(null)
            setRevealedUsername(null)
          }}
          continueLabel="Done"
        />
        {redeployRequired ? (
          <RedeployServicesPanel
            redeployRequired={redeployRequired}
            onRedeploy={onRedeployService}
            onDismiss={() => setRedeployRequired(null)}
          />
        ) : null}
      </SectionPanel>
    )
  }

  const disabled = busy || working || !canManage

  return (
    <SectionPanel title="Users & databases" hint="Engine users and databases">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <Text style={styles.subheading}>Databases</Text>
      <View style={styles.list}>
        {databases.map((name) => {
          const bindingCount = bindingCountByDatabase.get(name) ?? 0
          const deleteBlocked = bindingCount > 0
          return (
            <View key={name} style={styles.row}>
              <Text style={styles.rowLabel}>{name}</Text>
              {bindingCount > 0 ? (
                <Text style={styles.connectedChip}>
                  Connected to {bindingCount} service
                  {bindingCount === 1 ? '' : 's'} — remove on Connect tab
                </Text>
              ) : null}
              {canManage && deleteBlocked ? (
                <Text style={panelStyles.muted}>
                  Remove connections first ({bindingCount})
                </Text>
              ) : null}
              {canManage && !deleteBlocked ? (
                <ConfirmButton
                  label="Delete"
                  confirmLabel="Confirm delete"
                  prompt="Delete this database?"
                  disabled={disabled}
                  onConfirm={() => {
                    void deleteDatabase(name)
                  }}
                />
              ) : null}
            </View>
          )
        })}
      </View>

      {canManage ? (
        <View style={styles.formCol}>
          <TextField
            label="Database name"
            value={dbName}
            onChangeText={setDbName}
            placeholder="database_name"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
          />
          <Button
            label="Add database"
            variant="primary"
            disabled={disabled}
            onPress={() => {
              void createDatabase()
            }}
          />
        </View>
      ) : null}

      <Text style={styles.subheading}>Users</Text>
      <Text style={panelStyles.muted}>
        Usernames are unique across every database on this server&apos;s
        organization.
      </Text>
      <View style={styles.list}>
        {users.map((user) => {
          const bindingCount = bindingCountByPrincipal.get(user.id) ?? 0
          const deleteBlocked = bindingCount > 0
          return (
            <View key={user.id} style={styles.userCard}>
              <Text style={styles.rowLabel}>
                {principalNamesLabel(user.username, user.appliedUsername)}
              </Text>
              <View style={styles.chipRow}>
                {user.databases.map((db) => (
                  <Chip key={db} label={db} />
                ))}
              </View>
              <LoginModeBadges user={user} />
              <LoginAdminBadge user={user} />
              <LoginLimitBadges user={user} />
              <Text style={panelStyles.muted}>
                {user.connectionRole === 'read-only'
                  ? 'Read-only login — the database refuses writes; reads go to replicas when some serve reads'
                  : 'Read/write login — routed to the current primary'}
              </Text>
              {bindingCount > 0 ? (
                <Text style={styles.connectedChip}>
                  Connected to {bindingCount} service
                  {bindingCount === 1 ? '' : 's'}
                </Text>
              ) : null}
              {user.privileges.length > 0 ? (
                <Text style={panelStyles.muted}>
                  {user.privileges.join(', ')}
                </Text>
              ) : null}
              {canManage ? (
                <LoginLimitsEditor
                  user={user}
                  servers={servers}
                  disabled={disabled}
                  onUpdate={onUpdateUser}
                  onError={setError}
                />
              ) : (
                <Text style={panelStyles.muted}>
                  {describeWhere(user.allowedSources, servers)} {describeCap(user.maxConnections)}
                </Text>
              )}
              {canManage ? (
                <LoginStraightThroughEditor
                  engine={engine}
                  user={user}
                  disabled={disabled}
                  onUpdate={onUpdateUser}
                  onError={setError}
                />
              ) : null}
              {canManage ? (
                <LoginModeEditor
                  user={user}
                  disabled={disabled}
                  onUpdate={onUpdateUser}
                  onError={setError}
                />
              ) : null}
              {canManage ? (
                <LoginJobEditor
                  user={user}
                  disabled={disabled}
                  onUpdate={onUpdateUser}
                  onError={setError}
                />
              ) : null}
              {canManage ? (
                <LoginAdminEditor
                  user={user}
                  disabled={disabled}
                  onUpdate={onUpdateUser}
                  onError={setError}
                />
              ) : null}
              {canManage ? (
                <LoginPermissionsPanel
                  orgId={orgId}
                  environmentId={environmentId}
                  loginId={user.id}
                  username={user.username}
                />
              ) : null}
              {canManage ? (
                <ButtonRow>
                  <Button
                    label="Rotate password"
                    size="sm"
                    disabled={disabled}
                    onPress={() => {
                      void rotateUser(user.id, user.appliedUsername)
                    }}
                  />
                  {deleteBlocked ? (
                    <Text style={panelStyles.muted}>
                      Remove connections first ({bindingCount})
                    </Text>
                  ) : (
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Confirm delete"
                      prompt="Delete this user?"
                      disabled={disabled}
                      onConfirm={() => {
                        void deleteUser(user.id)
                      }}
                    />
                  )}
                </ButtonRow>
              ) : null}
            </View>
          )
        })}
        {users.length === 0 ? (
          <EmptyState title="No additional users yet." />
        ) : null}
      </View>

      {canManage ? (
        <View style={styles.createUser}>
          <TextField
            label="Username"
            value={username}
            onChangeText={(value) => {
              setUsername(value)
              setUsernameHint(null)
            }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
          />
          {usernameHint ? (
            <Text style={panelStyles.calloutWarning}>{usernameHint}</Text>
          ) : null}
          <PrincipalNameSchemeField scheme={nameScheme} disabled={disabled} />
          <Text style={panelStyles.detailLabel}>Databases</Text>
          <View style={styles.chipRow}>
            {databases.map((name) => {
              const selected = selectedDbs.includes(name)
              return (
                <Pressable
                  key={name}
                  style={[styles.chip, selected && styles.chipSelected, webPointer]}
                  onPress={() => toggleDb(name)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  accessibilityLabel={name}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          {admin ? (
            <Text style={panelStyles.muted}>
              A Database admin login always reads and writes.
            </Text>
          ) : (
            <NewLoginJobField job={job} onJobChange={setJob} disabled={disabled} />
          )}
          <NewLoginAdminField
            admin={admin}
            onAdminChange={(next) => {
              setAdmin(next)
              if (next) {
                setJob('read-write')
                setToolBeforeAdmin(tool)
                setTool(true)
              } else {
                setTool(toolBeforeAdmin)
              }
            }}
            disabled={disabled}
          />
          <NewLoginModeFields
            mode={grantMode}
            onModeChange={setGrantMode}
            tool={tool}
            onToolChange={setTool}
            disabled={disabled}
          />
          <LoginLimitsFields
            draft={limits}
            onChange={(next) => {
              setLimits(next)
              setLimitsProblem(null)
            }}
            servers={servers}
            disabled={disabled}
          />
          {limitsProblem ? <Text style={panelStyles.error}>{limitsProblem}</Text> : null}
          <NewLoginStraightThroughField
            engine={engine}
            choice={straightChoice}
            privileges={[admin ? MANAGED_ADMIN_PRIVILEGE : job]}
            limited={limits.limited}
            disabled={disabled}
            onChange={setStraightChoice}
          />
          <Button
            label="Create user"
            variant="primary"
            disabled={disabled}
            onPress={() => {
              void createUser()
            }}
          />
        </View>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  subheading: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  rowLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  formCol: {
    gap: spacing.sm,
  },
  userCard: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.link,
  },
  createUser: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  connectedChip: {
    color: colors.link,
    fontSize: 11,
    fontWeight: '600',
  },
  redeployCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
  },
  redeployRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
})
