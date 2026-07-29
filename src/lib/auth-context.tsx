import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
  fetchInstallStatus,
  fetchOrganizations,
  fetchSession,
  signIn as signInApi,
  signOut as signOutApi,
  signUp as signUpApi,
  type InstallStatus,
  type SessionInfo,
} from '@/lib/instance-api'
import {
  resolvePreferredOrganizationId,
  setActiveOrganizationId,
} from '@/lib/org-context'
import { authQueryKeys, isVisibilityQuery } from '@/lib/visibility-queries'

type AuthContextValue = {
  session: SessionInfo | null
  /** Deno self-hosted only — false on Workers (bootstrap via sign-up). */
  needsInstall: boolean
  isSignupEnabled: boolean
  /** From `GET /status` — set as soon as status returns during bootstrap. */
  controlPlaneRuntime: ControlPlaneRuntime | undefined
  isLoading: boolean
  bootstrapError: string | null
  signIn: (username: string, password: string) => Promise<SessionInfo>
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
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [isSignupEnabled, setIsSignupEnabled] = useState(false)
  const [controlPlaneRuntime, setControlPlaneRuntime] = useState<
    ControlPlaneRuntime | undefined
  >(() => readStoredControlPlaneRuntime())
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const applyInstallStatus = useCallback(
    (status: InstallStatus) => {
      const runtime = resolveControlPlaneRuntime(status)
      setNeedsInstall(status.needsInstall ?? false)
      setIsSignupEnabled(status.isSignupEnabled ?? false)
      if (runtime !== undefined) {
        setControlPlaneRuntime(runtime)
        applyConsoleChromeRuntime(runtime)
      }
      queryClient.setQueryData(authQueryKeys.authStatus, status)
    },
    [queryClient],
  )

  const fetchInstallStatusCached = useCallback(async () => {
    return await queryClient.fetchQuery({
      queryKey: authQueryKeys.authStatus,
      queryFn: fetchInstallStatus,
    })
  }, [queryClient])

  const refreshInstallStatus = useCallback(async () => {
    const status = await fetchInstallStatus()
    applyInstallStatus(status)
    return status.needsInstall ?? false
  }, [applyInstallStatus])

  const refreshSession = useCallback(async () => {
    const data = await fetchSession()
    setSession(data)
    return data
  }, [])

  const resolveDashboardHref = useCallback(async () => {
    if (needsInstall) {
      return '/install'
    }
    if (!session) {
      return '/sign-in'
    }

    try {
      const { organizations } = await fetchOrganizations()
      const preferred = resolvePreferredOrganizationId(organizations)
      if (preferred) {
        setActiveOrganizationId(preferred)
        return `/${preferred}/servers`
      }
    } catch {
      // Fall back to welcome when org discovery fails.
    }

    return '/welcome'
  }, [needsInstall, session])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        // Resolve runtime first so the bootstrap spinner can brand correctly
        // while the session request is still in flight.
        const installStatus = await fetchInstallStatusCached()
        if (cancelled) return
        applyInstallStatus(installStatus)

        const sessionData = await fetchSession()
        if (cancelled) return
        setSession(sessionData)
        setBootstrapError(null)
      } catch (err: unknown) {
        if (cancelled) return
        setSession(null)
        setBootstrapError(
          err instanceof Error ? err.message : 'Failed to load session',
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applyInstallStatus, fetchInstallStatusCached])

  const signIn = useCallback(async (username: string, password: string) => {
    const loaded = await signInApi(username, password)
    setSession(loaded)
    setNeedsInstall(loaded.needsInstall ?? false)
    setBootstrapError(null)
    return loaded
  }, [])

  const signOut = useCallback(async () => {
    await signOutApi()
    setSession(null)
    setActiveOrganizationId(null)
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    await signUpApi(email, password)
  }, [])

  const clearSession = useCallback(() => {
    setSession(null)
    setActiveOrganizationId(null)
  }, [])

  const handleUnauthorized = useCallback(async () => {
    await queryClient.invalidateQueries({ predicate: isVisibilityQuery })
    const data = await refreshSession()
    if (!data) {
      setSession(null)
      setActiveOrganizationId(null)
    }
  }, [queryClient, refreshSession])

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

export function isSuperadminSession(session: SessionInfo | null): boolean {
  return session !== null && session.role === 'superadmin'
}

export function isAdminSession(session: SessionInfo | null): boolean {
  return session !== null && (session.role === 'superadmin' || session.role === 'admin')
}

export function hasUserSession(session: SessionInfo | null): boolean {
  return session !== null
}

export function dashboardHref(
  session: SessionInfo | null,
  needsInstall: boolean,
): '/install' | '/sign-in' | '/welcome' | `/${string}/servers` | '/' {
  if (needsInstall) {
    return '/install'
  }
  if (hasUserSession(session)) {
    return '/welcome'
  }
  return '/sign-in'
}
