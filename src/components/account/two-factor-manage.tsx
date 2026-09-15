import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BackupCodesSheet } from '@/components/account/backup-codes-sheet'
import { StepUpPasswordField } from '@/components/account/step-up-password-field'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  InlineNotice,
  TextField,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { TwoFactorStatus } from '@/lib/instance-api'
import {
  useDisableTwoFactor,
  useRegenerateBackupCodes,
} from '@/lib/queries/auth'
import {
  optionalPassword,
  securityActionMessage,
  securityActionNeedsPassword,
} from '@/lib/security-actions'
import {
  backupCodesLabel,
  backupCodesRunningLow,
  twoFactorStatusLabel,
} from '@/lib/security-display'
import { spacing } from '@/lib/theme'
import { normalizeTwoFactorCode } from '@/lib/two-factor-prompt'

/**
 * Management view once a second factor is enrolled.
 *
 * Both actions here are step-up protected and both are consequential, so they
 * share one password field rather than each growing a prompt of its own.
 */
export function TwoFactorManage({
  status,
}: Readonly<{ status: Readonly<TwoFactorStatus> }>) {
  const regenerate = useRegenerateBackupCodes()
  const disable = useDisableTwoFactor()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  const onRegenerate = useCallback(() => {
    setMessage(null)
    regenerate
      .run({ password: optionalPassword(password) })
      .then((result) => {
        setPasswordRequired(securityActionNeedsPassword(result))
        setMessage(securityActionMessage(result))
        if (result.ok) {
          setBackupCodes(result.value.backupCodes)
          setPassword('')
        }
      })
      .catch(() => {
        // `run` folds rejections into its result shape.
      })
  }, [password, regenerate])

  const onDisable = useCallback(() => {
    setMessage(null)
    const typedCode = normalizeTwoFactorCode(code, 'totp')
    disable
      .run({
        password: optionalPassword(password),
        code: typedCode.length > 0 ? typedCode : undefined,
      })
      .then((result) => {
        setPasswordRequired(securityActionNeedsPassword(result))
        setMessage(securityActionMessage(result))
        if (result.ok) {
          setPassword('')
          setCode('')
        }
      })
      .catch(() => {
        // `run` folds rejections into its result shape.
      })
  }, [code, disable, password])

  const busy = regenerate.isPending || disable.isPending
  const remaining = status.backupCodesRemaining

  return (
    <View style={styles.stack}>
      <View style={styles.statusRow}>
        <Badge tone="ok" label="On" />
        <Text style={panelStyles.muted}>{twoFactorStatusLabel(status)}</Text>
      </View>

      {backupCodesRunningLow(remaining) ? (
        <InlineNotice
          tone="warning"
          title={backupCodesLabel(remaining)}
          body="Generate a new set before you need one — the old codes stop working as soon as you do."
        />
      ) : (
        <Text style={panelStyles.muted}>{backupCodesLabel(remaining)}</Text>
      )}

      <StepUpPasswordField
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        required={passwordRequired}
      />

      <TextField
        label="Authentication code"
        hint="Some control planes ask for a current code to turn two-factor off."
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        autoCapitalize="none"
        editable={!busy}
        mono
      />

      <ButtonRow>
        <Button
          label="Regenerate backup codes"
          busy={regenerate.isPending}
          busyLabel="Generating…"
          disabled={disable.isPending}
          onPress={onRegenerate}
        />
        <ConfirmButton
          label="Disable two-factor"
          confirmLabel="Disable"
          prompt="Sign-ins will need only a password."
          size="md"
          busy={disable.isPending}
          disabled={regenerate.isPending}
          onConfirm={onDisable}
        />
      </ButtonRow>

      {message ? <Text style={panelStyles.error}>{message}</Text> : null}

      <BackupCodesSheet
        visible={backupCodes !== null}
        codes={backupCodes ?? []}
        onAcknowledge={() => setBackupCodes(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
