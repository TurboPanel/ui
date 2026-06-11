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
import { authQueryKeys } from '@/lib/query-client'

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

  const refreshInstallStatus = useCallback(async () => {
    const status = await fetchInstallStatus()
    setNeedsInstall(status.needsInstall)
    setIsSignupEnabled(status.isSignupEnabled ?? false)
    syncAuthStatusCache(status)
    return status.needsInstall
  }, [syncAuthStatusCache])

  const refreshSession = useCallback(async () => {
    const data = await fetchSession()
    setSession(data)
    return data
  }, [])

  useEffect(() => {
    void Promise.all([fetchInstallStatus(), fetchSession()])
      .then(([installStatus, sessionData]) => {
        setNeedsInstall(installStatus.needsInstall)
        setIsSignupEnabled(installStatus.isSignupEnabled ?? false)
        syncAuthStatusCache(installStatus)
        setSession(sessionData)
        setBootstrapError(null)
      })
      .catch((err: unknown) => {
        setSession(null)
        setBootstrapError(
          err instanceof Error ? err.message : 'Failed to load session',
        )
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [syncAuthStatusCache])

  const signIn = useCallback(async (username: string, password: string) => {
    const loaded = await signInApi(username, password)
    setSession(loaded)
    setNeedsInstall(loaded.needsInstall)
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
  return session !== null &&
    (session.role === 'superadmin' || session.role === 'superuser')
}

export function hasUserSession(session: SessionInfo | null): boolean {
  return session !== null
}

export function dashboardHref(
  session: SessionInfo | null,
  needsInstall: boolean,
): '/install' | '/sign-in' | '/welcome' | `/${string}/servers/overview` | '/' {
  if (needsInstall) {
    return '/install'
  }
  if (session?.organizationId) {
    return `/${session.organizationId}/servers/overview`
  }
  if (hasUserSession(session)) {
    return '/welcome'
  }
  return '/sign-in'
}
