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
  type WorkspaceRecord,
} from '@/lib/instance-api'
import {
  parseProjectEnvironmentId,
  projectEnvironmentHref,
  projectNeedsSetup,
  projectOverviewHref,
  resolveBaseComposeSelected,
  resolveSelectedEnvironmentId,
} from '@/lib/project-navigation'
import { queryKeys, useCan } from '@/lib/query-client'

type ProjectContextValue = {
  orgId: string
  projectId: string
  project: ProjectRecord | null
  environments: EnvironmentRecord[]
  workspaces: WorkspaceRecord[]
  selectedEnvironmentId: string | null
  selectedEnvironment: EnvironmentRecord | null
  /**
   * True on Overview Base (`/overview`). False when the path is
   * `/environments/:id` or Networking / Storage (env chip not Project).
   */
  baseSelected: boolean
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

  const value = useMemo<ProjectContextValue>(
    () => ({
      orgId,
      projectId,
      project,
      environments,
      workspaces,
      selectedEnvironmentId,
      selectedEnvironment,
      baseSelected,
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
      selectedEnvironmentId,
      selectedEnvironment,
      baseSelected,
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
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  )
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new TypeError('useProjectContext must be used within ProjectProvider')
  }
  return ctx
}
