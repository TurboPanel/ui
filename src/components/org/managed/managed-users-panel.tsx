import { useEffect, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  managedErrorMessage,
  type ManagedUserRecord,
} from '@/lib/managed-services'
import { chrome, colors, spacing } from '@/lib/theme'

const USERNAME_PATTERN = /^[a-zA-Z_]\w{0,62}$/
const DATABASE_PATTERN = /^[a-zA-Z_]\w{0,62}$/

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

function Chip({ label }: Readonly<{ label: string }>) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

function DeleteActions({
  armed,
  disabled,
  onConfirm,
  onCancel,
  onArm,
  buttonStyle,
}: Readonly<{
  armed: boolean
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
  onArm: () => void
  buttonStyle?: StyleProp<ViewStyle>
}>) {
  if (armed) {
    return (
      <View style={styles.rowActions}>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onConfirm}
        >
          <Text style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}>
            Confirm delete
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer, buttonStyle]}
      disabled={disabled}
      onPress={onArm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Delete</Text>
    </Pressable>
  )
}

export function ManagedUsersPanel({
  databases,
  users,
  canManage,
  busy,
  onCreateDatabase,
  onDeleteDatabase,
  onCreateUser,
  onDeleteUser,
  onReload,
}: Readonly<{
  databases: string[]
  users: ManagedUserRecord[]
  canManage: boolean
  busy: boolean
  onCreateDatabase: (name: string) => Promise<void>
  onDeleteDatabase: (name: string) => Promise<void>
  onCreateUser: (input: {
    username: string
    databases: string[]
  }) => Promise<{ password: string } | null>
  onDeleteUser: (principalId: string) => Promise<void>
  onReload: () => Promise<void>
}>) {
  const [dbName, setDbName] = useState('')
  const [username, setUsername] = useState('')
  const [selectedDbs, setSelectedDbs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [deleteArmedDb, setDeleteArmedDb] = useState<string | null>(null)
  const [deleteArmedUser, setDeleteArmedUser] = useState<string | null>(null)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [revealedUsername, setRevealedUsername] = useState<string | null>(null)

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
      setDeleteArmedDb(null)
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete database'))
      setDeleteArmedDb(null)
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
    try {
      const result = await onCreateUser({
        username: trimmed,
        databases: selectedDbs,
      })
      if (result?.password) {
        setRevealedUsername(trimmed)
        setRevealedPassword(result.password)
      }
      setUsername('')
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to create user'))
    } finally {
      setWorking(false)
    }
  }

  const deleteUser = async (principalId: string) => {
    setWorking(true)
    setError(null)
    try {
      await onDeleteUser(principalId)
      setDeleteArmedUser(null)
      await onReload()
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to delete user'))
      setDeleteArmedUser(null)
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
      </SectionPanel>
    )
  }

  const disabled = busy || working || !canManage

  return (
    <SectionPanel title="Users & databases" hint="Engine users and databases">
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <Text style={styles.subheading}>Databases</Text>
      <View style={styles.list}>
        {databases.map((name) => (
          <View key={name} style={styles.row}>
            <Text style={styles.rowLabel}>{name}</Text>
            {canManage ? (
              <DeleteActions
                armed={deleteArmedDb === name}
                disabled={disabled}
                onConfirm={() => {
                  void deleteDatabase(name)
                }}
                onCancel={() => setDeleteArmedDb(null)}
                onArm={() => setDeleteArmedDb(name)}
              />
            ) : null}
          </View>
        ))}
      </View>

      {canManage ? (
        <View style={styles.formRow}>
          <TextInput
            style={Platform.OS === 'web' ? webInputStyle : styles.input}
            value={dbName}
            onChangeText={setDbName}
            placeholder="database_name"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
          />
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              webPointer,
              disabled && styles.disabled,
            ]}
            disabled={disabled}
            onPress={() => {
              void createDatabase()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Add database</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.subheading}>Users</Text>
      <View style={styles.list}>
        {users.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <Text style={styles.rowLabel}>{user.username}</Text>
            <View style={styles.chipRow}>
              {user.databases.map((db) => (
                <Chip key={db} label={db} />
              ))}
            </View>
            {user.privileges.length > 0 ? (
              <Text style={orgPanelStyles.muted}>
                {user.privileges.join(', ')}
              </Text>
            ) : null}
            {canManage ? (
              <DeleteActions
                armed={deleteArmedUser === user.id}
                disabled={disabled}
                onConfirm={() => {
                  void deleteUser(user.id)
                }}
                onCancel={() => setDeleteArmedUser(null)}
                onArm={() => setDeleteArmedUser(user.id)}
                buttonStyle={styles.deleteBtn}
              />
            ) : null}
          </View>
        ))}
        {users.length === 0 ? (
          <Text style={orgPanelStyles.muted}>No additional users yet.</Text>
        ) : null}
      </View>

      {canManage ? (
        <View style={styles.createUser}>
          <TextInput
            style={Platform.OS === 'web' ? webInputStyle : styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
          />
          <Text style={orgPanelStyles.detailLabel}>Databases</Text>
          <View style={styles.chipRow}>
            {databases.map((name) => {
              const selected = selectedDbs.includes(name)
              return (
                <Pressable
                  key={name}
                  style={[styles.chip, selected && styles.chipSelected, webPointer]}
                  onPress={() => toggleDb(name)}
                  disabled={disabled}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              webPointer,
              disabled && styles.disabled,
            ]}
            disabled={disabled}
            onPress={() => {
              void createUser()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Create user</Text>
          </Pressable>
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
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  formRow: {
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
  deleteBtn: {
    alignSelf: 'flex-start',
  },
  danger: {
    color: colors.error,
  },
  disabled: {
    opacity: 0.55,
  },
})
