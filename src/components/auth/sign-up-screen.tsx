import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import {
  AuthPasswordMeter,
  type PasswordMeterStatus,
} from '@/components/auth/auth-password-meter'
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
import { useSignUp } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

type PasswordValidation = {
  isValid: boolean
  hasMinLength: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
  noLeadingTrailingWhitespace: boolean
}

const COMPROMISED_PASSWORD_MESSAGE =
  "That password isn't safe to use. Please choose a different one."

const PWNED_PASSWORDS_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const PWNED_PASSWORDS_TIMEOUT_MS = 5000

// Client mirror of the canonical server password policy in the instance repo
// (`src/client/authn/install-state.ts` → `validateSuperadminPassword` /
// `PASSWORD_SPECIAL_CHARS_PATTERN` / `PASSWORD_MIN_LENGTH`). The server enforces
// the same structural rules on every password-setting path (install, sign-up,
// password reset), so the API rejects weak passwords even if this UI check is
// bypassed. Keep the two in lockstep — do not weaken one without the other.
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_SPECIAL_CHARS_PATTERN = /[$!@%&*#^()_+=-]/

function validatePassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH
  const hasNumber = /\d/.test(password)
  const hasSpecialChar = PASSWORD_SPECIAL_CHARS_PATTERN.test(password)
  const noLeadingTrailingWhitespace = password === password.trim()
  return {
    hasMinLength,
    hasNumber,
    hasSpecialChar,
    noLeadingTrailingWhitespace,
    isValid: hasMinLength && hasNumber && hasSpecialChar && noLeadingTrailingWhitespace,
  }
}

/**
 * One nudge at a time, never a checklist — sign-up is the first impression, so
 * the form asks for the single next thing instead of grading four rules at once.
 */
function passwordHint(validation: PasswordValidation): string {
  if (!validation.hasMinLength) return 'A little longer'
  if (!validation.hasNumber) return 'Add a number'
  if (!validation.hasSpecialChar) return 'Add a symbol'
  if (!validation.noLeadingTrailingWhitespace) {
    return 'Remove the leading or trailing space'
  }
  return ''
}

/** Map structural policy + HIBP state onto the password meter badge. */
function resolveMeterStatus(input: {
  hasPwnedResult: boolean
  isPwned: boolean | null
  checking: boolean
  isValid: boolean
}): PasswordMeterStatus {
  if (input.hasPwnedResult && input.isPwned === true) return 'compromised'
  if (input.checking) return 'checking'
  if (input.isValid) return 'valid'
  return 'incomplete'
}

/** Track fill; never reads full while the password is still rejected. */
function passwordProgress(validation: PasswordValidation): number {
  if (validation.isValid) return 1
  const met = [
    validation.hasMinLength,
    validation.hasNumber,
    validation.hasSpecialChar,
  ].filter(Boolean).length
  return Math.min(met / 3, 2 / 3)
}

async function sha1Hex(password: string): Promise<string> {
  const enc = new TextEncoder()
  // HIBP range API requires SHA-1; only the 5-char prefix is sent (k-anonymity).
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(password)) // NOSONAR typescript:S4790 — HIBP k-anonymity API mandates SHA-1
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

async function checkPwnedPassword(password: string): Promise<boolean> {
  try {
    const fullHash = await sha1Hex(password)
    const prefix = fullHash.slice(0, 5)
    const suffix = fullHash.slice(5)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PWNED_PASSWORDS_TIMEOUT_MS)
    try {
      const res = await fetch(`${PWNED_PASSWORDS_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      })
      if (!res.ok) return false
      const text = await res.text()
      for (const line of text.split(/\r?\n/)) {
        const colon = line.indexOf(':')
        if (colon === -1) continue
        const lineSuffix = line.slice(0, colon).trim()
        const countStr = line.slice(colon + 1).trim()
        if (lineSuffix === suffix) {
          const count = Number.parseInt(countStr, 10)
          return Number.isFinite(count) && count > 0
        }
      }
      return false
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return false
  }
}

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

export function SignUpScreenContent() {
  const router = useRouter()
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
  const isSignupDisabled = instanceInfo?.isSignupEnabled === false
  /** Workers omit install fields — sign-up is the bootstrap path when enabled. */
  const instanceInfoWarning =
    instanceInfoErrored || !instanceInfo
      ? 'Could not verify signup availability right now. You can still try signing up.'
      : ''

  const onSignupSuccessContinue = useCallback(() => {
    router.replace('/sign-in')
  }, [router])

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
      await signUpMutation.mutateAsync({ email, password })
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
