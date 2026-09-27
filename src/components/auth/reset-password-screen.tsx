import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { AuthNewPasswordField } from '@/components/auth/auth-new-password-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { authAccentForRuntime, resolveControlPlaneRuntime } from '@/lib/auth-accent'
import {
  checkPwnedPassword,
  COMPROMISED_PASSWORD_MESSAGE,
  passwordHint,
  resolveMeterStatus,
  validatePassword,
} from '@/lib/password-policy'
import { resetLinkState } from '@/lib/password-reset'
import { useResetPassword } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  copy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
  warning: {
    color: colors.pending,
    fontSize: 13,
    lineHeight: 18,
  },
})

/**
 * The page the emailed reset link lands on (`?token=`, or `?error=INVALID_TOKEN`
 * when the link was unknown, used or expired). Same password rules and
 * breached-password check as sign-up.
 */
export function ResetPasswordScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>()
  const link = resetLinkState(params)
  const { data: instanceInfo } = useAuthStatus()
  const runtime = useMemo(() => resolveControlPlaneRuntime(instanceInfo), [instanceInfo])
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])
  const reset = useResetPassword()

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pwnedWarning, setPwnedWarning] = useState('')
  const [checking, setChecking] = useState(false)
  const [expired, setExpired] = useState(false)
  const [done, setDone] = useState(false)
  const validation = useMemo(() => validatePassword(password), [password])
  const loading = reset.isPending || checking

  const onSubmit = useCallback(async () => {
    if (link.kind !== 'ready' || !validation.isValid || loading) return
    setError('')
    setChecking(true)
    let pwned = false
    try {
      pwned = await checkPwnedPassword(password)
    } finally {
      setChecking(false)
    }
    if (pwned) {
      setPwnedWarning(COMPROMISED_PASSWORD_MESSAGE)
      return
    }
    try {
      await reset.mutateAsync({ newPassword: password, token: link.token })
      setDone(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('INVALID_TOKEN')) {
        setExpired(true)
      } else {
        setError(message || 'Could not reset the password')
      }
    }
  }, [link, validation.isValid, loading, password, reset])

  const requestNewLink = (
    <Link href="/forgot-password" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="Request a new link" style={webPointer}>
        <Text style={authFormStyles.footerLink}>
          Need a new link?{' '}
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
            Request one
          </Text>
        </Text>
      </Pressable>
    </Link>
  )

  if (done) {
    return (
      <AuthScreenShell title="Reset Password" accentColor={accent.accent}>
        <Text style={styles.title}>Your password has been changed.</Text>
        <Text style={styles.copy}>
          {"You've been signed out on every device. Sign in with your new password."}
        </Text>
        <AuthPrimaryButton
          onPress={() => router.replace('/sign-in')}
          accessibilityLabel="Go to sign in"
          label="Go to sign in"
          tint={tint}
        />
      </AuthScreenShell>
    )
  }

  if (link.kind === 'invalid' || expired) {
    return (
      <AuthScreenShell title="Reset Password" accentColor={accent.accent}>
        <Text style={styles.title}>{"This reset link doesn't work anymore."}</Text>
        <Text style={styles.copy}>
          Reset links work once and expire after an hour. Request a new one and use the newest
          email.
        </Text>
        <AuthPrimaryButton
          onPress={() => router.replace('/forgot-password')}
          accessibilityLabel="Request a new link"
          label="Request a new link"
          tint={tint}
        />
      </AuthScreenShell>
    )
  }

  const meterHint = passwordHint(validation)
  const meterStatus = resolveMeterStatus({
    hasPwnedResult: pwnedWarning !== '',
    isPwned: pwnedWarning ? true : null,
    checking,
    isValid: validation.isValid,
  })

  return (
    <AuthScreenShell
      title="Reset Password"
      description="Choose a new password for your account."
      footer={requestNewLink}
      accentColor={accent.accent}
    >
      <AuthNewPasswordField
        label="New password"
        value={password}
        onChangeText={(text) => {
          setPassword(text)
          setError('')
          setPwnedWarning('')
        }}
        onSubmit={onSubmit}
        editable={!loading}
        accentColor={accent.accent}
        validation={validation}
        meterStatus={meterStatus}
        meterHint={meterHint}
      />

      {pwnedWarning ? (
        <Text style={styles.warning} accessibilityRole="alert">
          {pwnedWarning}
        </Text>
      ) : null}

      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <AuthPrimaryButton
        onPress={() => {
          onSubmit().catch(() => {
            // Errors are surfaced via setError inside onSubmit.
          })
        }}
        accessibilityLabel="Set new password"
        label="Set new password"
        busyLabel="Saving…"
        busy={loading}
        disabled={loading || !validation.isValid}
        tint={tint}
      />
    </AuthScreenShell>
  )
}
