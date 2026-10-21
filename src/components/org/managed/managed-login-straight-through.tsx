import { StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { PreviewSheet, usePreviewedChange } from '@/components/org/managed/managed-login-preview'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import { isLimited } from '@/lib/managed-login-limits'
import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  STRAIGHT_THROUGH_DEFAULT_HINT,
  STRAIGHT_THROUGH_HELP,
  STRAIGHT_THROUGH_LABEL,
  STRAIGHT_THROUGH_LIMITED_HINT,
} from '@/lib/managed-straight-through'
import { spacing } from '@/lib/theme'

/** The switch with its help text, the "default" hint and the limited-login hint. Controlled. */
export function StraightThroughSwitch({
  value,
  isDefault,
  limited,
  disabled,
  busy = false,
  onChange,
  label,
}: Readonly<{
  value: boolean
  /** True when the shown value is the default (the owner never chose). */
  isDefault: boolean
  /** A source limit forces the switch off and disables it. */
  limited: boolean
  disabled: boolean
  busy?: boolean
  onChange: (next: boolean) => void
  /** Distinguishes controls when several logins are on screen. */
  label?: string
}>) {
  const shown = limited ? false : value
  return (
    <View style={styles.wrap}>
      <SettingRow
        label={STRAIGHT_THROUGH_LABEL}
        description={limited ? STRAIGHT_THROUGH_LIMITED_HINT : STRAIGHT_THROUGH_HELP}
      >
        <View style={styles.control}>
          <Toggle
            value={shown}
            disabled={disabled || limited}
            busy={busy}
            accessibilityLabel={
              label ? `${STRAIGHT_THROUGH_LABEL}: ${label}` : STRAIGHT_THROUGH_LABEL
            }
            onValueChange={onChange}
          />
          {isDefault && !limited ? (
            <Text style={panelStyles.muted}>{STRAIGHT_THROUGH_DEFAULT_HINT}</Text>
          ) : null}
        </View>
      </SettingRow>
    </View>
  )
}

/** Switch for an existing PostgreSQL login: preview, confirm, save. "Use default" sends `null`. */
export function LoginStraightThroughEditor({
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
  const change = usePreviewedChange<boolean | null>(user.id, onUpdate, onError, {
    preview: 'Failed to preview the change',
    apply: 'Failed to change how this login connects',
  })
  const { pending, busy } = change
  const limited = isLimited(user.allowedSources)
  const isDefault = user.straightThroughDefault !== false
  const value = user.straightThrough === true
  return (
    <View style={styles.wrap}>
      <StraightThroughSwitch
        value={value}
        isDefault={isDefault}
        limited={limited}
        disabled={disabled || busy}
        label={user.username}
        onChange={(next) => {
          void change.preview(next, { straightThrough: next })
        }}
      />
      {!isDefault && !limited ? (
        <ButtonRow>
          <Button
            label="Use default"
            size="sm"
            disabled={disabled || busy}
            accessibilityLabel={`Use the default for ${user.username}`}
            onPress={() => {
              void change.preview(null, { straightThrough: null })
            }}
          />
        </ButtonRow>
      ) : null}
      <PreviewSheet
        visible={pending !== null}
        title={
          pending?.value === null
            ? 'Go back to the default?'
            : `Turn ${pending?.value ? 'on' : 'off'} connecting straight through?`
        }
        description={STRAIGHT_THROUGH_HELP}
        statements={pending?.statements ?? []}
        busy={busy}
        onCancel={change.cancel}
        onConfirm={() => {
          void change.apply()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  control: { alignItems: 'flex-end', gap: spacing.xs },
})
