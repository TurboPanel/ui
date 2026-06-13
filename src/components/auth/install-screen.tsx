import { useCallback, useEffect, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { useRouter, type Href } from 'expo-router'
import { bootstrapInstall, completeInstall } from '@/lib/instance-api'
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

export function InstallScreenContent() {
  const router = useRouter()
  const { refreshSession, refreshInstallStatus } = useAuth()
  const { data: instanceInfo, isLoading: instanceInfoLoading } = useAuthStatus()
  const isInstallMode = instanceInfo?.isInstallMode === true
  const [hostVerified, setHostVerified] = useState(false)
  const [hostUsername, setHostUsername] = useState('root')
  const [hostPassword, setHostPassword] = useState('')
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

  const handleHostAuth = useCallback(async () => {
    if (!hostUsername.trim() || !hostPassword) {
      setError('Enter host username and password')
      return
    }

    setError('')
    setLoading(true)
    try {
      await bootstrapInstall(hostUsername.trim(), hostPassword)
      setHostVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Host authentication failed')
    } finally {
      setLoading(false)
    }
  }, [hostUsername, hostPassword])

  const handleCompleteSetup = useCallback(async () => {
    if (!hostUsername.trim() || !hostPassword) {
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
        hostUsername: hostUsername.trim(),
        hostPassword,
        superadminEmail,
        superadminPassword,
      })
      setSuccess(true)
      await refreshInstallStatus()
      await refreshSession()
      router.replace(`/${result.organizationId}/servers/overview` as Href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
      setSuccess(false)
    } finally {
      setLoading(false)
    }
  }, [
    hostUsername,
    hostPassword,
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
      <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Installation complete 🎉
        </Text>
        <Text color="$gray11" fontSize="$4">
          Signing you in…
        </Text>
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
      <Text fontSize="$6" fontWeight="bold" color="$color">
        Set up your TurboPanel instance
      </Text>
      <Text color="$gray11" fontSize="$4">
        {hostVerified
          ? 'Host verified. Create your superadmin account below.'
          : 'Sign in with root or a sudo-capable host account to begin setup.'}
      </Text>

      <Animated.View style={hostSectionStyle}>
        <YStack gap="$2">
          <Text color="$color" fontSize="$4">
            Host administrator
          </Text>
          {Platform.OS === 'web' ? (
            <TextInput
              placeholder="Username"
              value={hostUsername}
              onChangeText={(text) => {
                setHostUsername(text)
                setHostVerified(false)
                setError('')
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              style={webInputStyle}
            />
          ) : (
            <Input
              placeholder="Username"
              value={hostUsername}
              onChangeText={(text) => {
                setHostUsername(text)
                setHostVerified(false)
                setError('')
              }}
              autoCapitalize="none"
              autoCorrect={false as unknown as undefined}
              borderColor="$borderColor"
              backgroundColor="$background"
              editable={!loading}
            />
          )}
          <XStack position="relative" alignItems="center">
            {Platform.OS === 'web' ? (
              <TextInput
                placeholder="Password"
                value={hostPassword}
                onChangeText={(text) => {
                  setHostPassword(text)
                  setHostVerified(false)
                  setError('')
                }}
                secureTextEntry={!showHostPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                style={{ ...webInputStyle, flex: 1 }}
              />
            ) : (
              <Input
                flex={1}
                placeholder="Password"
                value={hostPassword}
                onChangeText={(text) => {
                  setHostPassword(text)
                  setHostVerified(false)
                  setError('')
                }}
                secureTextEntry={!showHostPassword}
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
              onPress={() => setShowHostPassword((v) => !v)}
            >
              {showHostPassword ? 'Hide' : 'Show'}
            </Button>
          </XStack>
        </YStack>
      </Animated.View>

      <Animated.View style={[{ overflow: 'hidden' }, superadminSectionStyle]}>
        <YStack gap="$2" paddingTop="$2">
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
              backgroundColor="$background"
              editable={!loading}
            />
          )}
          <XStack position="relative" alignItems="center">
            {Platform.OS === 'web' ? (
              <TextInput
                placeholder="Password"
                value={superadminPassword}
                onChangeText={(text) => {
                  setSuperadminPassword(text)
                  setError('')
                }}
                secureTextEntry={!showSuperadminPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                style={{ ...webInputStyle, flex: 1 }}
              />
            ) : (
              <Input
                flex={1}
                placeholder="Password"
                value={superadminPassword}
                onChangeText={(text) => {
                  setSuperadminPassword(text)
                  setError('')
                }}
                secureTextEntry={!showSuperadminPassword}
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
              onPress={() => setShowSuperadminPassword((v) => !v)}
            >
              {showSuperadminPassword ? 'Hide' : 'Show'}
            </Button>
          </XStack>
        </YStack>
      </Animated.View>

      {error ? (
        <Text color="$red10" fontSize="$3">
          {error}
        </Text>
      ) : null}
      <Button
        onPress={hostVerified ? handleCompleteSetup : handleHostAuth}
        theme="active"
        size="$4"
        disabled={loading || (hostVerified && (!superadminEmail.trim() || !superadminPassword))}
        opacity={loading ? 0.7 : 1}
      >
        {loading
          ? hostVerified
            ? 'Setting up…'
            : 'Authenticating…'
          : hostVerified
            ? 'Complete setup'
            : 'Continue'}
      </Button>
    </YStack>
  )
}
