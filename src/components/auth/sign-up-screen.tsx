import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPasswordMeter } from '@/components/auth/auth-password-meter'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import {
  authAccentForRuntime,
  resolveControlPlaneRuntime,
  type AuthAccentTheme,
} from '@/lib/auth-accent'
import { signInForInvitationHref } from '@/lib/invitation-return'
import {
  checkPwnedPassword,
  COMPROMISED_PASSWORD_MESSAGE,
  passwordHint,
  passwordProgress,
  resolveMeterStatus,
  validatePassword,
} from '@/lib/password-policy'
import { useSignUp } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

const styles = StyleSheet.create({
  warning: {
    color: colors.pending,
    fontSize: 13,
    lineHeight: 18,
  },
  warningLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  successTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  successCopy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
})

function SignupSuccess({
  isEmailVerificationEnabled,
  accent,
  tint,
  onContinue,
}: Readonly<{
  isEmailVerificationEnabled: boolean
  accent: AuthAccentTheme
  tint: ReturnType<typeof authAccentStyles>
  onContinue: () => void
}>) {
  return (
    <AuthScreenShell title="Sign Up" accentColor={accent.accent}>
      {isEmailVerificationEnabled ? (
        <>
          <Text style={styles.successTitle}>Check your inbox to continue.</Text>
          <Text style={styles.successCopy}>
            If this email can be used for a new account, we sent a verification link.
            You can also try signing in if you already have an account.
          </Text>
        </>
      ) : (
        <Text style={styles.successTitle}>
          You can sign in now. If this email was already registered, use your existing
          password.
        </Text>
      )}
      <AuthPrimaryButton
        onPress={onContinue}
        accessibilityLabel="Go to sign in"
        label="Go to sign in"
        tint={tint}
      />
    </AuthScreenShell>
  )
}

function normalizeInvitationId(param: string | string[] | undefined): string {
  if (param == null) return ''
  if (Array.isArray(param)) {
    const first = param.find((value) => typeof value === 'string' && value.trim().length > 0)
    return first == null ? '' : first.trim()
  }
  return typeof param === 'string' ? param.trim() : ''
}

export function SignUpScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ invitationId?: string | string[] }>()
  const invitationId = normalizeInvitationId(params.invitationId)
  const signUpMutation = useSignUp()
  const {
    data: instanceInfo,
    isLoading: instanceInfoLoading,
    isError: instanceInfoErrored,
  } = useAuthStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const loading = signUpMutation.isPending
  const [pwnedWarning, setPwnedWarning] = useState('')
  const [pwnedChecking, setPwnedChecking] = useState(false)
  const [pwnedCheckedPassword, setPwnedCheckedPassword] = useState<string | null>(null)
  const [isPwned, setIsPwned] = useState<boolean | null>(null)

  const accent = useMemo(
    () => authAccentForRuntime(resolveControlPlaneRuntime(instanceInfo)),
    [instanceInfo],
  )
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  const validation = validatePassword(password)
  const hasPwnedResultForCurrent = pwnedCheckedPassword === password
  const meterStatus = resolveMeterStatus({
    hasPwnedResult: hasPwnedResultForCurrent,
    isPwned,
    checking: pwnedChecking,
    isValid: validation.isValid,
  })
  const meterHint = {
    incomplete: passwordHint(validation),
    checking: 'Checking…',
    valid: 'Looks good',
    compromised: '',
  }[meterStatus]
  const isInstallMode = instanceInfo?.isInstallMode === true
  const isSignupDisabled =
    instanceInfo?.isSignupEnabled === false && invitationId.length === 0
  /** Workers omit install fields — sign-up is the bootstrap path when enabled. */
  const instanceInfoWarning =
    instanceInfoErrored || !instanceInfo
      ? 'Could not verify signup availability right now. You can still try signing up.'
      : ''

  const onSignupSuccessContinue = useCallback(() => {
    router.replace(
      (invitationId ? signInForInvitationHref(invitationId) : '/sign-in') as Href,
    )
  }, [invitationId, router])

  const onEmailChange = useCallback((text: string) => {
    setEmail(text)
    setError('')
  }, [])

  const onPasswordChange = useCallback((text: string) => {
    setPassword(text)
    setError('')
    setPwnedWarning('')
    setPwnedCheckedPassword(null)
    setIsPwned(null)
  }, [])

  const onPasswordBlur = useCallback(async () => {
    if (!password || !validation.isValid) return
    setPwnedChecking(true)
    try {
      const pwned = await checkPwnedPassword(password)
      setPwnedCheckedPassword(password)
      setIsPwned(pwned)
      setPwnedWarning(pwned ? COMPROMISED_PASSWORD_MESSAGE : '')
    } finally {
      setPwnedChecking(false)
    }
  }, [password, validation.isValid])

  const onSubmit = useCallback(async () => {
    if (pwnedChecking) return
    if (!validation.isValid) return
    const hasResultForCurrent = pwnedCheckedPassword === password && isPwned !== null
    if (hasResultForCurrent) {
      if (isPwned) {
        setPwnedWarning(COMPROMISED_PASSWORD_MESSAGE)
        return
      }
    } else {
      setPwnedChecking(true)
      try {
        const pwned = await checkPwnedPassword(password)
        setPwnedCheckedPassword(password)
        setIsPwned(pwned)
        setPwnedWarning(pwned ? COMPROMISED_PASSWORD_MESSAGE : '')
        if (pwned) {
          setPwnedChecking(false)
          return
        }
      } finally {
        setPwnedChecking(false)
      }
    }
    setError('')
    try {
      await signUpMutation.mutateAsync(
        invitationId ? { email, password, invitationId } : { email, password },
      )
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    }
  }, [
    email,
    password,
    validation.isValid,
    pwnedChecking,
    pwnedCheckedPassword,
    isPwned,
    signUpMutation,
    invitationId,
  ])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (isInstallMode) {
      router.replace('/install')
    } else if (isSignupDisabled) {
      router.replace('/sign-in')
    }
  }, [instanceInfoLoading, isInstallMode, isSignupDisabled, router])

  if (instanceInfoLoading || isSignupDisabled || isInstallMode) {
    return null
  }

  const isEmailVerificationEnabled =
    instanceInfo?.isSignupEmailVerificationEnabled ?? true

  if (success) {
    return (
      <SignupSuccess
        isEmailVerificationEnabled={isEmailVerificationEnabled}
        accent={accent}
        tint={tint}
        onContinue={onSignupSuccessContinue}
      />
    )
  }

  const submitDisabled = loading || pwnedChecking || !validation.isValid

  const signInFooter = (
    <Link href="/sign-in" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Sign in to an existing account"
        style={webPointer}
      >
        <Text style={authFormStyles.footerLink}>
          Already have an account?{' '}
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
            Sign In
          </Text>
        </Text>
      </Pressable>
    </Link>
  )

  return (
    <AuthScreenShell
      title="Sign Up"
      footer={signInFooter}
      accentColor={accent.accent}
    >
      {instanceInfoWarning ? (
        <Text style={styles.warning}>{instanceInfoWarning}</Text>
      ) : null}

      <View style={authFormStyles.field}>
        <AuthFloatingField
          label="Email"
          value={email}
          onChangeText={onEmailChange}
          accentColor={accent.accent}
          autoComplete="email"
          keyboardType="email-address"
          editable={!loading}
          returnKeyType="next"
        />
      </View>

      <View style={[authFormStyles.field, authFormStyles.fieldSpaced]}>
        <AuthFloatingField
          label="Password"
          value={password}
          onChangeText={onPasswordChange}
          onBlur={() => {
            onPasswordBlur().catch(() => {
              // pwned check failures fall back to server-side enforcement.
            })
          }}
          accentColor={accent.accent}
          autoComplete="new-password"
          secureTextEntry={!showPassword}
          showPasswordToggle
          passwordVisible={showPassword}
          onTogglePasswordVisible={() => setShowPassword((v) => !v)}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={() => {
            onSubmit().catch(() => {
              // Errors are surfaced via setError inside onSubmit.
            })
          }}
        />
      </View>

      {password ? (
        <AuthPasswordMeter
          status={meterStatus}
          progress={passwordProgress(validation)}
          hint={meterHint}
          accentColor={accent.accent}
        />
      ) : null}

      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {pwnedWarning ? (
        <Text style={styles.warning} accessibilityRole="alert">
          {pwnedWarning}{' '}
          <Text
            style={[
              styles.warningLink,
              { color: accent.accent },
              webPointer,
            ]}
            accessibilityRole="link"
            onPress={() => {
              Linking.openURL(
                'https://turbopanel.io/docs/security/password-safety',
              ).catch(() => {
                // Ignore failures opening the external docs link.
              })
            }}
          >
            Learn more
          </Text>
        </Text>
      ) : null}

      <AuthPrimaryButton
        onPress={() => {
          onSubmit().catch(() => {
            // Errors are surfaced via setError inside onSubmit.
          })
        }}
        disabled={submitDisabled}
        busy={loading}
        accessibilityLabel={loading ? 'Creating account' : 'Sign up'}
        label="Sign up"
        busyLabel="Creating account…"
        tint={tint}
        spinnerColor={accent.onAccent}
      />
    </AuthScreenShell>
  )
}
