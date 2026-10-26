import { Fragment, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import {
  AppLoginsButton,
  AppLoginsPasswords,
  AppLoginsRowForm,
  AppLoginsSchemeNote,
  useAppLogins,
  type AppLoginsBody,
  type AppLoginsResult,
} from '@/components/org/managed/managed-app-logins'
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
import { appLoginsSchemeProblem } from '@/lib/managed-app-logins'
import { managedIdentifierMaxLength, managedIdentifierProblem } from '@/lib/managed-identifier'
import { recallSessionChoices, rememberSessionChoices } from '@/lib/session-choices'
import { PrincipalNameSchemeField, usePrincipalNameScheme } from '@/components/org/principal-name-scheme-field'
import { principalNamesLabel, principalSchemeErrorMessage, type NameScheme } from '@/lib/principal-name-scheme'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'


/** What the single-login form keeps between logins for the rest of the session. */
type LoginFormChoices = {
  job: LoginJob
  grantMode: LoginMode
  tool: boolean
  admin: boolean
  toolBeforeAdmin: boolean
  limits: LoginLimitsDraft
  straightChoice: boolean | null
  nameScheme?: NameScheme
}

const loginFormKey = (orgId: string) => `managed-login-form:${orgId}`

const DEFAULT_LOGIN_FORM: LoginFormChoices = {
  job: 'read-write',
  grantMode: 'recipe',
  tool: false,
  admin: false,
  toolBeforeAdmin: false,
  limits: EMPTY_LIMITS_DRAFT,
  // null = the owner has not touched the switch, so the default for the chosen level shows.
  straightChoice: null,
}

/** The last login's choices in this session, or the defaults. */
function initialLoginForm(orgId: string): LoginFormChoices {
  return {
    ...DEFAULT_LOGIN_FORM,
    ...recallSessionChoices<LoginFormChoices>(loginFormKey(orgId)),
  }
}

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

/** A failure said where it happened; nothing when there is none. */
function InlineError({ message }: Readonly<{ message: string | null }>) {
  return message ? <Text style={panelStyles.error}>{message}</Text> : null
}

/** What the last add form, edit or delete is waiting for while a change applies. */
const FORM_WAITS = 'Wait until the current change finishes; this form unlocks by itself.'
const EDITS_WAIT =
  'The current change is still being applied on the server. Editing and deleting unlock by themselves when it finishes.'

/**
 * Why controls are locked while a change applies on the server: it refuses
 * another change to this database until then (`managed_busy`), so the
 * controls wait visibly instead of ignoring presses.
 */
function ApplyingNote({ shown, text }: Readonly<{ shown: boolean; text: string }>) {
  if (!shown) return null
  return (
    <View style={styles.applying}>
      <ActivityIndicator size="small" color={colors.textMuted} />
      <Text style={panelStyles.muted}>{text}</Text>
    </View>
  )
}

/** The show-once passwords: the app logins list, or one login's new password. */
function PasswordsPanel({
  appLoginsResult,
  onAppLoginsDone,
  username,
  password,
  onPasswordDone,
  redeployRequired,
  onRedeploy,
  onDismissRedeploy,
}: Readonly<{
  appLoginsResult: AppLoginsResult | null
  onAppLoginsDone: () => void
  username: string | null
  password: string | null
  onPasswordDone: () => void
  redeployRequired: BindingRedeployRequired | null
  onRedeploy: (environmentId: string) => Promise<void>
  onDismissRedeploy: () => void
}>) {
  return (
    <SectionPanel title="Users & databases" hint="Engine users and databases">
      {appLoginsResult ? (
        <AppLoginsPasswords result={appLoginsResult} onDone={onAppLoginsDone} />
      ) : (
        <SecretReveal
          username={username}
          password={password ?? ''}
          onContinue={onPasswordDone}
          continueLabel="Done"
        />
      )}
      {!appLoginsResult && redeployRequired ? (
        <RedeployServicesPanel
          redeployRequired={redeployRequired}
          onRedeploy={onRedeploy}
          onDismiss={onDismissRedeploy}
        />
      ) : null}
    </SectionPanel>
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
  onCreateAppLogins,
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
  /** The three app logins for one database in one step; no action when absent. */
  onCreateAppLogins?: (databaseName: string, body: AppLoginsBody) => Promise<AppLoginsResult>
}>) {
  const bindingsQuery = useManagedEnvironmentBindings(orgId, environmentId)
  // The form starts from the last login's choices in this session.
  const [initial] = useState(() => initialLoginForm(orgId))
  const nameScheme = usePrincipalNameScheme(orgId, initial.nameScheme)
  const serversQuery = useOrgServers(orgId)
  const servers = orEmptyArray(serversQuery.data?.servers)
  const [dbName, setDbName] = useState('')
  const [username, setUsername] = useState('')
  const [selectedDbs, setSelectedDbs] = useState<string[]>([])
  const [job, setJob] = useState<LoginJob>(initial.job)
  const [grantMode, setGrantMode] = useState<LoginMode>(initial.grantMode)
  const [tool, setTool] = useState(initial.tool)
  const [admin, setAdmin] = useState(initial.admin)
  const [toolBeforeAdmin, setToolBeforeAdmin] = useState(initial.toolBeforeAdmin)
  const [limits, setLimits] = useState<LoginLimitsDraft>(initial.limits)
  const [limitsProblem, setLimitsProblem] = useState<string | null>(null)
  const [straightChoice, setStraightChoice] = useState<boolean | null>(initial.straightChoice)
  const appLogins = useAppLogins(onCreateAppLogins, onReload, canManage)
  const [error, setError] = useState<string | null>(null)
  // Said next to the button that failed, not at the top of the panel.
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [newLoginError, setNewLoginError] = useState<string | null>(null)
  const [usernameHint, setUsernameHint] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [adding, setAdding] = useState<'database' | 'login' | null>(null)
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
    const nameProblem = managedIdentifierProblem(
      trimmed,
      'Database name',
      managedIdentifierMaxLength(engine)
    )
    if (nameProblem) {
      setDatabaseError(nameProblem)
      return
    }
    setWorking(true)
    setAdding('database')
    setDatabaseError(null)
    try {
      await onCreateDatabase(trimmed)
      setDbName('')
      await onReload()
    } catch (err) {
      setDatabaseError(managedErrorMessage(err, 'Failed to create database'))
    } finally {
      setWorking(false)
      setAdding(null)
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
    const nameProblem = managedIdentifierProblem(
      trimmed,
      'Username',
      managedIdentifierMaxLength(engine, nameScheme.selected)
    )
    if (nameProblem) {
      setNewLoginError(nameProblem)
      return
    }
    if (selectedDbs.length === 0) {
      setNewLoginError('Select at least one database.')
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
    setAdding('login')
    setNewLoginError(null)
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
      // Only the name is cleared: the next login usually wants the same choices.
      setUsername('')
      rememberSessionChoices<LoginFormChoices>(loginFormKey(orgId), {
        job,
        grantMode,
        tool,
        admin,
        toolBeforeAdmin,
        limits,
        straightChoice,
        nameScheme: nameScheme.requestScheme,
      })
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
        setNewLoginError(null)
      } else {
        setNewLoginError(message)
      }
    } finally {
      setWorking(false)
      setAdding(null)
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

  if (appLogins.result || revealedPassword) {
    return (
      <PasswordsPanel
        appLoginsResult={appLogins.result}
        onAppLoginsDone={appLogins.dismiss}
        username={revealedUsername}
        password={revealedPassword}
        onPasswordDone={() => {
          setRevealedPassword(null)
          setRevealedUsername(null)
        }}
        redeployRequired={redeployRequired}
        onRedeploy={onRedeployService}
        onDismissRedeploy={() => setRedeployRequired(null)}
      />
    )
  }

  // While a change applies (`busy`) the server refuses another one, so every
  // control waits, with an ApplyingNote saying so next to it.
  const disabled = busy || working || !canManage
  const appLoginsProblem = appLoginsSchemeProblem(nameScheme)

  return (
    <SectionPanel title="Users & databases" hint="Engine users and databases">
      <InlineError message={error} />
      <ApplyingNote shown={busy && canManage} text={EDITS_WAIT} />

      <Text style={styles.subheading}>Databases</Text>
      <View style={styles.list}>
        {databases.map((name) => {
          const bindingCount = bindingCountByDatabase.get(name) ?? 0
          const deleteBlocked = bindingCount > 0
          return (
            <Fragment key={name}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{name}</Text>
                {bindingCount > 0 ? (
                  <Text style={styles.connectedChip}>
                    Connected to {bindingCount} service
                    {bindingCount === 1 ? '' : 's'} — remove on Connect tab
                  </Text>
                ) : null}
                {canManage && deleteBlocked ? (
                  <Text style={panelStyles.muted}>Remove connections first ({bindingCount})</Text>
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
                <AppLoginsButton
                  appLogins={appLogins}
                  databaseName={name}
                  disabled={disabled}
                  problem={appLoginsProblem}
                />
              </View>
              <AppLoginsRowForm
                appLogins={appLogins}
                orgId={orgId}
                engine={engine}
                databaseName={name}
                servers={servers}
                disabled={disabled}
              />
            </Fragment>
          )
        })}
        <AppLoginsSchemeNote appLogins={appLogins} problem={appLoginsProblem} />
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
          <ApplyingNote shown={busy} text={FORM_WAITS} />
          <Button
            label="Add database"
            busyLabel="Adding…"
            variant="primary"
            busy={adding === 'database'}
            disabled={disabled}
            onPress={() => {
              void createDatabase()
            }}
          />
          <InlineError message={databaseError} />
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
                  engine={engine}
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
            <Text style={panelStyles.muted}>The owner of a database always reads and writes.</Text>
          ) : (
            <NewLoginJobField job={job} onJobChange={setJob} disabled={disabled} />
          )}
          <NewLoginAdminField
            engine={engine}
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
          <InlineError message={limitsProblem} />
          <NewLoginStraightThroughField
            engine={engine}
            choice={straightChoice}
            privileges={[admin ? MANAGED_ADMIN_PRIVILEGE : job]}
            limited={limits.limited}
            disabled={disabled}
            onChange={setStraightChoice}
          />
          <InlineError message={newLoginError} />
          <ApplyingNote shown={busy} text={FORM_WAITS} />
          <Button
            label="Create user"
            busyLabel="Creating…"
            variant="primary"
            busy={adding === 'login'}
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
  applying: {
    flexDirection: 'row',
    alignItems: 'center',
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
