import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useLocalSearchParams,
  usePathname,
  useRouter,
  type Href,
} from 'expo-router'
import {
  fetchVisibleWorkspaces,
  isForbiddenError,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import { visibilityQueryKeys } from '@/lib/visibility-queries'
import {
  ALL_WORKSPACES_SCOPE,
  getStoredWorkspaceScopeId,
  parseWorkspaceIdParam,
  projectsHrefForScope,
  resolveWorkspaceScope,
  setStoredWorkspaceScopeId,
  type WorkspaceScope,
  type WorkspaceScopeId,
} from '@/lib/workspace-scope'

type WorkspaceScopeContextValue = Readonly<{
  orgId: string
  workspaces: WorkspaceRecord[]
  scope: WorkspaceScope
  scopeId: WorkspaceScopeId
  isLoading: boolean
  error: string | null
  setScopeId: (scopeId: WorkspaceScopeId) => void
  refreshWorkspaces: () => Promise<void>
}>

const WorkspaceScopeContext = createContext<WorkspaceScopeContextValue | null>(
  null,
)

function isProjectsIndexPath(pathname: string, orgId: string): boolean {
  return pathname === `/${orgId}/projects`
}

function initialScopeId(
  orgId: string,
  urlWorkspaceId: string | undefined,
): WorkspaceScopeId {
  if (urlWorkspaceId) {
    return urlWorkspaceId
  }
  return getStoredWorkspaceScopeId(orgId) ?? ALL_WORKSPACES_SCOPE
}

export function WorkspaceScopeProvider({
  orgId,
  children,
}: Readonly<{
  orgId: string
  children: ReactNode
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ workspaceId?: string | string[] }>()
  const urlWorkspaceId = parseWorkspaceIdParam(params.workspaceId)

  const [scopeId, setScopeIdState] = useState<WorkspaceScopeId>(
    initialScopeId(orgId, urlWorkspaceId),
  )
  const [urlSyncKey, setUrlSyncKey] = useState(
    `${pathname}|${urlWorkspaceId ?? ''}`,
  )

  const workspacesQuery = useQuery({
    queryKey: visibilityQueryKeys.workspaces,
    queryFn: async () => {
      const result = await fetchVisibleWorkspaces()
      return result.workspaces
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (workspacesQuery.error && isForbiddenError(workspacesQuery.error)) {
      handleUnauthorized().catch(() => {
        // Recovery is best-effort; the switcher already observed the 403.
      })
    }
  }, [workspacesQuery.error, handleUnauthorized])

  const workspaces = useMemo(
    () => workspacesQuery.data ?? [],
    [workspacesQuery.data],
  )

  // Sync from the projects URL while rendering (React “adjust state” pattern).
  const nextUrlSyncKey = `${pathname}|${urlWorkspaceId ?? ''}`
  if (nextUrlSyncKey !== urlSyncKey) {
    setUrlSyncKey(nextUrlSyncKey)
    if (isProjectsIndexPath(pathname, orgId)) {
      const fromUrl = urlWorkspaceId ?? ALL_WORKSPACES_SCOPE
      if (fromUrl !== scopeId) {
        setScopeIdState(fromUrl)
        setStoredWorkspaceScopeId(orgId, fromUrl)
      }
    }
  }

  // Drop stale workspace ids once the list is known.
  const resolvedFromList = resolveWorkspaceScope(workspaces, scopeId)
  if (
    !workspacesQuery.isLoading &&
    workspacesQuery.data !== undefined &&
    resolvedFromList.id !== scopeId
  ) {
    setScopeIdState(resolvedFromList.id)
    setStoredWorkspaceScopeId(orgId, resolvedFromList.id)
  }

  const scope = useMemo(
    () => resolveWorkspaceScope(workspaces, scopeId),
    [workspaces, scopeId],
  )

  const setScopeId = useCallback(
    (next: WorkspaceScopeId) => {
      const resolved = resolveWorkspaceScope(workspaces, next)
      setScopeIdState(resolved.id)
      setStoredWorkspaceScopeId(orgId, resolved.id)
      router.push(projectsHrefForScope(orgId, resolved.id) as Href)
    },
    [orgId, router, workspaces],
  )

  const refreshWorkspaces = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: visibilityQueryKeys.workspaces,
    })
  }, [queryClient])

  let error: string | null = null
  if (workspacesQuery.error instanceof Error) {
    error = workspacesQuery.error.message
  } else if (workspacesQuery.error) {
    error = 'Failed to load workspaces'
  }

  const value = useMemo<WorkspaceScopeContextValue>(
    () => ({
      orgId,
      workspaces,
      scope,
      scopeId: scope.id,
      isLoading: workspacesQuery.isLoading,
      error,
      setScopeId,
      refreshWorkspaces,
    }),
    [
      orgId,
      workspaces,
      scope,
      workspacesQuery.isLoading,
      error,
      setScopeId,
      refreshWorkspaces,
    ],
  )

  return (
    <WorkspaceScopeContext.Provider value={value}>
      {children}
    </WorkspaceScopeContext.Provider>
  )
}

export function useWorkspaceScope(): WorkspaceScopeContextValue {
  const value = useContext(WorkspaceScopeContext)
  if (!value) {
    throw new Error('useWorkspaceScope must be used within WorkspaceScopeProvider')
  }
  return value
}

/** Optional access when a component may render outside the org shell. */
export function useOptionalWorkspaceScope(): WorkspaceScopeContextValue | null {
  return useContext(WorkspaceScopeContext)
}
