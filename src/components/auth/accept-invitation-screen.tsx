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
import {
  acceptInvitation,
  getInvitationPreviewById,
  getInvitationPreviewByToken,
  signUpForInvitation,
} from '@/lib/instance-api'
import {
  invitationActionErrorCopy,
  invitationLandingView,
  invitationLinkFromParams,
  isAccountExistsError,
  unavailableInvitationCopy,
  type InvitationLandingView,
} from '@/lib/invitation-landing'
import { invitationLandingPath, signInReturningTo } from '@/lib/invitation-return'
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
 * The page the invitation email links to (`?token=<secret>`; `?id=` for links
 * sent before link secrets). It never accepts on load: an existing account
 * signs in and presses Accept; a new address creates its password here, which
 * accepts and signs in (owner decision 2026-09-27). Only the secret can show
 * the invited email or create the account.
 */
export function AcceptInvitationScreenContent() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string | string[]; token?: string | string[] }>()
  const link = invitationLinkFromParams({
    token: normalizeParam(params.token),
    id: normalizeParam(params.id),
  })
  let linkKey = ''
  if (link) {
    const linkValue = link.kind === 'token' ? link.token : link.id
    linkKey = `${link.kind}:${linkValue}`
  }
  const landingPath = link ? invitationLandingPath(link) : '/sign-in'
  const { session, isLoading: sessionLoading, signOut, refreshSession } = useAuth()
  const { data: instanceInfo } = useAuthStatus()
  const runtime = useMemo(() => resolveControlPlaneRuntime(instanceInfo), [instanceInfo])
  const accent = useMemo(() => authAccentForRuntime(runtime), [runtime])
  const tint = useMemo(() => authAccentStyles(accent), [accent])

  const preview = useQuery({
    queryKey: ['invitation-preview', linkKey],
    queryFn: () =>
      link?.kind === 'token'
        ? getInvitationPreviewByToken(link.token)
        : getInvitationPreviewById(link?.id ?? ''),
    enabled: link !== null,
    retry: false,
    staleTime: 30_000,
  })

  const view = invitationLandingView({
    link,
    sessionLoading,
    sessionEmail: session?.email ?? null,
    preview: preview.data,
    previewLoading: link !== null && preview.isLoading,
    previewError: preview.error ?? undefined,
  })

  // An existing account goes straight to sign-in, which returns here for Accept.
  useEffect(() => {
    if (view.kind !== 'sign-in') return
    router.replace(
      signInReturningTo(landingPath, {
        email: view.email,
        organizationName: view.organizationName,
      }) as Href,
    )
  }, [view, landingPath, router])

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
    case 'missing-link':
      return shell(
        <Text style={authFormStyles.error} accessibilityRole="alert">
          This invitation link is incomplete. Open the link from the email again.
        </Text>,
        undefined,
        backToSignIn,
      )
    case 'not-found':
      return shell(
        <Text style={authFormStyles.error} accessibilityRole="alert">
          This invitation link is not valid anymore — it may have been re-sent. Use the newest
          email, or ask whoever invited you to send a new one.
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
              signInReturningTo(landingPath, {
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
          invitationId={view.invitationId}
          view={view}
          onAccepted={openOrganization}
          shell={shell}
          tint={tint}
        />
      )
    case 'create-password':
      return (
        <CreatePassword
          token={link?.kind === 'token' ? link.token : ''}
          view={view}
          accentColor={accent.accent}
          onJoined={openOrganization}
          onAccountExists={() =>
            router.replace(
              signInReturningTo(landingPath, {
                email: view.email,
                organizationName: view.organizationName,
              }) as Href,
            )
          }
          shell={shell}
          tint={tint}
        />
      )
    case 'sign-in-to-accept':
      return shell(
        <>
          <Text style={styles.statusCopy}>
            {`Sign in with the invited email to accept your invitation to ${view.organizationName}. New here? Create an account with that email first.`}
          </Text>
          <AuthPrimaryButton
            onPress={() =>
              router.push(
                signInReturningTo(landingPath, { organizationName: view.organizationName }) as Href,
              )
            }
            accessibilityLabel="Sign in"
            label="Sign in"
            tint={tint}
          />
        </>,
        undefined,
        <Link href={`/sign-up?invitationId=${encodeURIComponent(view.invitationId)}` as Href} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Create an account" style={webPointer}>
            <Text style={authFormStyles.footerLink}>
              New here?{' '}
              <Text style={[authFormStyles.footerLinkAccent, tint.footerLinkAccent]}>
                Create an account
              </Text>
            </Text>
          </Pressable>
        </Link>,
      )
    case 'error':
      return shell(
        <>
          <Text style={authFormStyles.error} accessibilityRole="alert">
            {"Couldn't load this invitation. Check your connection and try again."}
          </Text>
          <AuthPrimaryButton
            onPress={() => {
              preview.refetch().catch(() => undefined)
            }}
            accessibilityLabel="Try again"
            label="Try again"
            tint={tint}
          />
        </>,
        undefined,
        backToSignIn,
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
          void onSwitch().finally(() => setBusy(false))
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
  token,
  view,
  accentColor,
  onJoined,
  onAccountExists,
  shell,
  tint,
}: Readonly<{
  token: string
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
      const joined = await signUpForInvitation(token, password)
      await onJoined(joined.organizationId)
    } catch (err) {
      setSubmitting(false)
      if (isAccountExistsError(err)) {
        onAccountExists()
        return
      }
      setError(invitationActionErrorCopy(err))
    }
  }, [validation.isValid, loading, password, token, onJoined, onAccountExists])

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
