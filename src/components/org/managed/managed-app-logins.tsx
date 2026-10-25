import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, CopyButton, TextField } from '@/components/ui'
import { LoginLimitsFields } from '@/components/org/managed/managed-login-limits'
import { NewLoginStraightThroughField } from '@/components/org/managed/managed-login-straight-through'
import type { ManagedAppLogin } from '@/lib/instance-api'
import {
  APP_LOGIN_ROLES,
  appLoginNames,
  appLoginPrefix,
  appLoginPrefixProblem,
  appLoginsCopyAllText,
  appLoginsErrorMessage,
  appLoginsOwnerNote,
  appLoginsRequestBody,
  plainAppLoginNotes,
} from '@/lib/managed-app-logins'
import {
  EMPTY_LIMITS_DRAFT,
  limitsFromDraft,
  type LimitServerName,
  type LoginLimitsDraft,
} from '@/lib/managed-login-limits'
import { recallSessionChoices, rememberSessionChoices } from '@/lib/session-choices'
import { colors, spacing } from '@/lib/theme'

export type AppLoginsBody = ReturnType<typeof appLoginsRequestBody>
export type AppLoginsResult = { logins: ManagedAppLogin[]; notes?: string[] }

/** The shared options the owner picked last time in this session. */
type AppLoginsChoices = { limits: LoginLimitsDraft; straightThrough: boolean }

const choicesKey = (orgId: string) => `managed-app-logins:${orgId}`

/**
 * "Add app logins" for one database: the prefix, then the connect-from limit,
 * the connection cap and the straight-through switch, chosen once for all
 * three logins. Starts with straight through on (PostgreSQL), which the usual
 * app drivers need.
 */
export function AppLoginsForm({
  orgId,
  engine,
  databaseName,
  servers,
  disabled,
  onSubmit,
  onCancel,
}: Readonly<{
  orgId: string
  engine: string | null | undefined
  databaseName: string
  servers: readonly LimitServerName[]
  disabled: boolean
  onSubmit: (databaseName: string, body: AppLoginsBody) => Promise<void>
  onCancel: () => void
}>) {
  const remembered = recallSessionChoices<AppLoginsChoices>(choicesKey(orgId))
  const [typedPrefix, setTypedPrefix] = useState('')
  const [limits, setLimits] = useState<LoginLimitsDraft>(remembered?.limits ?? EMPTY_LIMITS_DRAFT)
  const [straightThrough, setStraightThrough] = useState(remembered?.straightThrough ?? true)
  const [problem, setProblem] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const prefix = appLoginPrefix(typedPrefix, databaseName)
  const prefixProblem = appLoginPrefixProblem(prefix)
  const blocked = disabled || working

  const submit = async () => {
    if (prefixProblem) {
      setProblem(prefixProblem)
      return
    }
    const parsed = limitsFromDraft(limits)
    if (!parsed.ok) {
      setProblem(parsed.error)
      return
    }
    setProblem(null)
    setWorking(true)
    try {
      await onSubmit(
        databaseName,
        appLoginsRequestBody({
          engine,
          prefix,
          databaseName,
          ...parsed.payload,
          straightThrough,
        })
      )
      rememberSessionChoices<AppLoginsChoices>(choicesKey(orgId), { limits, straightThrough })
    } catch (err) {
      setProblem(appLoginsErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <View style={styles.form}>
      <Text style={panelStyles.detailTitle}>Add app logins for {databaseName}</Text>
      <Text style={panelStyles.muted}>
        Three logins on this database only, with these exact names and the same options.
      </Text>
      <TextField
        label="Name prefix"
        value={typedPrefix}
        onChangeText={(value) => {
          setTypedPrefix(value)
          setProblem(null)
        }}
        placeholder={databaseName}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!blocked}
      />
      <View style={styles.list}>
        {appLoginNames(prefix).map((name, index) => (
          <Text key={name} style={panelStyles.muted}>
            <Text style={styles.name}>{name}</Text> · {APP_LOGIN_ROLES[index]?.label}
          </Text>
        ))}
      </View>
      <Text style={panelStyles.muted}>{appLoginsOwnerNote(engine)}</Text>
      <LoginLimitsFields
        draft={limits}
        onChange={(next) => {
          setLimits(next)
          setProblem(null)
        }}
        servers={servers}
        disabled={blocked}
      />
      <NewLoginStraightThroughField
        engine={engine}
        choice={straightThrough}
        privileges={[]}
        limited={limits.limited}
        disabled={blocked}
        onChange={setStraightThrough}
      />
      {problem ? <Text style={panelStyles.error}>{problem}</Text> : null}
      <ButtonRow>
        <Button
          label="Add 3 logins"
          busyLabel="Adding…"
          variant="primary"
          busy={working}
          disabled={blocked}
          onPress={() => {
            void submit()
          }}
        />
        <Button label="Cancel" disabled={working} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

type CreateAppLogins = (databaseName: string, body: AppLoginsBody) => Promise<AppLoginsResult>

/**
 * State of the "Add app logins" action on a screen: which database has its
 * form open, and the result waiting to be shown. No action when `create` is
 * absent or the viewer may not manage logins (`allowed` false).
 */
export function useAppLogins(
  create: CreateAppLogins | undefined,
  onReload: () => Promise<void>,
  allowed = true
) {
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [result, setResult] = useState<AppLoginsResult | null>(null)
  return {
    enabled: allowed && create !== undefined,
    openFor,
    open: (databaseName: string) => setOpenFor(databaseName),
    close: () => setOpenFor(null),
    result,
    dismiss: () => setResult(null),
    submit: async (databaseName: string, body: AppLoginsBody) => {
      if (!create) return
      const made = await create(databaseName, body)
      setOpenFor(null)
      setResult(made)
      await onReload()
    },
  }
}

export type AppLoginsState = ReturnType<typeof useAppLogins>

/** The per-database button; nothing when the action is not offered. */
export function AppLoginsButton({
  appLogins,
  databaseName,
  disabled,
  problem,
}: Readonly<{
  appLogins: AppLoginsState
  databaseName: string
  disabled: boolean
  problem: string | null
}>) {
  if (!appLogins.enabled) return null
  return (
    <Button
      label="Add app logins"
      size="sm"
      disabled={disabled || problem !== null || appLogins.openFor === databaseName}
      onPress={() => appLogins.open(databaseName)}
    />
  )
}

/** The form under a database row, while it is open for that database. */
export function AppLoginsRowForm({
  appLogins,
  databaseName,
  ...form
}: Readonly<
  { appLogins: AppLoginsState; databaseName: string } & Omit<
    Parameters<typeof AppLoginsForm>[0],
    'databaseName' | 'onSubmit' | 'onCancel'
  >
>) {
  if (!appLogins.enabled || appLogins.openFor !== databaseName) return null
  return (
    <AppLoginsForm
      {...form}
      databaseName={databaseName}
      onSubmit={appLogins.submit}
      onCancel={appLogins.close}
    />
  )
}

/** Why the action is unavailable (a locked name scheme), when it is. */
export function AppLoginsSchemeNote({
  appLogins,
  problem,
}: Readonly<{ appLogins: AppLoginsState; problem: string | null }>) {
  if (!appLogins.enabled || !problem) return null
  return <Text style={panelStyles.muted}>{problem}</Text>
}

const SHOW_ONCE_WARNING = 'These passwords are shown once. You will not be able to see them again.'

/** One list of the new logins and their show-once passwords, instead of one reveal per login. */
export function AppLoginsPasswords({
  result,
  onDone,
}: Readonly<{ result: AppLoginsResult; onDone: () => void }>) {
  // Defensive: a login the server could not read back is left out rather than breaking the list.
  const logins = result.logins.filter((entry) => entry.user != null)
  return (
    <View style={styles.form}>
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>{SHOW_ONCE_WARNING}</Text>
      </View>
      {logins.map(({ user, password }) => (
        <View key={user.id} style={styles.secretRow}>
          <Text style={panelStyles.detailLabel}>{user.appliedUsername}</Text>
          <View style={panelStyles.commandCodeBlock}>
            <Text style={styles.name} selectable>
              {password}
            </Text>
          </View>
          <CopyButton
            value={password}
            label="Copy password"
            accessibilityLabel={`Copy the password of ${user.appliedUsername}`}
          />
        </View>
      ))}
      {plainAppLoginNotes(result.notes).map((note) => (
        <Text key={note} style={panelStyles.muted}>
          {note}
        </Text>
      ))}
      <ButtonRow>
        <CopyButton value={appLoginsCopyAllText(logins)} label="Copy all" size="md" />
        <Button label="Done" variant="primary" onPress={onDone} />
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  secretRow: {
    gap: spacing.xs,
  },
})
