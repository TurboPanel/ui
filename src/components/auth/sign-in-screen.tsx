import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import {
  authAccentStyles,
  authFormStyles,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { TwoFactorStep } from '@/components/auth/two-factor-step'
import {
  authAccentForRuntime,
  resolveControlPlaneRuntime,
} from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { isRemoteCookieClient, usesSameOriginApi } from '@/lib/control-plane'
import {
  isTwoFactorChallenge,
  OAUTH_WEB_ONLY_NOTE,
  oauthStartUrl,
  signInOAuthRedirect,
  type OAuthProvider,
} from '@/lib/instance-api'
import { safeAuthReturnPath } from '@/lib/invitation-return'
import { isPasskeySupported } from '@/lib/passkey-client'
import { useSignIn } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { TWO_FACTOR_PROMPT_TITLE } from '@/lib/two-factor-prompt'
import { oauthSignInError } from '@/lib/oauth-sign-in-errors'

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  github: 'GitHub',
  google: 'Google',
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export function SignInScreenContent() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useLocalSearchParams<{
    error?: string | string[]
    challenge?: string | string[]
    redirectTo?: string | string[]
  }>()
  const currentRedirect = useMemo(
    () => signInOAuthRedirect(pathname, params),
    [pathname, params],
  )
  const { resolveDashboardHref, bootstrapError, signInWithPasskey } = useAuth()
  const signInMutation = useSignIn()
  const { data: instanceInfo, isLoading: instanceInfoLoading } = useAuthStatus()
  const isInstallMode = instanceInfo?.isInstallMode === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [challenge, setChallenge] = useState<string | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const loading = signInMutation.isPending
  const passkeyOffered = isPasskeySupported()
  const authProviders = instanceInfo?.authProviders ?? []
  const oauthOnWeb = usesSameOriginApi()

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

  const returnTo = useMemo(
    () => safeAuthReturnPath(firstSearchParam(params.redirectTo)),
    [params.redirectTo],
  )

  const goAfterAuth = useCallback(async () => {
    if (returnTo) {
      router.replace(returnTo as Href)
      return
    }
    const href = await resolveDashboardHref()
    router.replace(href as Href)
  }, [resolveDashboardHref, returnTo, router])

  const onSubmit = useCallback(async () => {
    setError('')
    try {
      const result = await signInMutation.mutateAsync({ email, password })
      if (isTwoFactorChallenge(result)) {
        setChallenge(result.challenge)
        return
      }
      await goAfterAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign In failed')
    }
  }, [email, goAfterAuth, password, signInMutation])

  const onPasskeyPress = useCallback(() => {
    setError('')
    setPasskeyBusy(true)
    signInWithPasskey()
      .then(goAfterAuth)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Passkey sign in failed')
      })
      .finally(() => {
        setPasskeyBusy(false)
      })
  }, [goAfterAuth, signInWithPasskey])

  const onTwoFactorDone = useCallback(() => {
    goAfterAuth().catch(() => {
      // Navigation failures fall back to the guard's own redirect.
    })
  }, [goAfterAuth])

  const onTwoFactorCancel = useCallback(() => {
    setChallenge(null)
    setPassword('')
  }, [])

  useEffect(() => {
    const errorCode = firstSearchParam(params.error)
    if (errorCode) setError(oauthSignInError(errorCode))
    const incomingChallenge = firstSearchParam(params.challenge)
    if (incomingChallenge) setChallenge(incomingChallenge)
  }, [params.challenge, params.error])

  useEffect(() => {
    if (instanceInfoLoading) return
    if (isInstallMode && !isRemoteCookieClient()) {
      router.replace('/install')
    }
  }, [instanceInfoLoading, isInstallMode, router])

  if (instanceInfoLoading || (isInstallMode && !isRemoteCookieClient())) {
    return null
  }

  if (challenge) {
    return (
      <AuthScreenShell
        title={TWO_FACTOR_PROMPT_TITLE}
        accentColor={accent.accent}
      >
        <TwoFactorStep
          challenge={challenge}
          accent={accent}
          tint={tint}
          onAuthenticated={onTwoFactorDone}
          onCancel={onTwoFactorCancel}
        />
      </AuthScreenShell>
    )
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

      <AuthPrimaryButton
        onPress={() => {
          onSubmit().catch(() => {
            // Errors are surfaced via setError inside onSubmit.
          })
        }}
        disabled={loading || passkeyBusy}
        busy={loading}
        accessibilityLabel={loading ? 'Signing In' : 'Sign In'}
        label="Sign In"
        busyLabel="Signing In…"
        tint={tint}
        spinnerColor={accent.onAccent}
      />

      {passkeyOffered ? (
        <Pressable
          onPress={onPasskeyPress}
          disabled={loading || passkeyBusy}
          accessibilityRole="button"
          accessibilityLabel="Sign in with a passkey"
          style={webPointer}
        >
          <Text style={authFormStyles.footerLink}>
            <Text
              style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}
            >
              {passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
            </Text>
          </Text>
        </Pressable>
      ) : null}

      {authProviders.length > 0 && !oauthOnWeb ? (
        <Text style={authFormStyles.footerLink}>{OAUTH_WEB_ONLY_NOTE}</Text>
      ) : null}

      {oauthOnWeb
        ? authProviders.map((provider) => (
            <Pressable
              key={provider}
              onPress={() => {
                void Linking.openURL(
                  oauthStartUrl(provider, { redirectTo: currentRedirect }),
                )
              }}
              disabled={loading || passkeyBusy}
              accessibilityRole="link"
              accessibilityLabel={`Sign in with ${PROVIDER_LABEL[provider]}`}
              style={webPointer}
            >
              <Text style={authFormStyles.footerLink}>
                <Text
                  style={[
                    authFormStyles.footerLinkAccent,
                    tint.footerLinkAccent,
                  ]}
                >
                  Sign in with {PROVIDER_LABEL[provider]}
                </Text>
              </Text>
            </Pressable>
          ))
        : null}
    </AuthScreenShell>
  )
}
