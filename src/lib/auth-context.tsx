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
  fetchInstallStatus,
  fetchSession,
  signIn as signInApi,
  signOut as signOutApi,
  signUp as signUpApi,
  type InstallStatus,
  type SessionInfo,
} from '@/lib/instance-api'
import { authQueryKeys, isVisibilityQuery } from '@/lib/visibility-queries'

type AuthContextValue = {
  session: SessionInfo | null
  needsInstall: boolean
  isSignupEnabled: boolean
  isLoading: boolean
  bootstrapError: string | null
  signIn: (username: string, password: string) => Promise<SessionInfo>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearSession: () => void
  refreshSession: () => Promise<SessionInfo | null>
  refreshInstallStatus: () => Promise<boolean>
  handleUnauthorized: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [needsInstall, setNeedsInstall] = useState(false)
  const [isSignupEnabled, setIsSignupEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  const syncAuthStatusCache = useCallback(
    (status: InstallStatus) => {
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
    setNeedsInstall(status.needsInstall ?? false)
    setIsSignupEnabled(status.isSignupEnabled ?? false)
    syncAuthStatusCache(status)
    return status.needsInstall ?? false
  }, [syncAuthStatusCache])

  const refreshSession = useCallback(async () => {
    const data = await fetchSession()
    setSession(data)
    return data
  }, [])

  useEffect(() => {
    let bootstrapErr: string | null = null

    void Promise.all([fetchInstallStatusCached(), fetchSession()])
      .then(([installStatus, sessionData]) => {
        setNeedsInstall(installStatus.needsInstall ?? false)
        setIsSignupEnabled(installStatus.isSignupEnabled ?? false)
        syncAuthStatusCache(installStatus)
        setSession(sessionData)
        setBootstrapError(null)
      })
      .catch((err: unknown) => {
        bootstrapErr =
          err instanceof Error ? err.message : 'Failed to load session'
        setSession(null)
        setBootstrapError(bootstrapErr)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [fetchInstallStatusCached, syncAuthStatusCache])

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
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    await signUpApi(email, password)
  }, [])

  const clearSession = useCallback(() => {
    setSession(null)
  }, [])

  const handleUnauthorized = useCallback(async () => {
    await queryClient.invalidateQueries({ predicate: isVisibilityQuery })
    const data = await refreshSession()
    if (!data) {
      setSession(null)
    }
  }, [queryClient, refreshSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      needsInstall,
      isSignupEnabled,
      isLoading,
      bootstrapError,
      signIn,
      signUp,
      signOut,
      clearSession,
      refreshSession,
      refreshInstallStatus,
      handleUnauthorized,
    }),
    [
      session,
      needsInstall,
      isSignupEnabled,
      isLoading,
      bootstrapError,
      signIn,
      signUp,
      signOut,
      clearSession,
      refreshSession,
      refreshInstallStatus,
      handleUnauthorized,
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
  if (session?.organizationId) {
    return `/${session.organizationId}/servers`
  }
  if (hasUserSession(session)) {
    return '/welcome'
  }
  return '/sign-in'
}
