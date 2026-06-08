import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchSession,
  signIn as signInApi,
  signOut as signOutApi,
  type SessionInfo,
} from '@/lib/instance-api'

type AuthContextValue = {
  session: SessionInfo | null
  isLoading: boolean
  bootstrapError: string | null
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    void fetchSession()
      .then((data) => {
        setSession(data)
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
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    await signInApi(username, password)
    const loaded = await fetchSession()
    if (loaded === null) {
      setSession(null)
      throw new Error('Sign in succeeded but session could not be loaded')
    }
    setSession(loaded)
    setBootstrapError(null)
  }, [])

  const signOut = useCallback(async () => {
    await signOutApi()
    setSession(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      bootstrapError,
      signIn,
      signOut,
    }),
    [session, isLoading, bootstrapError, signIn, signOut],
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
