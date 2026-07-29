import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Link, useRouter, type Href } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import {
  authAccentForRuntime,
  resolveControlPlaneRuntime,
} from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { useAuthStatus } from '@/lib/query-client'

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

  const accent = useMemo(
    () =>
      authAccentForRuntime(resolveControlPlaneRuntime(instanceInfo)),
    [instanceInfo],
  )
  const tint = useMemo(() => authAccentStyles(accent), [accent])

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
      setError(err instanceof Error ? err.message : 'Sign In failed')
    } finally {
      setLoading(false)
    }
  }, [email, password, resolveDashboardHref, router, signIn])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (isInstallMode) router.replace('/install')
  }, [instanceInfoLoading, isInstallMode, router])

  if (instanceInfoLoading || isInstallMode) return null

  const signupFooter =
    instanceInfo?.isSignupEnabled === true ? (
      <Link href="/sign-up" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sign up for an account"
          style={webPointer}
        >
          <Text style={authFormStyles.footerLink}>
            Don&apos;t have an account?{' '}
            <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
              Sign up
            </Text>
          </Text>
        </Pressable>
      </Link>
    ) : null

  return (
    <AuthScreenShell title="Sign In" footer={signupFooter}>
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

      <View style={authFormStyles.field}>
        <AuthFloatingField
          label="Password"
          value={password}
          onChangeText={onPasswordChange}
          accentColor={accent.accent}
          autoComplete="password"
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

      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          onSubmit().catch(() => {
            // Errors are surfaced via setError inside onSubmit.
          })
        }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={loading ? 'Signing In' : 'Sign In'}
        style={({ pressed }) => [
          authFormStyles.primaryButton,
          tint.primaryButton,
          loading && authFormStyles.primaryButtonDisabled,
          pressed && !loading && authFormStyles.primaryButtonPressed,
          webPointer,
        ]}
      >
        <Text style={[authFormStyles.primaryButtonText, tint.primaryButtonText]}>
          {loading ? 'Signing In…' : 'Sign In'}
        </Text>
      </Pressable>
    </AuthScreenShell>
  )
}
