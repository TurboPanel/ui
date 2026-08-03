import { useCallback, useEffect, useState } from 'react'
import { ScrollView, Platform, TextInput, Linking } from 'react-native'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { Link, useRouter } from 'expo-router'
import { useSignUp } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'

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

const webInputStyle = {
  borderWidth: 1,
  borderColor: '#3d3d3d',
  backgroundColor: '#1a1a1a',
  color: '#e0e0e0',
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

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

type SignupFormProps = {
  email: string
  password: string
  passwordTouched: boolean
  showPassword: boolean
  instanceInfoWarning: string
  error: string
  loading: boolean
  validation: PasswordValidation
  pwnedWarning: string
  pwnedChecking: boolean
  onEmailChange: (text: string) => void
  onPasswordChange: (text: string) => void
  onPasswordBlur: () => void
  onToggleShowPassword: () => void
  onSubmit: () => void
}

type SignupSuccessProps = {
  isEmailVerificationEnabled: boolean
  onContinue: () => void
}

type EmailFieldProps = {
  email: string
  onEmailChange: (text: string) => void
}

type PasswordFieldProps = {
  password: string
  showPassword: boolean
  onPasswordChange: (text: string) => void
  onPasswordBlur: () => void
  onToggleShowPassword: () => void
}

type PasswordRequirementsProps = {
  passwordTouched: boolean
  validation: PasswordValidation
}

type SignupActionsProps = {
  error: string
  pwnedWarning: string
  pwnedChecking: boolean
  loading: boolean
  isValid: boolean
  onSubmit: () => void
}

function SignupSuccess({
  isEmailVerificationEnabled,
  onContinue,
}: Readonly<SignupSuccessProps>) {
  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center">
      {isEmailVerificationEnabled ? (
        <>
          <Text color="$color" fontSize="$5" marginBottom="$2">
            Check your inbox to continue.
          </Text>
          <Text color="$gray10" fontSize="$3" marginBottom="$4">
            If this email can be used for a new account, we sent a verification link.
            You can also try signing in if you already have an account.
          </Text>
        </>
      ) : (
        <Text color="$color" fontSize="$5" marginBottom="$4">
          You can sign in now. If this email was already registered, use your existing password.
        </Text>
      )}
      <Button onPress={onContinue} theme="accent" size="$4">
        Go to sign in
      </Button>
    </YStack>
  )
}

function EmailField({ email, onEmailChange }: Readonly<EmailFieldProps>) {
  return (
    <YStack gap="$2">
      <Text color="$color" fontSize="$4">
        Email
      </Text>
      {Platform.OS === 'web' ? (
        <TextInput
          placeholder="you@example.com"
          value={email}
          onChangeText={onEmailChange}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable
          style={webInputStyle}
        />
      ) : (
        <Input
          placeholder="you@example.com"
          value={email}
          onChangeText={onEmailChange}
          autoComplete="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false as unknown as undefined}
          borderColor="$borderColor"
          backgroundColor="$background"
        />
      )}
    </YStack>
  )
}

function PasswordField({
  password,
  showPassword,
  onPasswordChange,
  onPasswordBlur,
  onToggleShowPassword,
}: Readonly<PasswordFieldProps>) {
  return (
    <YStack gap="$2">
      <Text color="$color" fontSize="$4">
        Password
      </Text>
      <XStack position="relative" alignItems="center">
        {Platform.OS === 'web' ? (
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={onPasswordChange}
            onBlur={onPasswordBlur}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable
            style={{ ...webInputStyle, flex: 1 }}
          />
        ) : (
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={onPasswordChange}
            onBlur={onPasswordBlur}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable
            style={{
              flex: 1,
              borderColor: '#3d3d3d',
              backgroundColor: '#1a1a1a',
              color: '#e0e0e0',
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              borderRadius: 6,
              minHeight: 44,
            }}
          />
        )}
        <Button size="$2" chromeless position="absolute" right="$2" onPress={onToggleShowPassword}>
          {showPassword ? 'Hide' : 'Show'}
        </Button>
      </XStack>
    </YStack>
  )
}

function PasswordRequirements({
  passwordTouched,
  validation,
}: Readonly<PasswordRequirementsProps>) {
  if (!passwordTouched) return null

  return (
    <YStack gap="$1" marginTop="$1">
      <Text color={validation.hasMinLength ? '$green10' : '$gray10'} fontSize="$2">
        {validation.hasMinLength ? '✓' : '○'} At least 8 characters
      </Text>
      <Text color={validation.hasNumber ? '$green10' : '$gray10'} fontSize="$2">
        {validation.hasNumber ? '✓' : '○'} At least 1 number
      </Text>
      <Text color={validation.hasSpecialChar ? '$green10' : '$gray10'} fontSize="$2">
        {validation.hasSpecialChar ? '✓' : '○'} At least 1 special character (e.g. $, !, @, %, &)
      </Text>
      <Text color={validation.noLeadingTrailingWhitespace ? '$green10' : '$gray10'} fontSize="$2">
        {validation.noLeadingTrailingWhitespace ? '✓' : '○'} No leading or trailing whitespace
      </Text>
    </YStack>
  )
}

function SignupActions({
  error,
  pwnedWarning,
  pwnedChecking,
  loading,
  isValid,
  onSubmit,
}: Readonly<SignupActionsProps>) {
  return (
    <>
      {error ? (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      ) : null}
      {pwnedWarning ? (
        <Text color="$yellow10" fontSize="$3">
          {pwnedWarning}{' '}
          <Text
            color="$blue10"
            textDecorationLine="underline"
            onPress={() =>
              Linking.openURL('https://turbopanel.io/docs/security/password-safety')
            }
          >
            Learn more
          </Text>
        </Text>
      ) : null}
      <Button
        onPress={onSubmit}
        theme="accent"
        size="$4"
        disabled={loading || pwnedChecking || !isValid}
        opacity={loading || pwnedChecking ? 0.7 : 1}
      >
        {loading ? 'Creating account...' : 'Sign up'}
      </Button>
      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        <Text color="$color" fontSize="$3">
          Already have an account?
        </Text>
        <Link href="/sign-in">
          <Text color="$blue10" fontSize="$3" textDecorationLine="underline">
            Sign In
          </Text>
        </Link>
      </XStack>
    </>
  )
}

function SignupForm({
  email,
  password,
  passwordTouched,
  showPassword,
  instanceInfoWarning,
  error,
  loading,
  validation,
  pwnedWarning,
  pwnedChecking,
  onEmailChange,
  onPasswordChange,
  onPasswordBlur,
  onToggleShowPassword,
  onSubmit,
}: Readonly<SignupFormProps>) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Sign up
        </Text>
        {instanceInfoWarning ? (
          <Text color="$yellow10" fontSize="$3">
            {instanceInfoWarning}
          </Text>
        ) : null}
        <EmailField email={email} onEmailChange={onEmailChange} />
        <PasswordField
          password={password}
          showPassword={showPassword}
          onPasswordChange={onPasswordChange}
          onPasswordBlur={onPasswordBlur}
          onToggleShowPassword={onToggleShowPassword}
        />
        <PasswordRequirements passwordTouched={passwordTouched} validation={validation} />
        <SignupActions
          error={error}
          pwnedWarning={pwnedWarning}
          pwnedChecking={pwnedChecking}
          loading={loading}
          isValid={validation.isValid}
          onSubmit={onSubmit}
        />
      </YStack>
    </ScrollView>
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
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const loading = signUpMutation.isPending
  const [pwnedWarning, setPwnedWarning] = useState('')
  const [pwnedChecking, setPwnedChecking] = useState(false)
  const [pwnedCheckedPassword, setPwnedCheckedPassword] = useState<string | null>(null)
  const [isPwned, setIsPwned] = useState<boolean | null>(null)

  const validation = validatePassword(password)
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
    setPasswordTouched(true)
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

  return success ? (
    <SignupSuccess
      isEmailVerificationEnabled={isEmailVerificationEnabled}
      onContinue={onSignupSuccessContinue}
    />
  ) : (
    <SignupForm
      email={email}
      password={password}
      passwordTouched={passwordTouched}
      showPassword={showPassword}
      instanceInfoWarning={instanceInfoWarning}
      error={error}
      loading={loading}
      validation={validation}
      pwnedWarning={pwnedWarning}
      pwnedChecking={pwnedChecking}
      onEmailChange={onEmailChange}
      onPasswordChange={onPasswordChange}
      onPasswordBlur={onPasswordBlur}
      onToggleShowPassword={() => setShowPassword((v) => !v)}
      onSubmit={onSubmit}
    />
  )
}
