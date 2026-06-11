import { useCallback, useEffect, useState } from 'react'
import { ScrollView, Platform, TextInput, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { Link, useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
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

function validatePassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasSpecialChar = /[$!@%&*#^()_+=\-]/.test(password)
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
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(password))
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

function SignupSuccess({ onContinue }: Readonly<SignupSuccessProps>) {
  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center">
      <Text color="$color" fontSize="$5" marginBottom="$4">
        Account created! Please sign in.
      </Text>
      <Button onPress={onContinue} theme="active" size="$4">
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
          editable
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
        theme="active"
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
            Sign in
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

export default function SignupScreen() {
  const router = useRouter()
  const { signUp } = useAuth()
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
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [pwnedWarning, setPwnedWarning] = useState('')
  const [pwnedChecking, setPwnedChecking] = useState(false)
  const [pwnedCheckedPassword, setPwnedCheckedPassword] = useState<string | null>(null)
  const [isPwned, setIsPwned] = useState<boolean | null>(null)

  const validation = validatePassword(password)
  const isInstallMode = instanceInfo?.isInstallMode === true
  const isSignupDisabled = instanceInfo?.isSignupEnabled === false
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
    setLoading(true)
    try {
      await signUp(email, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }, [email, password, validation.isValid, pwnedChecking, pwnedCheckedPassword, isPwned, signUp])

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {success ? (
        <SignupSuccess onContinue={onSignupSuccessContinue} />
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
      )}
    </SafeAreaView>
  )
}
