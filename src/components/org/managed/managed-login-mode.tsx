import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  ModalSheet,
  SegmentedControl,
  SettingRow,
  Toggle,
} from '@/components/ui'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import {
  managedErrorMessage,
  type ManagedGrantMode,
  type ManagedUserRecord,
} from '@/lib/managed-services'
import { spacing } from '@/lib/theme'

export type LoginMode = 'recipe' | 'self'

export const TOOL_LABEL = 'Used by a database tool'
export const TOOL_HINT =
  'A database tool (a desktop client or an admin tool) always connects to the primary. Its queries are never split between a reader and a writer. This does not change what the login is allowed to do.'

export const MODE_OPTIONS: readonly { value: LoginMode; label: string; hint: string }[] = [
  {
    value: 'recipe',
    label: 'Let the panel manage permissions',
    hint: 'The panel sets this login’s permissions and puts them back whenever it applies changes.',
  },
  {
    value: 'self',
    label: 'Manage permissions myself',
    hint: 'You set permissions in your own tools. The panel never resets them. Password changes still go through the panel.',
  },
]

export const READ_ONLY_HINT =
  'Read-only means the database refuses every write on this login. Without a replica serving reads it connects to the primary and can only read. With one, its reads go to the replicas.'

/** The two modes a login can be switched between; an old `preset` login shows as panel-managed. */
export function loginMode(user: Pick<ManagedUserRecord, 'grantMode'>): LoginMode {
  return user.grantMode === 'self' ? 'self' : 'recipe'
}

export function modeBadgeLabel(grantMode: ManagedGrantMode | undefined): string {
  return grantMode === 'self' ? 'You manage permissions' : 'Panel manages permissions'
}

/** The badges shown on a login in the list. */
export function LoginModeBadges({ user }: Readonly<{ user: ManagedUserRecord }>) {
  return (
    <View style={styles.badgeRow}>
      <Badge
        label={modeBadgeLabel(user.grantMode)}
        tone={user.grantMode === 'self' ? 'info' : 'muted'}
      />
      {user.tool ? <Badge label="Database tool" tone="info" /> : null}
    </View>
  )
}

/** Mode picker and tool switch shown while creating a login. */
export function NewLoginModeFields({
  mode,
  onModeChange,
  tool,
  onToolChange,
  disabled,
}: Readonly<{
  mode: LoginMode
  onModeChange: (mode: LoginMode) => void
  tool: boolean
  onToolChange: (tool: boolean) => void
  disabled: boolean
}>) {
  const active = MODE_OPTIONS.find((row) => row.value === mode)
  return (
    <>
      <Text style={panelStyles.detailLabel}>Permissions</Text>
      <SegmentedControl
        options={MODE_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={mode}
        onChange={onModeChange}
        disabled={disabled}
        accessibilityLabel="Permission mode"
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
      <SettingRow label={TOOL_LABEL} description={TOOL_HINT}>
        <Toggle
          value={tool}
          disabled={disabled}
          onLabel="Yes"
          offLabel="No"
          accessibilityLabel={TOOL_LABEL}
          onValueChange={onToolChange}
        />
      </SettingRow>
    </>
  )
}

function isResetNeeded(err: unknown): boolean {
  return err instanceof Error && err.message.includes('managed_grant_reset_needs_confirm')
}

type PendingSwitch = {
  mode: LoginMode
  statements: string[]
  /** The server asked for an explicit reset confirmation. */
  needsReset: boolean
}

function resetWarning(user: ManagedUserRecord, to: LoginMode): string {
  if (to === 'recipe') {
    return 'The panel will set this login’s permissions back to its own rules. Anything you set yourself in your own tools is replaced.'
  }
  if (user.connectionRole === 'read-only') {
    return 'This is a read-only login. Its read-only setting stays in place until you reset it by hand in your own tools; the panel will no longer change it.'
  }
  return 'The panel will stop managing this login’s permissions.'
}

/** Mode picker and tool switch for an existing login, with the preview-then-confirm switch. */
export function LoginModeEditor({
  user,
  disabled,
  onUpdate,
  onError,
}: Readonly<{
  user: ManagedUserRecord
  disabled: boolean
  onUpdate: (loginId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onError: (message: string | null) => void
}>) {
  const [pending, setPending] = useState<PendingSwitch | null>(null)
  const [busy, setBusy] = useState(false)
  const current = loginMode(user)

  const preview = async (mode: LoginMode) => {
    setBusy(true)
    onError(null)
    try {
      let needsReset = false
      let result: ManagedUserPatchResult
      try {
        result = await onUpdate(user.id, { grantMode: mode, dryRun: true })
      } catch (err) {
        if (!isResetNeeded(err)) throw err
        needsReset = true
        result = await onUpdate(user.id, { grantMode: mode, dryRun: true, confirmReset: true })
      }
      setPending({ mode, statements: result.statements ?? [], needsReset })
    } catch (err) {
      onError(managedErrorMessage(err, 'Failed to preview the permission change'))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!pending) return
    setBusy(true)
    onError(null)
    try {
      await onUpdate(user.id, {
        grantMode: pending.mode,
        ...(pending.needsReset ? { confirmReset: true } : {}),
      })
      setPending(null)
    } catch (err) {
      if (isResetNeeded(err) && !pending.needsReset) {
        // The state changed since the preview: ask again with the reset warning.
        setPending({ ...pending, needsReset: true })
        return
      }
      setPending(null)
      onError(managedErrorMessage(err, 'Failed to change the permission mode'))
    } finally {
      setBusy(false)
    }
  }

  const setTool = async (tool: boolean) => {
    setBusy(true)
    onError(null)
    try {
      await onUpdate(user.id, { tool })
    } catch (err) {
      onError(managedErrorMessage(err, 'Failed to change the database tool setting'))
    } finally {
      setBusy(false)
    }
  }

  const blocked = disabled || busy
  const active = MODE_OPTIONS.find((row) => row.value === current)
  return (
    <View style={styles.editor}>
      <SegmentedControl
        options={MODE_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={current}
        onChange={(mode) => {
          if (mode !== current) void preview(mode)
        }}
        disabled={blocked}
        accessibilityLabel={`Permission mode for ${user.username}`}
      />
      {active ? <Text style={panelStyles.muted}>{active.hint}</Text> : null}
      <SettingRow label={TOOL_LABEL} description={TOOL_HINT}>
        <Toggle
          value={user.tool === true}
          disabled={blocked}
          busy={busy}
          onLabel="Yes"
          offLabel="No"
          accessibilityLabel={`${TOOL_LABEL}: ${user.username}`}
          onValueChange={(next) => {
            void setTool(next)
          }}
        />
      </SettingRow>
      <ModalSheet
        visible={pending !== null}
        title={
          pending?.mode === 'self'
            ? 'Manage permissions yourself?'
            : 'Let the panel manage permissions?'
        }
        description={pending?.needsReset ? resetWarning(user, pending.mode) : undefined}
        onRequestClose={() => setPending(null)}
        footer={
          <ButtonRow align="end">
            <Button label="Cancel" disabled={busy} onPress={() => setPending(null)} />
            <Button
              label={pending?.needsReset ? 'Confirm and switch' : 'Switch'}
              busyLabel="Switching…"
              variant="primary"
              busy={busy}
              onPress={() => {
                void apply()
              }}
            />
          </ButtonRow>
        }
      >
        <Text style={panelStyles.detailLabel}>What the panel will run</Text>
        {pending?.statements.length ? (
          pending.statements.map((line, index) => (
            <Text key={`${index}-${line}`} style={panelStyles.muted}>
              {`• ${line}`}
            </Text>
          ))
        ) : (
          <Text style={panelStyles.muted}>Nothing to run; only the setting is saved.</Text>
        )}
      </ModalSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  editor: { gap: spacing.xs },
})
