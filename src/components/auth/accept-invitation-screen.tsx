import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router'
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
import { useAuth } from '@/lib/auth-context'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { acceptInvitation } from '@/lib/instance-api'
import { signInForInvitationHref } from '@/lib/invitation-return'
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

function acceptErrorCopy(err: unknown): string {
  if (isHttpStatusError(err, 403)) {
    return 'This invitation was sent to a different email address.'
  }
  if (isHttpStatusError(err, 404)) {
    return 'This invitation could not be found.'
  }
  if (isHttpStatusError(err, 410)) {
    return 'This invitation has expired or has already been used.'
  }
  return err instanceof Error ? err.message : 'Could not accept this invitation.'
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

export function AcceptInvitationScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const invitationId = normalizeParam(params.id)
  const { session, isLoading: sessionLoading } = useAuth()
  const { data: instanceInfo } = useAuthStatus()

  const [status, setStatus] = useState<'loading' | 'guest' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const acceptStartedRef = useRef(false)

  const runtime = useMemo(
    () => resolveControlPlaneRuntime(instanceInfo),
    [instanceInfo],
  )
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  useEffect(() => {
    if (!invitationId) {
      setStatus('error')
      setErrorMessage('This invitation link is missing an id.')
      return
    }

    if (sessionLoading) {
      setStatus('loading')
      return
    }

    if (!session) {
      setStatus('guest')
      return
    }

    if (acceptStartedRef.current) return
    acceptStartedRef.current = true
    setStatus('loading')

    acceptInvitation(invitationId)
      .then((result) => {
        setStatus('success')
        router.replace(`/${result.organizationId}/overview`)
      })
      .catch((err: unknown) => {
        setStatus('error')
        setErrorMessage(acceptErrorCopy(err))
      })
  }, [invitationId, session, sessionLoading, router])

  const signUpHref = invitationId
    ? `/sign-up?invitationId=${encodeURIComponent(invitationId)}`
    : '/sign-up'
  const signInHref = invitationId
    ? signInForInvitationHref(invitationId)
    : '/sign-in'

  const guestFooter = (
    <View>
      <Link href={signInHref as Href} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sign in"
          style={webPointer}
        >
          <Text style={authFormStyles.footerLink}>
            Already have an account?{' '}
            <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
              Sign in
            </Text>
          </Text>
        </Pressable>
      </Link>
      <Link href={signUpHref} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sign up"
          style={webPointer}
        >
          <Text style={authFormStyles.footerLink}>
            New here?{' '}
            <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
              Sign up
            </Text>
          </Text>
        </Pressable>
      </Link>
    </View>
  )

  if (status === 'loading') {
    return (
      <AuthScreenShell title="Accept invitation" accentColor={accent.accent}>
        <View style={styles.statusRow} accessibilityRole="progressbar">
          <ActivityIndicator size="small" color={authSpinnerColor(runtime)} />
          <Text style={styles.statusCopy}>Accepting your invitation…</Text>
        </View>
      </AuthScreenShell>
    )
  }

  if (status === 'guest') {
    return (
      <AuthScreenShell
        title="Accept invitation"
        footer={guestFooter}
        accentColor={accent.accent}
      >
        <Text style={styles.statusTitle}>Sign in to accept</Text>
        <Text style={styles.statusCopy}>
          Sign in or create an account with the invited email to join this organization.
        </Text>
        <AuthPrimaryButton
          onPress={() => router.push(signInHref as Href)}
          accessibilityLabel="Sign in"
          label="Sign in"
          tint={tint}
        />
      </AuthScreenShell>
    )
  }

  if (status === 'success') {
    return (
      <AuthScreenShell title="Accept invitation" accentColor={accent.accent}>
        <View style={styles.statusRow} accessibilityRole="progressbar">
          <ActivityIndicator size="small" color={authSpinnerColor(runtime)} />
          <Text style={styles.statusCopy}>Opening your organization…</Text>
        </View>
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
      title="Accept invitation"
      footer={backToSignInFooter}
      accentColor={accent.accent}
    >
      <Text style={styles.statusTitle}>Invitation not accepted</Text>
      <Text style={authFormStyles.error} accessibilityRole="alert">
        {errorMessage}
      </Text>
    </AuthScreenShell>
  )
}
