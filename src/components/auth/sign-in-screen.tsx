import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
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
import { isRemoteCookieClient } from '@/lib/control-plane'
import { useSignIn } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'

export function SignInScreenContent() {
  const router = useRouter()
  const { resolveDashboardHref, bootstrapError } = useAuth()
  const signInMutation = useSignIn()
  const { data: instanceInfo, isLoading: instanceInfoLoading } = useAuthStatus()
  const isInstallMode = instanceInfo?.isInstallMode === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const loading = signInMutation.isPending

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
    try {
      await signInMutation.mutateAsync({ email, password })
      const href = await resolveDashboardHref()
      router.replace(href as Href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign In failed')
    }
  }, [email, password, resolveDashboardHref, router, signInMutation])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (isInstallMode && !isRemoteCookieClient()) {
      router.replace('/install')
    }
  }, [instanceInfoLoading, isInstallMode, router])

  if (instanceInfoLoading || (isInstallMode && !isRemoteCookieClient())) {
    return null
  }

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
    <AuthScreenShell
      title="Sign In"
      footer={signupFooter}
      accentColor={accent.accent}
    >
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

      {error || bootstrapError ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error || bootstrapError}
        </Text>
      ) : null}

      {isRemoteCookieClient() ? (
        <Link href="/connect" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Change control plane"
            style={webPointer}
          >
            <Text style={authFormStyles.footerLink}>Change control plane</Text>
          </Pressable>
        </Link>
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
        {loading ? (
          <View style={authFormStyles.primaryButtonContent}>
            <ActivityIndicator size="small" color={accent.onAccent} />
            <Text style={[authFormStyles.primaryButtonText, tint.primaryButtonText]}>
              Signing In…
            </Text>
          </View>
        ) : (
          <Text style={[authFormStyles.primaryButtonText, tint.primaryButtonText]}>
            Sign In
          </Text>
        )}
      </Pressable>
    </AuthScreenShell>
  )
}
