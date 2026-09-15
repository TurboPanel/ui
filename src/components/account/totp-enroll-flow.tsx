import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BackupCodesSheet } from '@/components/account/backup-codes-sheet'
import { StepUpPasswordField } from '@/components/account/step-up-password-field'
import {
  Button,
  ButtonRow,
  CopyButton,
  InlineNotice,
  MonoText,
  TextField,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useEnrollTotp, useVerifyTotp } from '@/lib/queries/auth'
import {
  optionalPassword,
  securityActionMessage,
  securityActionNeedsPassword,
} from '@/lib/security-actions'
import { colors, spacing } from '@/lib/theme'
import {
  isTwoFactorCodeComplete,
  normalizeTwoFactorCode,
} from '@/lib/two-factor-prompt'

type EnrollSecret = { secret: string; otpauthUri: string }

/**
 * Enrollment wizard for an account with no second factor.
 *
 * Three steps in place, never a route change: confirm identity → transfer the
 * secret to an authenticator → prove it works. Backup codes are returned only
 * by the verify call and only once, which is why they land in a modal.
 */
export function TotpEnrollFlow() {
  const enroll = useEnrollTotp()
  const verify = useVerifyTotp()
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [secret, setSecret] = useState<EnrollSecret | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

  const onEnroll = useCallback(() => {
    setMessage(null)
    enroll
      .run({ password: optionalPassword(password) })
      .then((result) => {
        setPasswordRequired(securityActionNeedsPassword(result))
        setMessage(securityActionMessage(result))
        if (result.ok) {
          setSecret(result.value)
          setPassword('')
        }
      })
      .catch(() => {
        // `run` folds rejections into its result shape.
      })
  }, [enroll, password])

  const onVerify = useCallback(() => {
    setMessage(null)
    verify
      .run({ code: normalizeTwoFactorCode(code, 'totp') })
      .then((result) => {
        setMessage(securityActionMessage(result))
        if (result.ok) {
          setBackupCodes(result.value.backupCodes)
          setSecret(null)
          setCode('')
        }
      })
      .catch(() => {
        // `run` folds rejections into its result shape.
      })
  }, [code, verify])

  const onAcknowledge = useCallback(() => {
    setBackupCodes(null)
  }, [])

  return (
    <View style={styles.stack}>
      {secret ? (
        <TotpSecretStep
          secret={secret}
          code={code}
          onCodeChange={setCode}
          onVerify={onVerify}
          busy={verify.isPending}
        />
      ) : (
        <View style={styles.stack}>
          <Text style={panelStyles.muted}>
            Add a one-time code from an authenticator app to every sign-in. You
            will get backup codes to use if you lose the app.
          </Text>
          <StepUpPasswordField
            value={password}
            onChangeText={setPassword}
            editable={!enroll.isPending}
            required={passwordRequired}
          />
          <ButtonRow>
            <Button
              label="Enable two-factor"
              variant="primary"
              busy={enroll.isPending}
              busyLabel="Starting…"
              onPress={onEnroll}
            />
          </ButtonRow>
        </View>
      )}

      {message ? <Text style={panelStyles.error}>{message}</Text> : null}

      <BackupCodesSheet
        visible={backupCodes !== null}
        codes={backupCodes ?? []}
        onAcknowledge={onAcknowledge}
      />
    </View>
  )
}

function TotpSecretStep({
  secret,
  code,
  onCodeChange,
  onVerify,
  busy,
}: Readonly<{
  secret: EnrollSecret
  code: string
  onCodeChange: (next: string) => void
  onVerify: () => void
  busy: boolean
}>) {
  return (
    <View style={styles.stack}>
      <InlineNotice
        title="Add this to your authenticator"
        body="Paste the setup key into your authenticator app, or open the setup link on the device that holds it."
      />

      <View style={styles.secretCard}>
        <Text style={panelStyles.detailTitle}>Setup key</Text>
        <View style={styles.secretRow}>
          <MonoText selectable style={styles.secretValue}>
            {secret.secret}
          </MonoText>
          <CopyButton value={secret.secret} label="Copy key" />
        </View>
        <Text style={panelStyles.detailTitle}>Setup link</Text>
        <View style={styles.secretRow}>
          <MonoText selectable numberOfLines={2} style={styles.secretValue}>
            {secret.otpauthUri}
          </MonoText>
          <CopyButton value={secret.otpauthUri} label="Copy link" />
        </View>
      </View>

      <TextField
        label="Authentication code"
        hint="Enter the 6-digit code your app shows now."
        value={code}
        onChangeText={onCodeChange}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        autoCapitalize="none"
        editable={!busy}
        mono
      />

      <ButtonRow>
        <Button
          label="Verify and enable"
          variant="primary"
          busy={busy}
          busyLabel="Verifying…"
          disabled={!isTwoFactorCodeComplete(code, 'totp')}
          onPress={onVerify}
        />
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  secretCard: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInset,
    gap: spacing.xs,
  },
  secretRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secretValue: {
    flex: 1,
    minWidth: 200,
    color: colors.stdout,
  },
})
