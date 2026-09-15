import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import {
  authFormStyles,
  webPointer,
  type AuthAccentStyles,
} from '@/components/auth/auth-form-styles'
import type { AuthAccentTheme } from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import type { SessionInfo, TwoFactorCodeKind } from '@/lib/instance-api'
import {
  isTwoFactorCodeComplete,
  normalizeTwoFactorCode,
  otherTwoFactorKind,
  TWO_FACTOR_FIELD_LABEL,
  TWO_FACTOR_PROMPT_COPY,
  TWO_FACTOR_TOGGLE_LABEL,
  twoFactorAutoComplete,
  twoFactorKeyboard,
} from '@/lib/two-factor-prompt'

/**
 * Second step of a sign-in that answered with a pending factor.
 *
 * Rendered inside the same auth shell panel as the password form — the
 * challenge is short-lived, so this never becomes its own route.
 */
export function TwoFactorStep({
  challenge,
  accent,
  tint,
  onAuthenticated,
  onCancel,
}: Readonly<{
  challenge: string
  accent: AuthAccentTheme
  tint: AuthAccentStyles
  onAuthenticated: (session: SessionInfo) => void
  onCancel: () => void
}>) {
  const { completeTwoFactor } = useAuth()
  const [kind, setKind] = useState<TwoFactorCodeKind>('totp')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onCodeChange = useCallback((text: string) => {
    setCode(text)
    setError('')
  }, [])

  const onToggleKind = useCallback(() => {
    setKind((current) => otherTwoFactorKind(current))
    setCode('')
    setError('')
  }, [])

  const onSubmit = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const session = await completeTwoFactor(
        challenge,
        normalizeTwoFactorCode(code, kind),
        kind,
      )
      onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }, [challenge, code, completeTwoFactor, kind, onAuthenticated])

  const submit = useCallback(() => {
    onSubmit().catch(() => {
      // Errors are surfaced via setError inside onSubmit.
    })
  }, [onSubmit])

  return (
    <>
      <Text style={authFormStyles.pageCopy}>{TWO_FACTOR_PROMPT_COPY[kind]}</Text>

      <View style={authFormStyles.field}>
        <AuthFloatingField
          label={TWO_FACTOR_FIELD_LABEL[kind]}
          value={code}
          onChangeText={onCodeChange}
          accentColor={accent.accent}
          autoComplete={twoFactorAutoComplete(kind)}
          keyboardType={twoFactorKeyboard(kind)}
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <AuthPrimaryButton
        onPress={submit}
        disabled={busy || !isTwoFactorCodeComplete(code, kind)}
        busy={busy}
        accessibilityLabel={busy ? 'Verifying' : 'Verify'}
        label="Verify"
        busyLabel="Verifying…"
        tint={tint}
        spinnerColor={accent.onAccent}
      />

      <Pressable
        onPress={onToggleKind}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={TWO_FACTOR_TOGGLE_LABEL[kind]}
        style={webPointer}
      >
        <Text style={authFormStyles.footerLink}>
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
            {TWO_FACTOR_TOGGLE_LABEL[kind]}
          </Text>
        </Text>
      </Pressable>

      <Pressable
        onPress={onCancel}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
        style={webPointer}
      >
        <Text style={authFormStyles.footerLink}>Back to sign in</Text>
      </Pressable>
    </>
  )
}
