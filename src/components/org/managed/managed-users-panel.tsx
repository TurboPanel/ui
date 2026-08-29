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
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type { BindingRedeployRequired } from '@/lib/instance-api'
import {
  managedErrorMessage,
  type ManagedConnectionRole,
  type ManagedUserRecord,
} from '@/lib/managed-services'
import { useManagedEnvironmentBindings } from '@/lib/queries/bindings'
import { orEmptyArray } from '@/lib/or-empty-array'
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

const CONNECTION_ROLE_OPTIONS: readonly {
  value: ManagedConnectionRole
  label: string
  hint: string
}[] = [
  {
    value: 'read-write',
    label: 'Read/write',
    hint: 'Routed to the current primary — reads and writes both follow failover.',
  },
  {
    value: 'read-only',
    label: 'Read-only',
    hint: 'Routed to replicas that serve read traffic. The engine refuses writes on this login.',
  },
]

/**
 * The role decides the login's proxy hostgroup. It is a per-credential choice
 * on purpose: TurboPanel never moves an existing login's `SELECT`s to a replica
 * behind an application's back.
 */
function ConnectionRolePicker({
  value,
  onChange,
  disabled,
  readOnlyAvailable,
}: Readonly<{
  value: ManagedConnectionRole
  onChange: (role: ManagedConnectionRole) => void
  disabled: boolean
  readOnlyAvailable: boolean
}>) {
  const active = CONNECTION_ROLE_OPTIONS.find((row) => row.value === value)
  return (
    <>
      <Text style={panelStyles.detailLabel}>Connection role</Text>
      <SegmentedControl
        options={CONNECTION_ROLE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          // With no read-eligible replica only the Read-only option locks;
          // Read/write stays selectable.
          disabled: option.value === 'read-only' && !readOnlyAvailable,
        }))}
        value={value}
        onChange={onChange}
        disabled={disabled}
        accessibilityLabel="Connection role"
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
      {readOnlyAvailable ? null : (
        <Text style={panelStyles.muted}>
          Read-only needs a replica with read traffic enabled — add one on
          Overview first.
        </Text>
      )}
    </>
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
  databases,
  users,
  canManage,
  busy,
  hasReadTargets = false,
  onCreateDatabase,
  onDeleteDatabase,
  onCreateUser,
  onDeleteUser,
  onRotateUserPassword,
  onRedeployService,
  onReload,
}: Readonly<{
  orgId: string
  environmentId: string
  databases: string[]
  users: ManagedUserRecord[]
  canManage: boolean
  busy: boolean
  /** A replica serves read traffic, so a `read-only` login has somewhere to go. */
  hasReadTargets?: boolean
  onCreateDatabase: (name: string) => Promise<void>
  onDeleteDatabase: (name: string) => Promise<void>
  onCreateUser: (input: {
    username: string
    databases: string[]
    connectionRole: ManagedConnectionRole
  }) => Promise<{ password: string } | null>
  onDeleteUser: (principalId: string) => Promise<void>
  onRotateUserPassword: (principalId: string) => Promise<{
    password: string
    redeployRequired?: BindingRedeployRequired
  } | null>
  onRedeployService: (environmentId: string) => Promise<void>
  onReload: () => Promise<void>
}>) {
  const bindingsQuery = useManagedEnvironmentBindings(orgId, environmentId)
  const [dbName, setDbName] = useState('')
  const [username, setUsername] = useState('')
  const [selectedDbs, setSelectedDbs] = useState<string[]>([])
  const [connectionRole, setConnectionRole] =
    useState<ManagedConnectionRole>('read-write')
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
      map.set(binding.principalId, (map.get(binding.principalId) ?? 0) + 1)
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

  useEffect(() => {
    if (!hasReadTargets) {
      setConnectionRole('read-write')
    }
  }, [hasReadTargets])

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
    setWorking(true)
    setError(null)
    setUsernameHint(null)
    try {
      const result = await onCreateUser({
        username: trimmed,
        databases: selectedDbs,
        connectionRole,
      })
      if (result?.password) {
        setRevealedUsername(trimmed)
        setRevealedPassword(result.password)
      }
      setUsername('')
      setConnectionRole('read-write')
      await onReload()
    } catch (err) {
      const message = managedErrorMessage(err, 'Failed to create user')
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

  const deleteUser = async (principalId: string) => {
    setWorking(true)
    setError(null)
    try {
      await onDeleteUser(principalId)
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete user'))
    } finally {
      setWorking(false)
    }
  }

  const rotateUser = async (principalId: string, uname: string) => {
    setWorking(true)
    setError(null)
    try {
      const result = await onRotateUserPassword(principalId)
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
              <Text style={styles.rowLabel}>{user.username}</Text>
              <View style={styles.chipRow}>
                {user.databases.map((db) => (
                  <Chip key={db} label={db} />
                ))}
              </View>
              <Text style={panelStyles.muted}>
                {user.connectionRole === 'read-only'
                  ? 'Read-only login — routed to replicas serving reads'
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
                <ButtonRow>
                  <Button
                    label="Rotate password"
                    size="sm"
                    disabled={disabled}
                    onPress={() => {
                      void rotateUser(user.id, user.username)
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
          <ConnectionRolePicker
            value={connectionRole}
            onChange={setConnectionRole}
            disabled={disabled}
            readOnlyAvailable={hasReadTargets}
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
    color: chrome.accent,
  },
  createUser: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  connectedChip: {
    color: chrome.accent,
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
