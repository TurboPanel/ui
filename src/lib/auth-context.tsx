import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  applyConsoleChromeRuntime,
  readStoredControlPlaneRuntime,
  resolveControlPlaneRuntime,
  type ControlPlaneRuntime,
} from '@/lib/auth-accent'
import {
  fetchOrganizations,
  type SessionInfo,
} from '@/lib/instance-api'
import {
  resolvePreferredOrganizationId,
  setActiveOrganizationId,
} from '@/lib/org-context'
import {
  isVisibilityQuery,
  queryKeys,
  setForbiddenHandler,
} from '@/lib/query-client'
import {
  useInstallStatusQuery,
  useSessionQuery,
  useSignIn as useSignInMutation,
  useSignOut as useSignOutMutation,
  useSignUp as useSignUpMutation,
} from '@/lib/queries/auth'

type AuthContextValue = {
  session: SessionInfo | null
  /** Deno self-hosted only — false on Workers (bootstrap via sign-up). */
  needsInstall: boolean
  isSignupEnabled: boolean
  /** From `GET /status` — set as soon as status returns during bootstrap. */
  controlPlaneRuntime: ControlPlaneRuntime | undefined
  isLoading: boolean
  bootstrapError: string | null
  signIn: (email: string, password: string) => Promise<SessionInfo>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearSession: () => void
  refreshSession: () => Promise<SessionInfo | null>
  refreshInstallStatus: () => Promise<boolean>
  handleUnauthorized: () => Promise<void>
  resolveDashboardHref: () => Promise<
    '/install' | '/sign-in' | '/welcome' | `/${string}/servers`
  >
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient()
  const statusQuery = useInstallStatusQuery()
  const sessionQuery = useSessionQuery({
    enabled: statusQuery.isSuccess || statusQuery.isError,
  })
  const signInMutation = useSignInMutation()
  const signUpMutation = useSignUpMutation()
  const signOutMutation = useSignOutMutation()

  const session = sessionQuery.data ?? null
  const needsInstall = statusQuery.data?.needsInstall ?? false
  const isSignupEnabled = statusQuery.data?.isSignupEnabled ?? false

  const controlPlaneRuntime = useMemo(() => {
    if (statusQuery.data) {
      return (
        resolveControlPlaneRuntime(statusQuery.data) ??
        readStoredControlPlaneRuntime()
      )
    }
    return readStoredControlPlaneRuntime()
  }, [statusQuery.data])

  useEffect(() => {
    if (!statusQuery.data) return
    const runtime = resolveControlPlaneRuntime(statusQuery.data)
    if (runtime !== undefined) {
      applyConsoleChromeRuntime(runtime)
    }
  }, [statusQuery.data])

  const isLoading =
    statusQuery.isLoading ||
    (statusQuery.isSuccess && sessionQuery.isLoading)

  let bootstrapError: string | null = null
  if (statusQuery.error instanceof Error) {
    bootstrapError = statusQuery.error.message
  } else if (sessionQuery.error instanceof Error) {
    bootstrapError = sessionQuery.error.message
  } else if (statusQuery.error || sessionQuery.error) {
    bootstrapError = 'Failed to load session'
  }

  const refreshInstallStatus = useCallback(async () => {
    const { fetchInstallStatus } = await import('@/lib/instance-api')
    const status = await queryClient.fetchQuery({
      queryKey: queryKeys.auth.status,
      queryFn: fetchInstallStatus,
    })
    return status.needsInstall ?? false
  }, [queryClient])

  const refreshSession = useCallback(async () => {
    const { fetchSession } = await import('@/lib/instance-api')
    return await queryClient.fetchQuery({
      queryKey: queryKeys.auth.session,
      queryFn: fetchSession,
    })
  }, [queryClient])

  const clearSession = useCallback(() => {
    queryClient.setQueryData<SessionInfo | null>(queryKeys.auth.session, null)
    setActiveOrganizationId(null)
  }, [queryClient])

  const handleUnauthorized = useCallback(async () => {
    await queryClient.invalidateQueries({ predicate: isVisibilityQuery })
    const data = await refreshSession()
    if (!data) {
      queryClient.setQueryData<SessionInfo | null>(queryKeys.auth.session, null)
      setActiveOrganizationId(null)
    }
  }, [queryClient, refreshSession])

  useEffect(() => {
    setForbiddenHandler(handleUnauthorized)
    return () => {
      setForbiddenHandler(null)
    }
  }, [handleUnauthorized])

  const resolveDashboardHref = useCallback(async (): Promise<
    '/install' | '/sign-in' | '/welcome' | `/${string}/servers`
  > => {
    if (needsInstall) {
      return '/install'
    }
    if (!session) {
      return '/sign-in'
    }

    try {
      const { organizations } = await queryClient.fetchQuery({
        queryKey: queryKeys.auth.organizations,
        queryFn: fetchOrganizations,
      })
      const preferred = resolvePreferredOrganizationId(organizations)
      if (preferred) {
        setActiveOrganizationId(preferred)
        return `/${preferred}/servers` as `/${string}/servers`
      }
    } catch {
      // Fall back to welcome when org discovery fails.
    }

    return '/welcome'
  }, [needsInstall, queryClient, session])

  const signIn = useCallback(
    async (email: string, password: string) => {
      return await signInMutation.mutateAsync({ email, password })
    },
    [signInMutation],
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      await signUpMutation.mutateAsync({ email, password })
    },
    [signUpMutation],
  )

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync()
  }, [signOutMutation])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      needsInstall,
      isSignupEnabled,
      controlPlaneRuntime,
      isLoading,
      bootstrapError,
      signIn,
      signUp,
      signOut,
      clearSession,
      refreshSession,
      refreshInstallStatus,
      handleUnauthorized,
      resolveDashboardHref,
    }),
    [
      session,
      needsInstall,
      isSignupEnabled,
      controlPlaneRuntime,
      isLoading,
      bootstrapError,
      signIn,
      signUp,
      signOut,
      clearSession,
      refreshSession,
      refreshInstallStatus,
      handleUnauthorized,
      resolveDashboardHref,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export {
  dashboardHref,
  hasUserSession,
  isAdminSession,
  isSuperadminSession,
} from '@/lib/auth-session'
