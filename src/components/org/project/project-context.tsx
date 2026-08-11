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
import { usePathname, useRouter, type Href } from 'expo-router'
import { useEnvironments } from '@/lib/queries/environments'
import { useProject } from '@/lib/queries/projects'
import { useWorkspaces } from '@/lib/queries/workspaces'
import {
  type EnvironmentRecord,
  type ProjectRecord,
  type WorkspaceKind,
  type WorkspaceRecord,
} from '@/lib/instance-api'
import { ComposeDraftProvider } from '@/components/org/project/compose-draft-context'
import {
  parseProjectEnvironmentId,
  projectEnvironmentHref,
  projectNeedsSetup,
  projectOverviewHref,
  resolveBaseComposeSelected,
  resolveEnvironmentScopeActive,
  resolveSelectedEnvironmentId,
} from '@/lib/project-navigation'
import { queryKeys, useCan } from '@/lib/query-client'
import {
  isTurbopanelProject,
  systemComponentKey,
} from '@/lib/system-inventory'

type ProjectContextValue = {
  orgId: string
  projectId: string
  project: ProjectRecord | null
  environments: EnvironmentRecord[]
  workspaces: WorkspaceRecord[]
  /** Owning workspace kind when known. */
  workspaceKind: WorkspaceKind | null
  /**
   * True once the owning workspace row is known, or workspaces finished loading
   * without a match. Until then, treat the project as read-only.
   */
  isWorkspaceKindResolved: boolean
  isSystemProject: boolean
  /**
   * True only when the owning workspace kind is definitively `user`.
   * Suppresses mutation chrome while kind is unresolved or `system`.
   */
  projectAllowsMutations: boolean
  systemComponent: string | null
  selectedEnvironmentId: string | null
  selectedEnvironment: EnvironmentRecord | null
  /**
   * Environment id from `/environments/:id`, or null on Overview Base and
   * retired Networking / Storage paths. Unlike {@link selectedEnvironmentId},
   * this is never a sticky remembered id under Project scope.
   */
  pathEnvironmentId: string | null
  /**
   * True on Overview Base (`/overview`). False when the path is
   * `/environments/:id` or Networking / Storage (env chip not Project).
   */
  baseSelected: boolean
  /**
   * True when environment scope is active (`/environments/:id`) or was when
   * navigating to a retired Networking / Storage path. False on Project
   * overview and on cold loads of retired routes — never inferred solely from
   * the first-environment fallback on {@link selectedEnvironmentId}.
   */
  environmentScopeActive: boolean
  loading: boolean
  error: string | null
  canOwn: boolean
  canManage: boolean
  needsSetup: boolean
  setSelectedEnvironmentId: (id: string | null) => void
  selectBaseCompose: () => void
  invalidateProject: () => Promise<void>
  invalidateEnvironments: () => Promise<void>
  setError: (error: string | null) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({
  orgId,
  projectId,
  children,
}: Readonly<{
  orgId: string
  projectId: string
  children: ReactNode
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const baseSelected = resolveBaseComposeSelected(pathname, projectId)
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')

  const projectQuery = useProject(orgId, projectId)
  const environmentsQuery = useEnvironments(orgId, projectId)
  const workspacesQuery = useWorkspaces(orgId)

  const project = projectQuery.data?.project ?? null
  const environments = environmentsQuery.data?.environments ?? []
  const workspaces = workspacesQuery.data?.workspaces ?? []

  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null)
  const [environmentScopeActive, setEnvironmentScopeActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading =
    projectQuery.isLoading ||
    environmentsQuery.isLoading ||
    workspacesQuery.isLoading

  const queryError = useMemo(() => {
    const err =
      projectQuery.error ?? environmentsQuery.error ?? workspacesQuery.error
    if (!err) return null
    return err instanceof Error ? err.message : 'Failed to load project'
  }, [projectQuery.error, environmentsQuery.error, workspacesQuery.error])

  useEffect(() => {
    setError(queryError)
  }, [queryError])

  const invalidateProject = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.detail(projectId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).workspaces.list,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.list(projectId),
      }),
    ])
  }, [queryClient, orgId, projectId])

  const invalidateEnvironments = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).environments.list(projectId),
    })
  }, [queryClient, orgId, projectId])

  useEffect(() => {
    // Path `/environments/:id` wins; on Overview Base / Networking / Storage
    // keep a concrete id without flipping the Base highlight.
    setSelectedEnvironmentId((previous) =>
      resolveSelectedEnvironmentId(
        baseSelected ? previous : pathEnvironmentId ?? previous,
        environments,
      ),
    )
  }, [environments, pathEnvironmentId, baseSelected])

  useEffect(() => {
    setEnvironmentScopeActive((previous) =>
      resolveEnvironmentScopeActive(
        baseSelected,
        pathEnvironmentId,
        previous,
      ),
    )
  }, [baseSelected, pathEnvironmentId])

  const setSelectedEnvironmentIdWithRoute = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedEnvironmentId(null)
        return
      }
      setSelectedEnvironmentId(id)
      // Overview Base and `/environments/:id` keep selection in the path.
      // Managed Data / Backups (and compose Networking / Storage when using
      // the shell selector) only update local state — compose env chips navigate
      // via `projectEnvironmentHref` directly in ProjectSectionTabs.
      if (baseSelected || pathEnvironmentId != null) {
        router.push(projectEnvironmentHref(orgId, projectId, id) as Href)
      }
    },
    [router, orgId, projectId, baseSelected, pathEnvironmentId],
  )

  const selectBaseCompose = useCallback(() => {
    router.push(projectOverviewHref(orgId, projectId) as Href)
  }, [router, orgId, projectId])

  const selectedEnvironment =
    environments.find((env) => env.id === selectedEnvironmentId) ?? null

  const needsSetup = project ? projectNeedsSetup(project) : false

  const owningWorkspace = useMemo(() => {
    if (!project) return null
    return workspaces.find((entry) => entry.id === project.workspaceId) ?? null
  }, [project, workspaces])

  const workspaceKind = owningWorkspace?.kind ?? null
  const isWorkspaceKindResolved =
    project == null ||
    owningWorkspace != null ||
    (workspacesQuery.isFetched && !workspacesQuery.isLoading)
  const projectIsSystem = project
    ? isTurbopanelProject(project, workspaceKind ?? workspaces)
    : false
  const projectAllowsMutations =
    isWorkspaceKindResolved && workspaceKind === 'user'
  const systemComponent = project ? systemComponentKey(project) : null

  const value = useMemo<ProjectContextValue>(
    () => ({
      orgId,
      projectId,
      project,
      environments,
      workspaces,
      workspaceKind,
      isWorkspaceKindResolved,
      isSystemProject: projectIsSystem,
      projectAllowsMutations,
      systemComponent,
      selectedEnvironmentId,
      selectedEnvironment,
      pathEnvironmentId,
      baseSelected,
      environmentScopeActive,
      loading,
      error,
      canOwn,
      canManage,
      needsSetup,
      setSelectedEnvironmentId: setSelectedEnvironmentIdWithRoute,
      selectBaseCompose,
      invalidateProject,
      invalidateEnvironments,
      setError,
    }),
    [
      orgId,
      projectId,
      project,
      environments,
      workspaces,
      workspaceKind,
      isWorkspaceKindResolved,
      projectIsSystem,
      projectAllowsMutations,
      systemComponent,
      selectedEnvironmentId,
      selectedEnvironment,
      pathEnvironmentId,
      baseSelected,
      environmentScopeActive,
      loading,
      error,
      canOwn,
      canManage,
      needsSetup,
      setSelectedEnvironmentIdWithRoute,
      selectBaseCompose,
      invalidateProject,
      invalidateEnvironments,
    ],
  )

  return (
    <ProjectContext.Provider value={value}>
      <ComposeDraftProvider>{children}</ComposeDraftProvider>
    </ProjectContext.Provider>
  )
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new TypeError('useProjectContext must be used within ProjectProvider')
  }
  return ctx
}
