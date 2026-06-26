import { useCallback, useEffect, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { Link, useRouter, type Href } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import { useAuthStatus } from '@/lib/query-client'

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

export function SignInScreenContent() {
  const router = useRouter()
  const { signIn, resolveDashboardHref } = useAuth()
  const { data: instanceInfo, isLoading: instanceInfoLoading } = useAuthStatus()
  const isInstallMode = instanceInfo?.isInstallMode === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onEmailChange = useCallback((text: string) => {
    setEmail(text)
    setError('')
  }, [])

  const onPasswordChange = useCallback((text: string) => {
    setPassword(text)
    setError('')
  }, [])

  const onSubmit = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      const href = await resolveDashboardHref()
      router.replace(href as Href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }, [email, password, resolveDashboardHref, router, signIn])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (isInstallMode) router.replace('/install')
  }, [instanceInfoLoading, isInstallMode, router])

  if (instanceInfoLoading || isInstallMode) return null

  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Sign In
      </Text>
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
            editable={!loading}
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
            editable={!loading}
          />
        )}
      </YStack>
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
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              style={{ ...webInputStyle, flex: 1 }}
            />
          ) : (
            <Input
              flex={1}
              placeholder="Password"
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false as unknown as undefined}
              borderColor="$borderColor"
              backgroundColor="$background"
              editable={!loading}
            />
          )}
          <Button
            size="$2"
            chromeless
            position="absolute"
            right="$2"
            onPress={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </Button>
        </XStack>
      </YStack>
      {error ? (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      ) : null}
      <Button
        onPress={onSubmit}
        theme="active"
        size="$4"
        disabled={loading}
        opacity={loading ? 0.7 : 1}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
      <YStack gap="$2">
        {instanceInfo?.isSignupEnabled === true ? (
          <Link href="/sign-up">
            <Text color="$blue10" fontSize="$3" textDecorationLine="underline">
              Don&apos;t have an account? Sign up
            </Text>
          </Link>
        ) : null}
      </YStack>
    </YStack>
  )
}
