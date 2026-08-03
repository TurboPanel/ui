import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import {
  fetchProject,
  fetchVisibleEnvironments,
  fetchVisibleWorkspaces,
  isForbiddenError,
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
import { useCan } from '@/lib/query-client'

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
   * `/environments/:id` (that environment is selected and highlighted).
   */
  baseSelected: boolean
  loading: boolean
  error: string | null
  canOwn: boolean
  canManage: boolean
  needsSetup: boolean
  setSelectedEnvironmentId: (id: string | null) => void
  selectBaseCompose: () => void
  refreshProject: () => Promise<void>
  refreshEnvironments: () => Promise<EnvironmentRecord[]>
  setProject: (project: ProjectRecord | null) => void
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
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')

  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshEnvironments = useCallback(async () => {
    const result = await fetchVisibleEnvironments(projectId)
    setEnvironments(result.environments)
    return result.environments
  }, [projectId])

  const refreshProject = useCallback(async () => {
    const [projectResult, workspacesResult, envs] = await Promise.all([
      fetchProject(projectId),
      fetchVisibleWorkspaces(),
      fetchVisibleEnvironments(projectId),
    ])
    setProject(projectResult.project)
    setWorkspaces(workspacesResult.workspaces)
    setEnvironments(envs.environments)
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        await refreshProject()
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshProject, handleUnauthorized])

  useEffect(() => {
    // Path `/environments/:id` wins; on Overview Base keep a concrete id for
    // Networking / Storage / settings without flipping the Base highlight.
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
      // Other tabs (Networking / Storage / settings) only update local state.
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
      refreshProject,
      refreshEnvironments,
      setProject,
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
      refreshProject,
      refreshEnvironments,
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
