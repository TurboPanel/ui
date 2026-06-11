import { useCallback, useEffect, useState } from 'react'
import { Platform, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { YStack, XStack, Input, Button, Text } from 'tamagui'
import { useRouter, type Href } from 'expo-router'
import { bootstrapInstall, completeInstall } from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import { useAuthStatus } from '@/lib/query-client'
import { colors } from '@/lib/theme'

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

export default function InstallScreen() {
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
          <Text fontSize="$6" fontWeight="bold" color="$color">
            Installation complete 🎉
          </Text>
          <Text color="$gray11" fontSize="$4">
            Signing you in…
          </Text>
        </YStack>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <YStack flex={1} backgroundColor="$background" padding="$6" justifyContent="center" gap="$4">
        <Text fontSize="$6" fontWeight="bold" color="$color">
          Set up your TurboPanel instance
        </Text>
        <Text color="$gray11" fontSize="$4">
          {hostVerified
            ? 'Create your superadmin account. Organization and team use default names.'
            : 'Sign in with root or a sudo-capable host account to begin setup.'}
        </Text>

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
                setError('')
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !hostVerified}
              style={webInputStyle}
            />
          ) : (
            <Input
              placeholder="Username"
              value={hostUsername}
              onChangeText={(text) => {
                setHostUsername(text)
                setError('')
              }}
              autoCapitalize="none"
              autoCorrect={false as unknown as undefined}
              borderColor="$borderColor"
              backgroundColor="$background"
              editable={!loading && !hostVerified}
            />
          )}
          <XStack position="relative" alignItems="center">
            {Platform.OS === 'web' ? (
              <TextInput
                placeholder="Password"
                value={hostPassword}
                onChangeText={(text) => {
                  setHostPassword(text)
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

        {hostVerified ? (
          <YStack gap="$2">
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
        ) : null}

        {error ? (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        ) : null}
        <Button
          onPress={hostVerified ? handleCompleteSetup : handleHostAuth}
          theme="active"
          size="$4"
          disabled={loading}
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
    </SafeAreaView>
  )
}
