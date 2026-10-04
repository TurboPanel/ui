import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { authAccentForRuntime, resolveControlPlaneRuntime } from '@/lib/auth-accent'
import { useRequestPasswordReset } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const styles = StyleSheet.create({
  copy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
})

/**
 * Forgot password — ask for the email, send the reset link. The server
 * answers the same whether or not the account exists, so the confirmation
 * never says which.
 */
export function ForgotPasswordScreenContent() {
  const { data: instanceInfo } = useAuthStatus()
  const runtime = useMemo(() => resolveControlPlaneRuntime(instanceInfo), [instanceInfo])
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])
  const requestReset = useRequestPasswordReset()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const loading = requestReset.isPending

  const onSubmit = useCallback(async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    setError('')
    try {
      await requestReset.mutateAsync(trimmed)
      setSent(true)
    } catch (err) {
      setError(userErrorMessage(err, 'Could not send the reset link'))
    }
  }, [email, requestReset])

  const backToSignIn = (
    <Link href="/sign-in" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="Back to sign in" style={webPointer}>
        <Text style={authFormStyles.footerLink}>
          Back to{' '}
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>sign in</Text>
        </Text>
      </Pressable>
    </Link>
  )

  if (sent) {
    return (
      <AuthScreenShell title="Reset Password" footer={backToSignIn} accentColor={accent.accent}>
        <Text style={styles.title}>Check your inbox.</Text>
        <Text style={styles.copy}>
          If an account uses {email.trim()}, we sent it a link to choose a new password. The
          link works once and expires in one hour.
        </Text>
      </AuthScreenShell>
    )
  }

  return (
    <AuthScreenShell
      title="Reset Password"
      description="Enter your account's email and we'll send you a link to choose a new password."
      footer={backToSignIn}
      accentColor={accent.accent}
    >
      <View style={authFormStyles.field}>
        <AuthFloatingField
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text)
            setError('')
          }}
          accentColor={accent.accent}
          autoComplete="email"
          keyboardType="email-address"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={() => {
            onSubmit().catch(() => {
              // Errors are surfaced via setError inside onSubmit.
            })
          }}
        />
      </View>

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
        accessibilityLabel="Send reset link"
        label="Send reset link"
        busyLabel="Sending…"
        busy={loading}
        disabled={loading || email.trim().length === 0}
        tint={tint}
      />
    </AuthScreenShell>
  )
}
