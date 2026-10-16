import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ModalSheet,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
  describeCap,
  describeWhere,
  draftFromStored,
  isLimited,
  limitsFromDraft,
  payloadFromStored,
  sameLimits,
  sameSources,
  serverLabel,
  type LimitServerName,
  type LoginLimitsDraft,
} from '@/lib/managed-login-limits'
import { managedErrorMessage, type ManagedUserRecord } from '@/lib/managed-services'
import { spacing } from '@/lib/theme'

export const WHERE_LABEL = 'Where can this login connect from?'
export const CAP_LABEL = 'Most connections at once'

export const WHERE_OPTIONS = [
  { value: 'anywhere', label: 'Anywhere' },
  { value: 'limited', label: 'Only from chosen places' },
] as const

export const BLOCKED_NOTE =
  'A blocked address can still connect. Every query it sends is then refused with “This login is not allowed from this address”, so a database tool may look connected and then fail at once.'

export const THIS_SERVER_NOTE =
  'A program on the database server that connects to the server’s own public address counts as “this server” only if that server is also picked from the server list.'

/** Badges for a limited login; nothing for one that can connect from anywhere with no cap. */
export function LoginLimitBadges({ user }: Readonly<{ user: ManagedUserRecord }>) {
  const limited = isLimited(user.allowedSources)
  if (!limited && !user.maxConnections) return null
  return (
    <View style={styles.badgeRow}>
      {limited ? <Badge label="Limited places" tone="info" /> : null}
      {user.maxConnections ? (
        <Badge label={`Max ${user.maxConnections} connections`} tone="info" />
      ) : null}
    </View>
  )
}

/** The where-from choice, the places and the connection cap. Used by the new-login form and the editor. */
export function LoginLimitsFields({
  draft,
  onChange,
  servers,
  disabled,
  label,
}: Readonly<{
  draft: LoginLimitsDraft
  onChange: (next: LoginLimitsDraft) => void
  servers: readonly LimitServerName[]
  disabled: boolean
  /** Distinguishes controls when several logins are on screen. */
  label?: string
}>) {
  const suffix = label ? `: ${label}` : ''
  // A chosen server that is not in the list (still loading, or deleted) stays visible so it can be unticked.
  const choices = [
    ...servers,
    ...draft.serverIds
      .filter((id) => !servers.some((server) => server.id === id))
      .map((id) => ({ id, name: `Unknown server ${id}`, hostname: null })),
  ]
  const toggleServer = (id: string) =>
    onChange({
      ...draft,
      serverIds: draft.serverIds.includes(id)
        ? draft.serverIds.filter((row) => row !== id)
        : [...draft.serverIds, id],
    })
  return (
    <View style={styles.fields}>
      <Text style={panelStyles.detailLabel}>{WHERE_LABEL}</Text>
      <SegmentedControl
        options={WHERE_OPTIONS.map(({ value, label: text }) => ({ value, label: text }))}
        value={draft.limited ? 'limited' : 'anywhere'}
        onChange={(value) => onChange({ ...draft, limited: value === 'limited' })}
        disabled={disabled}
        accessibilityLabel={`${WHERE_LABEL}${suffix}`}
      />
      {draft.limited ? (
        <View style={styles.places}>
          <Text style={panelStyles.muted}>{BLOCKED_NOTE}</Text>
          <Checkbox
            checked={draft.internal}
            disabled={disabled}
            label="This server and its containers"
            accessibilityLabel={`This server and its containers${suffix}`}
            onPress={() => onChange({ ...draft, internal: !draft.internal })}
          />
          <Text style={panelStyles.muted}>{THIS_SERVER_NOTE}</Text>
          <Text style={panelStyles.detailLabel}>Servers in this organization</Text>
          {choices.length === 0 ? (
            <Text style={panelStyles.muted}>No servers to pick.</Text>
          ) : (
            choices.map((server) => (
              <Checkbox
                key={server.id}
                checked={draft.serverIds.includes(server.id)}
                disabled={disabled}
                label={serverLabel(server)}
                accessibilityLabel={`Server ${serverLabel(server)}${suffix}`}
                onPress={() => toggleServer(server.id)}
              />
            ))
          )}
          <TextField
            label="Specific addresses or ranges"
            hint="One per line or separated by commas: an address such as 203.0.113.7, a prefix such as 203.0.113.%, or a range such as 203.0.0.0/16."
            value={draft.addresses}
            onChangeText={(addresses) => onChange({ ...draft, addresses })}
            placeholder="203.0.113.%"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={3}
            editable={!disabled}
            accessibilityLabel={`Specific addresses or ranges${suffix}`}
          />
        </View>
      ) : null}
      <TextField
        label={`${CAP_LABEL} (optional)`}
        hint="Leave empty for no limit. The next connection past this number is refused."
        value={draft.maxConnections}
        onChangeText={(maxConnections) => onChange({ ...draft, maxConnections })}
        placeholder="No limit"
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        accessibilityLabel={`${CAP_LABEL}${suffix}`}
      />
    </View>
  )
}

type PendingLimits = {
  body: ManagedUserPatch
  where: string
  cap: string
  limited: boolean
  statements: string[]
}

/** Shows a login's limits and changes them: preview, confirm in plain words, then save. */
export function LoginLimitsEditor({
  user,
  servers,
  disabled,
  onUpdate,
  onError,
}: Readonly<{
  user: ManagedUserRecord
  servers: readonly LimitServerName[]
  disabled: boolean
  onUpdate: (principalId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onError: (message: string | null) => void
}>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LoginLimitsDraft>(() =>
    draftFromStored(user.allowedSources, user.maxConnections),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingLimits | null>(null)
  const [busy, setBusy] = useState(false)
  const blocked = disabled || busy

  const startEditing = () => {
    setDraft(draftFromStored(user.allowedSources, user.maxConnections))
    setProblem(null)
    setEditing(true)
  }

  const preview = async () => {
    const result = limitsFromDraft(draft)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    if (sameLimits(result.payload, payloadFromStored(user.allowedSources, user.maxConnections))) {
      setProblem('Nothing has changed.')
      return
    }
    setProblem(null)
    setBusy(true)
    onError(null)
    try {
      const stored = payloadFromStored(user.allowedSources, user.maxConnections)
      const body: ManagedUserPatch = {
        ...(sameSources(result.payload, stored) ? {} : { allowedSources: result.payload.allowedSources }),
        ...((result.payload.maxConnections ?? null) === (stored.maxConnections ?? null)
          ? {}
          : { maxConnections: result.payload.maxConnections }),
      }
      const answer = await onUpdate(user.id, { ...body, dryRun: true })
      setPending({
        body,
        where: describeWhere(result.payload.allowedSources, servers),
        cap: describeCap(result.payload.maxConnections),
        limited: result.payload.allowedSources !== null,
        statements: answer.statements ?? [],
      })
    } catch (err) {
      setProblem(managedErrorMessage(err, 'Failed to preview the change'))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!pending) return
    setBusy(true)
    onError(null)
    try {
      await onUpdate(user.id, pending.body)
      setPending(null)
      setEditing(false)
    } catch (err) {
      setPending(null)
      setProblem(managedErrorMessage(err, 'Failed to save the change'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.editor}>
      <Text style={panelStyles.muted}>
        {`${describeWhere(user.allowedSources, servers)} ${describeCap(user.maxConnections)}`}
      </Text>
      {editing ? (
        <>
          <LoginLimitsFields
            draft={draft}
            onChange={setDraft}
            servers={servers}
            disabled={blocked}
            label={user.username}
          />
          {problem ? <Text style={panelStyles.error}>{problem}</Text> : null}
          <ButtonRow>
            <Button label="Cancel" size="sm" disabled={busy} onPress={() => setEditing(false)} />
            <Button
              label="Review change"
              busyLabel="Checking…"
              size="sm"
              variant="primary"
              busy={busy}
              disabled={disabled}
              onPress={() => {
                void preview()
              }}
            />
          </ButtonRow>
        </>
      ) : (
        <ButtonRow>
          <Button
            label="Change where it connects from"
            size="sm"
            disabled={blocked}
            accessibilityLabel={`Change where ${user.username} connects from`}
            onPress={startEditing}
          />
        </ButtonRow>
      )}
      <ModalSheet
        visible={pending !== null}
        title="Change where this login connects from?"
        onRequestClose={() => {
          if (!busy) setPending(null)
        }}
        footer={
          <ButtonRow align="end">
            <Button label="Cancel" disabled={busy} onPress={() => setPending(null)} />
            <Button
              label="Save change"
              busyLabel="Saving…"
              variant="primary"
              busy={busy}
              onPress={() => {
                void apply()
              }}
            />
          </ButtonRow>
        }
      >
        <Text style={panelStyles.detailLabel}>After this change</Text>
        <Text style={panelStyles.muted}>{pending?.where}</Text>
        <Text style={panelStyles.muted}>{pending?.cap}</Text>
        {pending?.limited ? (
          <View style={panelStyles.calloutWarning}>
            <Text style={panelStyles.calloutWarningText}>{BLOCKED_NOTE}</Text>
          </View>
        ) : null}
        {pending?.limited ? <Text style={panelStyles.muted}>{THIS_SERVER_NOTE}</Text> : null}
        {pending?.statements.length ? (
          <>
            <Text style={panelStyles.detailLabel}>What the panel will do</Text>
            {pending.statements.map((line, index) => (
              <Text key={`${index}-${line}`} style={panelStyles.muted}>
                {`• ${line}`}
              </Text>
            ))}
          </>
        ) : null}
      </ModalSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  fields: { gap: spacing.xs },
  places: { gap: spacing.xs },
  editor: { gap: spacing.xs },
})
