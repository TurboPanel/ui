import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { AuthFloatingField } from '@/components/auth/auth-floating-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import { authFormStyles } from '@/components/auth/auth-form-styles'
import { setActiveOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref, replaceOrganization } from '@/lib/org-navigation'
import {
  useBootstrapInstall,
  useCompleteInstall,
} from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

/** Neutral chrome for install — no runtime accent wash or CTA tint. */
const INSTALL_CHROME = colors.borderMuted
const INSTALL_FOCUS = colors.textMuted

function submitButtonLabel(loading: boolean, hostVerified: boolean): string {
  if (loading) {
    return hostVerified ? 'Setting up…' : 'Authenticating…'
  }
  return hostVerified ? 'Complete setup' : 'Continue'
}

function submitAccessibilityLabel(
  loading: boolean,
  hostVerified: boolean,
): string {
  if (loading) {
    return hostVerified ? 'Setting up' : 'Authenticating'
  }
  return hostVerified ? 'Complete setup' : 'Continue'
}

export function InstallScreenContent() {
  const router = useRouter()
  const bootstrapInstallMutation = useBootstrapInstall()
  const completeInstallMutation = useCompleteInstall()
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
  const [success, setSuccess] = useState(false)
  const loading =
    bootstrapInstallMutation.isPending || completeInstallMutation.isPending

  const resetHostVerification = useCallback(() => {
    setHostVerified(false)
    setError('')
  }, [])

  const onUsernameChange = useCallback(
    (text: string) => {
      setUsername(text)
      resetHostVerification()
    },
    [resetHostVerification],
  )

  const onHostPasswordChange = useCallback(
    (text: string) => {
      setPassword(text)
      resetHostVerification()
    },
    [resetHostVerification],
  )

  const onSuperadminEmailChange = useCallback((text: string) => {
    setSuperadminEmail(text)
    setError('')
  }, [])

  const onSuperadminPasswordChange = useCallback((text: string) => {
    setSuperadminPassword(text)
    setError('')
  }, [])

  const handleHostAuth = useCallback(async () => {
    if (!username.trim() || !password) {
      setError('Enter host username and password')
      return
    }

    setError('')
    try {
      await bootstrapInstallMutation.mutateAsync({
        username: username.trim(),
        password,
      })
      setHostVerified(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Host authentication failed')
    }
  }, [username, password, bootstrapInstallMutation])

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
    try {
      const result = await completeInstallMutation.mutateAsync({
        username: username.trim(),
        password,
        superadminEmail,
        superadminPassword,
      })
      setSuccess(true)
      setActiveOrganizationId(result.organizationId)
      replaceOrganization(
        router,
        defaultOrgDashboardHref(result.organizationId) as Href,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
      setSuccess(false)
    }
  }, [
    username,
    password,
    superadminEmail,
    superadminPassword,
    completeInstallMutation,
    router,
  ])

  const onSubmit = useCallback(() => {
    const run = hostVerified ? handleCompleteSetup : handleHostAuth
    run().catch(() => {
      // Errors are surfaced via setError inside the handlers.
    })
  }, [hostVerified, handleCompleteSetup, handleHostAuth])

  useEffect(() => {
    if (instanceInfoLoading || success) return
    if (!isInstallMode) router.replace('/sign-in')
  }, [instanceInfoLoading, isInstallMode, success, router])

  if (success) {
    return (
      <AuthScreenShell
        title="Install"
        description="Signing you in…"
        accentColor={INSTALL_CHROME}
        animateBackdrop={false}
      >
        <Text style={authFormStyles.pageCopy}>Installation complete.</Text>
      </AuthScreenShell>
    )
  }

  if (instanceInfoLoading || !isInstallMode) return null

  const introText = hostVerified
    ? 'Host verified. Create your superadmin account below.'
    : 'Sign in with root or a sudo-capable host account to begin setup.'

  const completeDisabled =
    loading ||
    (hostVerified && (!superadminEmail.trim() || !superadminPassword))

  return (
    <AuthScreenShell
      title="Install"
      description={introText}
      accentColor={INSTALL_CHROME}
      animateBackdrop={false}
    >
      <Text style={authFormStyles.label}>Host administrator</Text>

      <View style={authFormStyles.field}>
        <AuthFloatingField
          label="Username"
          value={username}
          onChangeText={onUsernameChange}
          accentColor={INSTALL_FOCUS}
          autoComplete="username"
          editable={!loading}
          returnKeyType="next"
        />
      </View>

      <View style={[authFormStyles.field, authFormStyles.fieldSpaced]}>
        <AuthFloatingField
          label="Password"
          value={password}
          onChangeText={onHostPasswordChange}
          accentColor={INSTALL_FOCUS}
          autoComplete="password"
          secureTextEntry={!showHostPassword}
          showPasswordToggle
          passwordVisible={showHostPassword}
          onTogglePasswordVisible={() => setShowHostPassword((v) => !v)}
          editable={!loading}
          returnKeyType={hostVerified ? 'next' : 'go'}
          onSubmitEditing={hostVerified ? undefined : onSubmit}
        />
      </View>

      {hostVerified ? (
        <>
          <Text style={[authFormStyles.label, { marginTop: spacing.sm }]}>
            Superadmin account
          </Text>

          <View style={authFormStyles.field}>
            <AuthFloatingField
              label="Email"
              value={superadminEmail}
              onChangeText={onSuperadminEmailChange}
              accentColor={INSTALL_FOCUS}
              autoComplete="email"
              keyboardType="email-address"
              editable={!loading}
              returnKeyType="next"
            />
          </View>

          <View style={[authFormStyles.field, authFormStyles.fieldSpaced]}>
            <AuthFloatingField
              label="Password"
              value={superadminPassword}
              onChangeText={onSuperadminPasswordChange}
              accentColor={INSTALL_FOCUS}
              autoComplete="new-password"
              secureTextEntry={!showSuperadminPassword}
              showPasswordToggle
              passwordVisible={showSuperadminPassword}
              onTogglePasswordVisible={() =>
                setShowSuperadminPassword((v) => !v)
              }
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
          </View>
        </>
      ) : null}

      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <AuthPrimaryButton
        onPress={onSubmit}
        disabled={completeDisabled}
        busy={loading}
        accessibilityLabel={submitAccessibilityLabel(loading, hostVerified)}
        label={submitButtonLabel(false, hostVerified)}
        busyLabel={submitButtonLabel(true, hostVerified)}
        tint={{
          primaryButton: { backgroundColor: colors.text },
          primaryButtonText: { color: colors.buttonText },
        }}
        spinnerColor={colors.buttonText}
      />
    </AuthScreenShell>
  )
}
