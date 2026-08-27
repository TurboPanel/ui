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
import { orEmptyArray } from '@/lib/or-empty-array'
import type { ComposeDocument } from '@/lib/compose'
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
  type ComposeProjectTabId,
} from '@/lib/project-navigation'
import { queryKeys, useCan } from '@/lib/query-client'
import {
  isTurbopanelProject,
  systemComponentKey,
} from '@/lib/system-inventory'

/**
 * An unsaved project the operator is still composing in the create wizard.
 * The whole project surface renders against this exactly as it does for a
 * saved project — same shell, same tabs, same editor — but section navigation
 * is local state instead of the URL, and there is no Save: the wizard's own
 * Create button commits the draft by creating the project.
 */
export type ProjectDraft = {
  /** Synthetic record standing in for the row that does not exist yet. */
  project: ProjectRecord
  section: ComposeProjectTabId
  setSection: (section: ComposeProjectTabId) => void
  /** Header title edits feed back into the wizard's name field. */
  onProjectNameChange: (name: string) => void
  /**
   * Debounced editor edits. `null` means the YAML is mid-edit and unparseable.
   * The wizard keeps the last good document so Back/forward does not lose the
   * file, and owns the Create button that commits it.
   */
  onDraftChange: (compose: ComposeDocument | null) => void
}

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
   * Environment id from `/environments/:id`, or null on Overview Base (including
   * `/hosting` and `/servers`). Unlike {@link selectedEnvironmentId},
   * this is never a sticky remembered id under Project scope.
   */
  pathEnvironmentId: string | null
  /**
   * True on Overview Base (`/overview`, `/compose`, `/services`, `/hosting`,
   * `/servers`). False when the path is `/environments/:id`.
   */
  baseSelected: boolean
  /**
   * True when environment scope is active (`/environments/:id`). False on
   * Project overview — never inferred solely from the first-environment
   * fallback on {@link selectedEnvironmentId}.
   */
  environmentScopeActive: boolean
  loading: boolean
  error: string | null
  canOwn: boolean
  canManage: boolean
  needsSetup: boolean
  /** Non-null only inside the create wizard's compose step. */
  draft: ProjectDraft | null
  setSelectedEnvironmentId: (id: string | null) => void
  selectBaseCompose: () => void
  invalidateProject: () => Promise<void>
  invalidateEnvironments: () => Promise<void>
  setError: (error: string | null) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

/** Stable identity so a draft never remounts consumers via a fresh array. */
const EMPTY_ENVIRONMENTS: EnvironmentRecord[] = []

function resolveNeedsSetup(
  isDraft: boolean,
  project: ProjectRecord | null,
): boolean {
  if (isDraft || project == null) {
    return false
  }
  return projectNeedsSetup(project)
}

export function ProjectProvider({
  orgId,
  projectId,
  draft = null,
  children,
}: Readonly<{
  orgId: string
  projectId: string
  /** Renders the surface for an unsaved wizard draft instead of a fetched project. */
  draft?: ProjectDraft | null
  children: ReactNode
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const baseSelected = resolveBaseComposeSelected(pathname, projectId)
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')

  const isDraft = draft != null
  // A draft has no row to fetch — every project-scoped query stays parked so
  // the synthetic id never reaches the API.
  const projectQuery = useProject(orgId, isDraft ? '' : projectId)
  const environmentsQuery = useEnvironments(orgId, projectId, {
    enabled: !isDraft,
  })
  const workspacesQuery = useWorkspaces(orgId)

  const project = draft?.project ?? projectQuery.data?.project ?? null
  const environments = isDraft
    ? EMPTY_ENVIRONMENTS
    : orEmptyArray(environmentsQuery.data?.environments)
  const workspaces = orEmptyArray(workspacesQuery.data?.workspaces)

  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null)
  const [environmentScopeActive, setEnvironmentScopeActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loading =
    !isDraft &&
    (projectQuery.isLoading ||
      environmentsQuery.isLoading ||
      workspacesQuery.isLoading)

  const queryError = useMemo(() => {
    if (isDraft) return null
    const err =
      projectQuery.error ?? environmentsQuery.error ?? workspacesQuery.error
    if (!err) return null
    return err instanceof Error ? err.message : 'Failed to load project'
  }, [
    isDraft,
    projectQuery.error,
    environmentsQuery.error,
    workspacesQuery.error,
  ])

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
    // Path `/environments/:id` wins; on Overview Base keep a concrete id
    // without flipping the Base highlight.
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
      // Managed Data / Backups only update local state — compose env chips
      // navigate via `projectComposeSectionHref` in ProjectSectionTabs.
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

  // A draft is always Project scope: it has no environments to select and its
  // section tabs are local state, so nothing may be inferred from the URL.
  const resolvedBaseSelected = isDraft || baseSelected
  const resolvedPathEnvironmentId = isDraft ? null : pathEnvironmentId
  const resolvedEnvironmentScopeActive = isDraft
    ? false
    : environmentScopeActive
  const resolvedSelectedEnvironmentId = isDraft ? null : selectedEnvironmentId
  const resolvedSelectedEnvironment = isDraft ? null : selectedEnvironment

  const needsSetup = resolveNeedsSetup(isDraft, project)

  const owningWorkspace = useMemo(() => {
    if (!project) return null
    return workspaces.find((entry) => entry.id === project.workspaceId) ?? null
  }, [project, workspaces])

  const workspaceKind = isDraft ? 'user' : owningWorkspace?.kind ?? null
  const isWorkspaceKindResolved =
    isDraft ||
    project == null ||
    owningWorkspace != null ||
    (workspacesQuery.isFetched && !workspacesQuery.isLoading)
  const projectIsSystem =
    !isDraft && project
      ? isTurbopanelProject(project, workspaceKind ?? workspaces)
      : false
  // A draft is authored by someone who already passed the org create gate.
  const projectAllowsMutations =
    isDraft || (isWorkspaceKindResolved && workspaceKind === 'user')
  const systemComponent = isDraft || !project ? null : systemComponentKey(project)

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
      selectedEnvironmentId: resolvedSelectedEnvironmentId,
      selectedEnvironment: resolvedSelectedEnvironment,
      pathEnvironmentId: resolvedPathEnvironmentId,
      baseSelected: resolvedBaseSelected,
      environmentScopeActive: resolvedEnvironmentScopeActive,
      loading,
      error,
      canOwn,
      canManage,
      needsSetup,
      draft,
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
      resolvedSelectedEnvironmentId,
      resolvedSelectedEnvironment,
      resolvedPathEnvironmentId,
      resolvedBaseSelected,
      resolvedEnvironmentScopeActive,
      loading,
      error,
      canOwn,
      canManage,
      needsSetup,
      draft,
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

/**
 * The project's repository, when this tree is inside a project at all.
 *
 * `undefined` means "no project context" — the compose editor is also rendered
 * by the create wizard against a draft, and by surfaces that are not a project.
 * `null` means the project exists and has no repository yet. The two are not
 * interchangeable: the first must not narrow anything, the second is what lets
 * an unbound project adopt the first repository someone picks.
 */
export function useProjectRepositoryId(): string | null | undefined {
  return useContext(ProjectContext)?.project?.repositoryId
}
