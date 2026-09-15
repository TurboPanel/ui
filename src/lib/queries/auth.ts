import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  bootstrapInstall,
  completeInstall,
  createOrganization,
  deletePasskey,
  disableTwoFactor,
  enrollTotp,
  fetchInstallStatus,
  fetchOrganizations,
  fetchSession,
  fetchTwoFactorStatus,
  isTwoFactorChallenge,
  passkeyLoginOptions,
  passkeyLoginVerify,
  passkeyRegisterOptions,
  passkeyRegisterVerify,
  regenerateBackupCodes,
  signIn,
  signInTwoFactor,
  signOut,
  signUp,
  unlinkProvider,
  updateOrganization,
  verifyEmail,
  verifyTotp,
  type InstallCompleteResult,
  type InstallStatus,
  type OrganizationRecord,
  type OAuthProvider,
  type SessionInfo,
  type TwoFactorCodeKind,
} from '@/lib/instance-api'
import {
  getActiveControlPlaneAccount,
  rememberSignedInAccount,
  removeActiveControlPlaneAccount,
} from '@/lib/control-plane-accounts'
import { isRemoteCookieClient } from '@/lib/control-plane'
import { setActiveOrganizationId } from '@/lib/org-context'
import { loginWithPasskey } from '@/lib/passkey-client'
import { PASSKEY_WEB_ONLY_NOTE } from '@/lib/passkey-client-types'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useSessionQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: fetchSession,
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

export function useInstallStatusQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.status,
    queryFn: fetchInstallStatus,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    retry: false,
  })
}

export function useOrganizationsQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.organizations,
    queryFn: fetchOrganizations,
    enabled: options?.enabled ?? true,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.organizations,
      })
    },
  })
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      organizationId,
      name,
    }: {
      organizationId: string
      name: string
    }) => updateOrganization(organizationId, { name }),
    onSuccess: (data) => {
      queryClient.setQueryData<{ organizations: OrganizationRecord[] }>(
        queryKeys.auth.organizations,
        (previous) => {
          if (!previous) {
            return previous
          }
          return {
            organizations: previous.organizations.map((org) =>
              org.id === data.organization.id ? data.organization : org,
            ),
          }
        },
      )
    },
  })
}

/** Cache + remembered-account bookkeeping every successful sign-in lane runs. */
async function applySignedInSession(
  queryClient: QueryClient,
  session: SessionInfo,
): Promise<void> {
  queryClient.setQueryData<SessionInfo | null>(queryKeys.auth.session, session)
  if (isRemoteCookieClient()) {
    const status = queryClient.getQueryData<InstallStatus>(
      queryKeys.auth.status,
    )
    rememberSignedInAccount({
      email: session.email,
      runtime: status?.runtime ?? null,
    })
  }
  await queryClient.invalidateQueries({
    queryKey: queryKeys.auth.status,
  })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => signIn(email, password),
    onSuccess: async (result) => {
      // A pending second factor is not a session yet — leave the cache alone
      // until the code step answers.
      if (isTwoFactorChallenge(result)) return
      await applySignedInSession(queryClient, result)
    },
  })
}

export function useSignInTwoFactor() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      challenge,
      code,
      kind,
    }: {
      challenge: string
      code: string
      kind?: TwoFactorCodeKind
    }) => signInTwoFactor(challenge, code, kind),
    onSuccess: async (session) => {
      await applySignedInSession(queryClient, session)
    },
  })
}

/**
 * One WebAuthn assertion round trip: ask the control plane for options, run the
 * ceremony in the browser, then post the credential back for a session.
 */
async function runPasskeyLogin(): Promise<SessionInfo> {
  const { challenge, options } = await passkeyLoginOptions()
  const result = await loginWithPasskey(options)
  if (!result.supported) {
    throw new Error(PASSKEY_WEB_ONLY_NOTE)
  }
  return await passkeyLoginVerify(challenge, result.credential)
}

export function useSignInWithPasskey() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: runPasskeyLogin,
    onSuccess: async (session) => {
      await applySignedInSession(queryClient, session)
    },
  })
}

export function useSignUp() {
  return useApiMutation({
    mutationFn: ({
      email,
      password,
      invitationId,
    }: {
      email: string
      password: string
      invitationId?: string
    }) =>
      invitationId
        ? signUp(email, password, invitationId)
        : signUp(email, password),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async () => {
      const result = await signOut()
      if (isRemoteCookieClient()) {
        removeActiveControlPlaneAccount()
      }
      return result
    },
    onSuccess: () => {
      const next = isRemoteCookieClient()
        ? getActiveControlPlaneAccount()
        : null
      setActiveOrganizationId(next?.lastOrgId ?? null)
      // Drop every cached row so a second sign-in never renders another account.
      queryClient.clear()
    },
  })
}

export function useBootstrapInstall() {
  return useApiMutation({
    mutationFn: ({
      username,
      password,
    }: {
      username: string
      password: string
    }) => bootstrapInstall(username, password),
  })
}

export function useCompleteInstall() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: completeInstall,
    onSuccess: async (result: InstallCompleteResult) => {
      queryClient.setQueryData<SessionInfo | null>(
        queryKeys.auth.session,
        result,
      )
      // Clear install mode before navigation so AuthGuard / org layout do not
      // bounce back to /install while status refetch is in flight.
      queryClient.setQueryData<InstallStatus>(
        queryKeys.auth.status,
        (previous) => {
          if (!previous) {
            return {
              needsInstall: false,
              isInstallMode: false,
              isSignupEnabled: false,
            }
          }
          return {
            ...previous,
            needsInstall: false,
            isInstallMode: false,
          }
        },
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.auth.status,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.auth.organizations,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(result.organizationId).servers.list,
        }),
      ])
    },
  })
}

export function useVerifyEmail() {
  return useApiMutation({
    mutationFn: verifyEmail,
  })
}

/**
 * Two-factor status for the signed-in account, including the registered
 * passkeys. One query backs both cards on the security screen — there is no
 * separate passkey list read.
 */
export function useTwoFactorStatusQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.twoFactor,
    queryFn: fetchTwoFactorStatus,
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

async function invalidateTwoFactor(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactor })
}

async function invalidatePasskeys(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactor }),
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.passkeys }),
  ])
}

/**
 * Keep the cached session's `is2faEnabled` in step with an enroll/disable the
 * user just performed, so chrome reading the session does not lag a refetch.
 */
function setSessionTwoFactorEnabled(
  queryClient: QueryClient,
  enabled: boolean,
): void {
  queryClient.setQueryData<SessionInfo | null>(
    queryKeys.auth.session,
    (previous) => (previous ? { ...previous, is2faEnabled: enabled } : previous),
  )
}

export function useEnrollTotp() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ password }: { password?: string }) => enrollTotp(password),
    onSuccess: async () => {
      await invalidateTwoFactor(queryClient)
    },
  })
}

export function useVerifyTotp() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ code }: { code: string }) => verifyTotp(code),
    onSuccess: async () => {
      setSessionTwoFactorEnabled(queryClient, true)
      await invalidateTwoFactor(queryClient)
    },
  })
}

export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ password }: { password?: string }) =>
      regenerateBackupCodes(password),
    onSuccess: async () => {
      await invalidateTwoFactor(queryClient)
    },
  })
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ password, code }: { password?: string; code?: string }) =>
      disableTwoFactor(password, code),
    onSuccess: async () => {
      setSessionTwoFactorEnabled(queryClient, false)
      await invalidateTwoFactor(queryClient)
    },
  })
}

export function usePasskeyRegisterOptions() {
  return useApiMutation({
    mutationFn: ({ password }: { password?: string }) =>
      passkeyRegisterOptions(password),
  })
}

export function usePasskeyRegisterVerify() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      challenge,
      name,
      credential,
    }: {
      challenge: string
      name: string
      credential: unknown
    }) => passkeyRegisterVerify(challenge, name, credential),
    onSuccess: async () => {
      await invalidatePasskeys(queryClient)
    },
  })
}

export function useDeletePasskey() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      deletePasskey(id, password),
    onSuccess: async () => {
      await invalidatePasskeys(queryClient)
    },
  })
}

export function useUnlinkProvider() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      provider,
      password,
    }: {
      provider: OAuthProvider
      password?: string
    }) => unlinkProvider(provider, password),
    onSuccess: async () => {
      await invalidateTwoFactor(queryClient)
    },
  })
}
