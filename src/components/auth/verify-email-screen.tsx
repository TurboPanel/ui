import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import {
  authAccentForRuntime,
  authSpinnerColor,
  resolveControlPlaneRuntime,
} from '@/lib/auth-accent'
import { useVerifyEmail } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function normalizeParam(param: string | string[] | undefined): string {
  if (param == null) return ''
  if (Array.isArray(param)) {
    const first = param.find((value) => typeof value === 'string' && value.trim().length > 0)
    return first == null ? '' : first.trim()
  }
  return typeof param === 'string' ? param.trim() : ''
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  statusCopy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
})

export function VerifyEmailScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string | string[] }>()
  const token = normalizeParam(params.token)
  const verifyEmailMutation = useVerifyEmail()
  const { data: instanceInfo } = useAuthStatus()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const verifyStartedRef = useRef(false)

  const runtime = useMemo(
    () => resolveControlPlaneRuntime(instanceInfo),
    [instanceInfo],
  )
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('This verification link is missing a token.')
      return
    }

    if (verifyStartedRef.current) return
    verifyStartedRef.current = true

    verifyEmailMutation.mutate(token, {
      onSuccess: () => {
        setStatus('success')
      },
      onError: (err) => {
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
      },
    })
  }, [token, verifyEmailMutation])

  const goToSignIn = (
    <AuthPrimaryButton
      onPress={() => router.replace('/sign-in')}
      accessibilityLabel="Go to sign in"
      label="Go to sign in"
      tint={tint}
    />
  )

  if (status === 'loading') {
    return (
      <AuthScreenShell title="Verify Email" accentColor={accent.accent}>
        <View style={styles.statusRow} accessibilityRole="progressbar">
          {/* Muted until runtime is known so HA never flashes green. */}
          <ActivityIndicator size="small" color={authSpinnerColor(runtime)} />
          <Text style={styles.statusCopy}>Verifying your email…</Text>
        </View>
      </AuthScreenShell>
    )
  }

  if (status === 'success') {
    return (
      <AuthScreenShell title="Verify Email" accentColor={accent.accent}>
        <Text style={styles.statusTitle}>Email verified!</Text>
        <Text style={styles.statusCopy}>
          Your email address has been verified. You can now sign in.
        </Text>
        {goToSignIn}
      </AuthScreenShell>
    )
  }

  const backToSignInFooter = (
    <Link href="/sign-in" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Back to sign in"
        style={webPointer}
      >
        <Text style={authFormStyles.footerLink}>
          Back to{' '}
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
            sign in
          </Text>
        </Text>
      </Pressable>
    </Link>
  )

  return (
    <AuthScreenShell
      title="Verify Email"
      footer={backToSignInFooter}
      accentColor={accent.accent}
    >
      <Text style={styles.statusTitle}>Verification failed</Text>
      <Text style={authFormStyles.error} accessibilityRole="alert">
        {errorMessage}
      </Text>
      {goToSignIn}
    </AuthScreenShell>
  )
}
