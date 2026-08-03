import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useLocalSearchParams,
  usePathname,
  useRouter,
  type Href,
} from 'expo-router'
import { useWorkspaces } from '@/lib/queries/workspaces'
import { type WorkspaceRecord } from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-client'
import {
  ALL_WORKSPACES_SCOPE,
  getStoredWorkspaceScopeId,
  parseWorkspaceIdParam,
  projectsHrefForScope,
  resolveWorkspaceScope,
  setStoredWorkspaceScopeId,
  type WorkspaceScope,
} from '@/lib/workspace-scope'

type WorkspaceScopeContextValue = Readonly<{
  orgId: string
  workspaces: WorkspaceRecord[]
  scope: WorkspaceScope
  scopeId: string
  isLoading: boolean
  error: string | null
  setScopeId: (scopeId: string) => void
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
): string {
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
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ workspaceId?: string | string[] }>()
  const urlWorkspaceId = parseWorkspaceIdParam(params.workspaceId)

  const [scopeId, setScopeId] = useState(initialScopeId(orgId, urlWorkspaceId))
  const [urlSyncKey, setUrlSyncKey] = useState(
    `${pathname}|${urlWorkspaceId ?? ''}`,
  )

  const workspacesQuery = useWorkspaces(orgId)

  const workspaces = useMemo(
    () => workspacesQuery.data?.workspaces ?? [],
    [workspacesQuery.data?.workspaces],
  )

  // Sync from the projects URL while rendering (React “adjust state” pattern).
  const nextUrlSyncKey = `${pathname}|${urlWorkspaceId ?? ''}`
  if (nextUrlSyncKey !== urlSyncKey) {
    setUrlSyncKey(nextUrlSyncKey)
    if (isProjectsIndexPath(pathname, orgId)) {
      const fromUrl = urlWorkspaceId ?? ALL_WORKSPACES_SCOPE
      if (fromUrl !== scopeId) {
        setScopeId(fromUrl)
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
    setScopeId(resolvedFromList.id)
    setStoredWorkspaceScopeId(orgId, resolvedFromList.id)
  }

  const scope = useMemo(
    () => resolveWorkspaceScope(workspaces, scopeId),
    [workspaces, scopeId],
  )

  const selectScopeId = useCallback(
    (next: string) => {
      const resolved = resolveWorkspaceScope(workspaces, next)
      setScopeId(resolved.id)
      setStoredWorkspaceScopeId(orgId, resolved.id)
      router.push(projectsHrefForScope(orgId, resolved.id) as Href)
    },
    [orgId, router, workspaces],
  )

  const refreshWorkspaces = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).workspaces.list,
    })
  }, [queryClient, orgId])

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
      setScopeId: selectScopeId,
      refreshWorkspaces,
    }),
    [
      orgId,
      workspaces,
      scope,
      workspacesQuery.isLoading,
      error,
      selectScopeId,
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
