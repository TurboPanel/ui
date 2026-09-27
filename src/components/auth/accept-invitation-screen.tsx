import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AuthNewPasswordField } from '@/components/auth/auth-new-password-field'
import { AuthPrimaryButton } from '@/components/auth/auth-primary-button'
import { AuthScreenShell } from '@/components/auth/auth-screen-shell'
import { authAccentStyles, authFormStyles, webPointer } from '@/components/auth/auth-form-styles'
import {
  authAccentForRuntime,
  authSpinnerColor,
  resolveControlPlaneRuntime,
} from '@/lib/auth-accent'
import { useAuth } from '@/lib/auth-context'
import { acceptInvitation, getInvitationPreview, signUpForInvitation } from '@/lib/instance-api'
import {
  invitationActionErrorCopy,
  invitationLandingView,
  isAccountExistsError,
  unavailableInvitationCopy,
  type InvitationLandingView,
} from '@/lib/invitation-landing'
import { signInForInvitationHref } from '@/lib/invitation-return'
import {
  checkPwnedPassword,
  COMPROMISED_PASSWORD_MESSAGE,
  passwordHint,
  resolveMeterStatus,
  validatePassword,
} from '@/lib/password-policy'
import { useAuthStatus } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function normalizeParam(param: string | string[] | undefined): string {
  if (param == null) return ''
  if (Array.isArray(param)) {
    const first = param.find((value) => typeof value === 'string' && value.trim().length > 0)
    return first == null ? '' : first.trim()
  }
  return typeof param === 'string' ? param.trim() : ''
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
  },
  statusCopy: {
    color: colors.textBody,
    fontSize: 14,
    lineHeight: 21,
  },
  fixedEmail: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  warning: {
    color: colors.pending,
    fontSize: 13,
    lineHeight: 18,
  },
})

const TITLE = 'Accept invitation'

/**
 * The page the invitation email links to. It never accepts on load: an
 * existing account signs in and presses Accept; a new address creates its
 * password here, which accepts and signs in (owner decision 2026-09-27).
 */
export function AcceptInvitationScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string | string[] }>()
  const invitationId = normalizeParam(params.id)
  const { session, isLoading: sessionLoading, signOut, refreshSession } = useAuth()
  const { data: instanceInfo } = useAuthStatus()
  const runtime = useMemo(() => resolveControlPlaneRuntime(instanceInfo), [instanceInfo])
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  const preview = useQuery({
    queryKey: ['invitation-preview', invitationId],
    queryFn: () => getInvitationPreview(invitationId),
    enabled: invitationId.length > 0,
    retry: false,
    staleTime: 30_000,
  })

  const view = invitationLandingView({
    invitationId,
    sessionLoading,
    sessionEmail: session?.email ?? null,
    preview: preview.data,
    previewLoading: invitationId.length > 0 && preview.isLoading,
    previewError: preview.error ?? undefined,
  })

  // An existing account goes straight to sign-in, which returns here for Accept.
  useEffect(() => {
    if (view.kind !== 'sign-in') return
    router.replace(
      signInForInvitationHref(invitationId, {
        email: view.email,
        organizationName: view.organizationName,
      }) as Href,
    )
  }, [view, invitationId, router])

  const openOrganization = useCallback(
    async (organizationId: string) => {
      await refreshSession().catch(() => null)
      router.replace(`/${organizationId}/overview` as Href)
    },
    [refreshSession, router],
  )

  const shell = (children: ReactNode, description?: string, footer?: ReactNode) => (
    <AuthScreenShell
      title={TITLE}
      description={description}
      footer={footer}
      accentColor={accent.accent}
    >
      {children}
    </AuthScreenShell>
  )

  const spinner = (copy: string) =>
    shell(
      <View style={styles.statusRow} accessibilityRole="progressbar">
        <ActivityIndicator size="small" color={authSpinnerColor(runtime)} />
        <Text style={styles.statusCopy}>{copy}</Text>
      </View>,
    )

  const backToSignIn = (
    <Link href="/sign-in" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel="Back to sign in" style={webPointer}>
        <Text style={authFormStyles.footerLink}>
          Back to{' '}
          <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>sign in</Text>
        </Text>
      </Pressable>
    </Link>
  )

  switch (view.kind) {
    case 'loading':
    case 'sign-in':
      return spinner(view.kind === 'sign-in' ? 'Taking you to sign in…' : 'Loading your invitation…')
    case 'missing-id':
      return shell(
        <Text style={authFormStyles.error} accessibilityRole="alert">
          This invitation link is missing its id. Open the link from the email again.
        </Text>,
        undefined,
        backToSignIn,
      )
    case 'not-found':
      return shell(
        <Text style={authFormStyles.error} accessibilityRole="alert">
          This invitation could not be found. Ask whoever invited you to send a new one.
        </Text>,
        undefined,
        backToSignIn,
      )
    case 'unavailable':
      return shell(
        <Text style={styles.statusCopy}>
          {unavailableInvitationCopy(view.status, view.organizationName)}
        </Text>,
        undefined,
        backToSignIn,
      )
    case 'wrong-account':
      return (
        <WrongAccount
          view={view}
          onSwitch={async () => {
            await signOut().catch(() => undefined)
            router.replace(
              signInForInvitationHref(invitationId, {
                email: view.invitedEmail,
                organizationName: view.organizationName,
              }) as Href,
            )
          }}
          shell={shell}
          tint={tint}
        />
      )
    case 'accept':
      return (
        <AcceptButton
          invitationId={invitationId}
          view={view}
          onAccepted={openOrganization}
          shell={shell}
          tint={tint}
        />
      )
    case 'create-password':
      return (
        <CreatePassword
          invitationId={invitationId}
          view={view}
          accentColor={accent.accent}
          onJoined={openOrganization}
          onAccountExists={() =>
            router.replace(
              signInForInvitationHref(invitationId, {
                email: view.email,
                organizationName: view.organizationName,
              }) as Href,
            )
          }
          shell={shell}
          tint={tint}
        />
      )
    case 'fallback':
      return view.signedIn ? (
        <AcceptButton
          invitationId={invitationId}
          view={{ kind: 'accept', organizationName: 'this organization', inviterName: null }}
          onAccepted={openOrganization}
          shell={shell}
          tint={tint}
        />
      ) : (
        shell(
          <>
            <Text style={styles.statusCopy}>
              Sign in with the invited email to accept this invitation.
            </Text>
            <AuthPrimaryButton
              onPress={() => router.push(signInForInvitationHref(invitationId) as Href)}
              accessibilityLabel="Sign in"
              label="Sign in"
              tint={tint}
            />
          </>,
          undefined,
          backToSignIn,
        )
      )
  }
}

type Shell = (children: ReactNode, description?: string, footer?: ReactNode) => ReactElement
type Tint = ReturnType<typeof authAccentStyles>

function AcceptButton({
  invitationId,
  view,
  onAccepted,
  shell,
  tint,
}: Readonly<{
  invitationId: string
  view: Extract<InvitationLandingView, { kind: 'accept' }>
  onAccepted: (organizationId: string) => Promise<void>
  shell: Shell
  tint: Tint
}>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const onPress = () => {
    setBusy(true)
    setError('')
    acceptInvitation(invitationId)
      .then((result) => onAccepted(result.organizationId))
      .catch((err: unknown) => {
        setError(invitationActionErrorCopy(err))
        setBusy(false)
      })
  }
  const invitedBy = view.inviterName ? ` ${view.inviterName} invited you to join it.` : ''
  return shell(
    <>
      <Text style={styles.statusTitle}>{`Join ${view.organizationName}`}</Text>
      <Text style={styles.statusCopy}>
        {`You've been invited to ${view.organizationName}.${invitedBy}`}
      </Text>
      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <AuthPrimaryButton
        onPress={onPress}
        accessibilityLabel="Accept invitation"
        label="Accept invitation"
        busyLabel="Joining…"
        busy={busy}
        disabled={busy}
        tint={tint}
      />
    </>,
  )
}

function WrongAccount({
  view,
  onSwitch,
  shell,
  tint,
}: Readonly<{
  view: Extract<InvitationLandingView, { kind: 'wrong-account' }>
  onSwitch: () => Promise<void>
  shell: Shell
  tint: Tint
}>) {
  const [busy, setBusy] = useState(false)
  return shell(
    <>
      <Text style={styles.statusTitle}>This invitation is for another account</Text>
      <Text style={styles.statusCopy}>
        {`You're signed in as ${view.signedInAs}. This invitation to ${view.organizationName} is for ${view.invitedEmail}.`}
      </Text>
      <AuthPrimaryButton
        onPress={() => {
          setBusy(true)
          onSwitch().finally(() => setBusy(false))
        }}
        accessibilityLabel="Switch account"
        label="Switch account"
        busyLabel="Signing out…"
        busy={busy}
        disabled={busy}
        tint={tint}
      />
    </>,
  )
}

function CreatePassword({
  invitationId,
  view,
  accentColor,
  onJoined,
  onAccountExists,
  shell,
  tint,
}: Readonly<{
  invitationId: string
  view: Extract<InvitationLandingView, { kind: 'create-password' }>
  accentColor: string
  onJoined: (organizationId: string) => Promise<void>
  onAccountExists: () => void
  shell: Shell
  tint: Tint
}>) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pwnedWarning, setPwnedWarning] = useState('')
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const validation = useMemo(() => validatePassword(password), [password])
  const loading = checking || submitting

  const onSubmit = useCallback(async () => {
    if (!validation.isValid || loading) return
    setError('')
    setChecking(true)
    let pwned = false
    try {
      pwned = await checkPwnedPassword(password)
    } finally {
      setChecking(false)
    }
    if (pwned) {
      setPwnedWarning(COMPROMISED_PASSWORD_MESSAGE)
      return
    }
    setSubmitting(true)
    try {
      const joined = await signUpForInvitation(invitationId, password)
      await onJoined(joined.organizationId)
    } catch (err) {
      setSubmitting(false)
      if (isAccountExistsError(err)) {
        onAccountExists()
        return
      }
      setError(invitationActionErrorCopy(err))
    }
  }, [validation.isValid, loading, password, invitationId, onJoined, onAccountExists])

  const meterStatus = resolveMeterStatus({
    hasPwnedResult: pwnedWarning !== '',
    isPwned: pwnedWarning ? true : null,
    checking,
    isValid: validation.isValid,
  })

  return shell(
    <>
      <Text style={styles.statusCopy}>Your email</Text>
      <Text style={styles.fixedEmail} accessibilityLabel={`Your email: ${view.email}`}>
        {view.email}
      </Text>
      <AuthNewPasswordField
        label="Create a password"
        value={password}
        onChangeText={(text) => {
          setPassword(text)
          setError('')
          setPwnedWarning('')
        }}
        onSubmit={onSubmit}
        editable={!loading}
        accentColor={accentColor}
        validation={validation}
        meterStatus={meterStatus}
        meterHint={passwordHint(validation)}
        spaced
      />
      {pwnedWarning ? (
        <Text style={styles.warning} accessibilityRole="alert">
          {pwnedWarning}
        </Text>
      ) : null}
      {error ? (
        <Text style={authFormStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <AuthPrimaryButton
        onPress={() => {
          onSubmit().catch(() => {
            // Errors are surfaced via setError inside onSubmit.
          })
        }}
        accessibilityLabel={`Join ${view.organizationName}`}
        label={`Join ${view.organizationName}`}
        busyLabel="Joining…"
        busy={loading}
        disabled={loading || !validation.isValid}
        tint={tint}
      />
    </>,
    `Create a password to sign in to ${view.organizationName}.`,
  )
}
