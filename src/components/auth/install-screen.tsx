import { useCallback, useEffect, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { useRouter, type Href } from 'expo-router'
import { bootstrapInstall, completeInstall } from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import { setActiveOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'
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

function submitButtonLabel(loading: boolean, hostVerified: boolean): string {
  if (loading) {
    return hostVerified ? 'Setting up…' : 'Authenticating…'
  }
  return hostVerified ? 'Complete setup' : 'Continue'
}

function PasswordField({
  value,
  onChangeText,
  showPassword,
  onToggleShow,
  disabled,
}: Readonly<{
  value: string
  onChangeText: (text: string) => void
  showPassword: boolean
  onToggleShow: () => void
  disabled: boolean
}>) {
  return (
    <XStack position="relative" items="center">
      {Platform.OS === 'web' ? (
        <TextInput
          placeholder="Password"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          style={{ ...webInputStyle, flex: 1 }}
        />
      ) : (
        <Input
          flex={1}
          placeholder="Password"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false as unknown as undefined}
          borderColor="$borderColor"
          bg="$background"
          disabled={disabled}
        />
      )}
      <Button size="$2" chromeless position="absolute" r="$2" onPress={onToggleShow}>
        {showPassword ? 'Hide' : 'Show'}
      </Button>
    </XStack>
  )
}

export function InstallScreenContent() {
  const router = useRouter()
  const { refreshSession, refreshInstallStatus } = useAuth()
  const { data: instanceInfo, isLoading: instanceInfoLoading } = useAuthStatus()
  const isInstallMode = instanceInfo?.isInstallMode === true
  const [hostVerified, setHostVerified] = useState(false)
  const [username, setUsername] = useState('root')
  const [password, setPassword] = useState('')
  const [superadminEmail, setSuperadminEmail] = useState('')
  const [superadminPassword, setSuperadminPassword] = useState('')
  const [showHostPassword, setShowHostPassword] = useState(false)
  const [showSuperadminPassword, setShowSuperadminPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const hostSectionTranslateY = useSharedValue(0)
  const superadminSectionOpacity = useSharedValue(0)
  const superadminSectionHeight = useSharedValue(0)

  useEffect(() => {
    const duration = 250
    if (hostVerified) {
      hostSectionTranslateY.value = withTiming(-8, { duration })
      superadminSectionOpacity.value = withTiming(1, { duration })
      superadminSectionHeight.value = withTiming(1, { duration })
    } else {
      hostSectionTranslateY.value = withTiming(0, { duration })
      superadminSectionOpacity.value = withTiming(0, { duration })
      superadminSectionHeight.value = withTiming(0, { duration })
    }
  }, [hostVerified, hostSectionTranslateY, superadminSectionOpacity, superadminSectionHeight])

  const hostSectionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hostSectionTranslateY.value }],
  }))

  const superadminSectionStyle = useAnimatedStyle(() => ({
    opacity: superadminSectionOpacity.value,
    maxHeight: interpolate(superadminSectionHeight.value, [0, 1], [0, 300]),
    overflow: 'hidden' as const,
  }))

  const resetHostVerification = useCallback(() => {
    setHostVerified(false)
    setError('')
  }, [])

  const handleHostAuth = useCallback(async () => {
    if (!username.trim() || !password) {
      setError('Enter host username and password')
      return
    }

    setError('')
    setLoading(true)
    try {
      await bootstrapInstall(username.trim(), password)
      setHostVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Host authentication failed')
    } finally {
      setLoading(false)
    }
  }, [username, password])

  const handleCompleteSetup = useCallback(async () => {
    if (!username.trim() || !password) {
      setError('Enter host username and password')
      return
    }
    if (!superadminEmail.trim() || !superadminPassword) {
      setError('Enter superadmin email and password')
      return
    }

    setError('')
    setLoading(true)
    try {
      const result = await completeInstall({
        username: username.trim(),
        password,
        superadminEmail,
        superadminPassword,
      })
      setSuccess(true)
      await refreshInstallStatus()
      await refreshSession()
      setActiveOrganizationId(result.organizationId)
      router.replace(defaultOrgDashboardHref(result.organizationId) as Href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
      setSuccess(false)
    } finally {
      setLoading(false)
    }
  }, [
    username,
    password,
    superadminEmail,
    superadminPassword,
    refreshInstallStatus,
    refreshSession,
    router,
  ])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (!isInstallMode) router.replace('/sign-in')
  }, [instanceInfoLoading, isInstallMode, router])

  if (instanceInfoLoading || !isInstallMode) return null

  if (success) {
    return (
      <YStack flex={1} bg="$background" p="$6" justify="center" gap="$4">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Installation complete 🎉
        </Text>
        <Text color="$gray11" fontSize="$4">
          Signing you in…
        </Text>
      </YStack>
    )
  }

  const introText = hostVerified
    ? 'Host verified. Create your superadmin account below.'
    : 'Sign in with root or a sudo-capable host account to begin setup.'

  return (
    <YStack flex={1} bg="$background" p="$6" justify="center" gap="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Set up your TurboPanel instance
      </Text>
      <Text color="$gray11" fontSize="$4">
        {introText}
      </Text>

      <Animated.View style={hostSectionStyle}>
        <YStack gap="$2">
          <Text color="$color" fontSize="$4">
            Host administrator
          </Text>
          {Platform.OS === 'web' ? (
            <TextInput
              placeholder="Username"
              value={username}
              onChangeText={(text) => {
                setUsername(text)
                resetHostVerification()
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              style={webInputStyle}
            />
          ) : (
            <Input
              placeholder="Username"
              value={username}
              onChangeText={(text) => {
                setUsername(text)
                resetHostVerification()
              }}
              autoCapitalize="none"
              autoCorrect={false as unknown as undefined}
              borderColor="$borderColor"
              bg="$background"
              disabled={loading}
            />
          )}
          <PasswordField
            value={password}
            onChangeText={(text) => {
              setPassword(text)
              resetHostVerification()
            }}
            showPassword={showHostPassword}
            onToggleShow={() => setShowHostPassword((v) => !v)}
            disabled={loading}
          />
        </YStack>
      </Animated.View>

      <Animated.View style={[{ overflow: 'hidden' }, superadminSectionStyle]}>
        <YStack gap="$2" pt="$2">
          <Text color="$color" fontSize="$4">
            Superadmin account
          </Text>
          {Platform.OS === 'web' ? (
            <TextInput
              placeholder="you@example.com"
              value={superadminEmail}
              onChangeText={(text) => {
                setSuperadminEmail(text)
                setError('')
              }}
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
              value={superadminEmail}
              onChangeText={(text) => {
                setSuperadminEmail(text)
                setError('')
              }}
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false as unknown as undefined}
              borderColor="$borderColor"
              bg="$background"
              disabled={loading}
            />
          )}
          <PasswordField
            value={superadminPassword}
            onChangeText={(text) => {
              setSuperadminPassword(text)
              setError('')
            }}
            showPassword={showSuperadminPassword}
            onToggleShow={() => setShowSuperadminPassword((v) => !v)}
            disabled={loading}
          />
        </YStack>
      </Animated.View>

      {error ? (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      ) : null}
      <Button
        onPress={hostVerified ? handleCompleteSetup : handleHostAuth}
        theme="accent"
        size="$4"
        disabled={loading || (hostVerified && (!superadminEmail.trim() || !superadminPassword))}
        opacity={loading ? 0.7 : 1}
      >
        {submitButtonLabel(loading, hostVerified)}
      </Button>
    </YStack>
  )
}
