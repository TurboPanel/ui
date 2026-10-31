import { useRouter, type Href } from 'expo-router'
import { useMemo } from 'react'
import { Platform, Pressable, Text, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { ProjectTile, type TileLayout } from '@/components/org/project-tile'
import { ProjectsViewToggle } from '@/components/org/projects-view-toggle'
import { ProjectsWelcomeCard } from '@/components/org/projects-welcome-card'
import { useNow } from '@/components/org/project/use-now'
import { WorkspaceSwitcher } from '@/components/org/workspace-switcher'
import { LoadingState } from '@/components/ui'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { TextLink } from '@/components/ui/text-link'
import { ActionButton } from '@/components/ui/v4/action-button'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { Notice } from '@/components/ui/v4/notice'
import { PageTitle } from '@/components/ui/v4/page-title'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type {
  ContainerRecord,
  EnvironmentRecord,
  ManagedListRecord,
  ProjectRecord,
} from '@/lib/instance-api'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  environmentPageTabHref,
  isManagedProject,
  projectEnvironmentHref,
  projectHref,
} from '@/lib/project-navigation'
import { managedSettingsHref, orgAreaHref } from '@/lib/org-navigation'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useCan } from '@/lib/query-client'
import { useProjects, useWorkspaces } from '@/lib/queries'
import { useContainers } from '@/lib/queries/containers'
import { useLatestDeployments } from '@/lib/queries/environment-cards'
import { useEnvironments } from '@/lib/queries/environments'
import { useOrganizationManaged } from '@/lib/queries/managed'
import { useRepositories } from '@/lib/queries/releases'
import { useOrgServers } from '@/lib/queries/servers'
import { setProjectsView, useProjectsView, type ProjectsView } from '@/lib/projects-view'
import { resolveRecentProjects, useRecentProjectIds } from '@/lib/recent-projects'
import { repositoryLabel } from '@/lib/repository-label'
import { isTurbopanelProject, isTurbopanelWorkspace } from '@/lib/system-inventory'
import { userErrorMessage } from '@/lib/user-error'
import { webPointer } from '@/lib/theme'
import {
  deploysInProgress,
  emptyTypeMessage,
  filterProjectsByType,
  homeProject,
  IN_PROGRESS_LIMIT,
  type InProgressRow,
  parseProjectTypeFilter,
  type ProjectFacts,
  type ProjectTypeFilter,
  projectTypeCounts,
  projectTypeOptions,
  summaryLine,
  wantsConfigView,
  type HomeProject,
} from '@/lib/v4/projects-home'
import {
  ALL_WORKSPACES_SCOPE,
  newProjectHrefForScope,
  projectsListHref,
  withQueryParam,
  workspaceName,
} from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const TILE_MIN_WIDTH = 250
const PHONE_MAX_WIDTH = 767
const CLOCK_MS = 30_000

const styles = themedStyles((p) => ({
  root: { width: '100%', gap: 24 },
  section: { gap: 12 },
  recent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  chipText: { ...typeStyle('bodyMedium', 'subhead'), color: p.text },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  typeFilter: { flexGrow: 1 },
  typeOwnRow: { flexBasis: '100%' },
  filter: { flexShrink: 1 },
  filterGrow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    ...(Platform.OS === 'web'
      ? ({
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_WIDTH}px, 1fr))`,
        } as unknown as ViewStyle)
      : null),
  },
  gridCell: { flexGrow: 1, flexBasis: TILE_MIN_WIDTH, minWidth: 0 },
  listBox: {
    borderWidth: 1,
    borderColor: p.sep,
    borderRadius: 12,
    backgroundColor: p.surface,
    overflow: 'hidden',
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    height: 34,
    backgroundColor: p.surface2,
    borderBottomWidth: 1,
    borderBottomColor: p.sep,
  },
  listHeadName: { flex: 1, paddingLeft: 44 },
  listHeadEnvs: { flexBasis: 420, flexGrow: 0, flexShrink: 0, marginRight: 13 },
  listHeadText: {
    ...typeStyle('bodySemibold', 'caption'),
    color: p.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
}))

function queryErrorMessage(projectsError: unknown, workspacesError: unknown): string | null {
  if (projectsError instanceof Error) return userErrorMessage(projectsError, '')
  if (workspacesError instanceof Error) return userErrorMessage(workspacesError, '')
  return null
}

/** A Compose project with exactly one environment opens that environment; any other opens the project. */
function recentHref(
  orgId: string,
  project: HomeProject,
  environments: readonly EnvironmentRecord[]
): string {
  const own = environments.filter((env) => env.projectId === project.id)
  const only = own.length === 1 ? own[0] : undefined
  return only && project.kind === 'compose'
    ? projectEnvironmentHref(orgId, project.id, only.id)
    : projectHref(orgId, project.id)
}

function RecentProjects({
  orgId,
  projects,
  environments,
}: Readonly<{
  orgId: string
  projects: readonly HomeProject[]
  environments: readonly EnvironmentRecord[]
}>) {
  const s = styles(usePalette())
  const router = useRouter()
  const recentIds = useRecentProjectIds(orgId)
  const recent = resolveRecentProjects(recentIds, projects)
  if (recent.length === 0) return null
  return (
    <View style={s.recent}>
      <SectionHeading title="Recent Projects" />
      <View accessibilityRole="summary" accessibilityLabel="Recent Projects" style={s.chips}>
        {recent.map((project) => {
          const href = recentHref(orgId, project, environments)
          return (
            <Pressable
              key={project.id}
              accessibilityRole="link"
              accessibilityLabel={`${project.name}`}
              onPress={() => router.push(href as Href)}
              style={[s.chip, webPointer]}
            >
              <StatusChip status={project.status} size="dot" />
              <Text style={s.chipText}>{project.name}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Projects in scope (platform infrastructure hidden under all workspaces) and the workspaces to name them. */
function useScopedProjects(orgId: string, scopeId: string, showWorkspaceLabels: boolean) {
  const workspaceScope = useOptionalWorkspaceScope()
  const scopedWorkspaceId = scopeId === ALL_WORKSPACES_SCOPE ? undefined : scopeId
  const projectsQuery = useProjects(orgId, scopedWorkspaceId)
  const workspacesQuery = useWorkspaces(orgId, { enabled: showWorkspaceLabels })
  const scopeWorkspaces = workspaceScope?.workspaces
  const allWorkspaces = useMemo(
    () =>
      scopeWorkspaces && scopeWorkspaces.length > 0
        ? scopeWorkspaces
        : (workspacesQuery.data?.workspaces ?? []),
    [scopeWorkspaces, workspacesQuery.data?.workspaces]
  )
  const rawProjects = orEmptyArray(projectsQuery.data?.projects)
  const projects = useMemo(
    // All-workspaces scope hides platform infrastructure projects.
    () =>
      scopeId === ALL_WORKSPACES_SCOPE
        ? rawProjects.filter((project) => !isTurbopanelProject(project, allWorkspaces))
        : rawProjects,
    [rawProjects, scopeId, allWorkspaces]
  )
  return { projectsQuery, workspacesQuery, allWorkspaces, projects }
}

function groupByEnvironment(
  containers: readonly ContainerRecord[]
): Record<string, ContainerRecord[]> {
  const map: Record<string, ContainerRecord[]> = {}
  for (const row of containers) {
    const bucket = map[row.environmentId] ?? []
    bucket.push(row)
    map[row.environmentId] = bucket
  }
  return map
}

function groupByProject(rows: readonly ManagedListRecord[]): Map<string, ManagedListRecord[]> {
  const map = new Map<string, ManagedListRecord[]>()
  for (const row of rows) map.set(row.projectId, [...(map.get(row.projectId) ?? []), row])
  return map
}

/**
 * What the repository and managed lists say about each project, for its second
 * line. Each list is read only when a project needs it; the managed list is
 * manager-only, so others see the engine from the project's catalog code.
 */
function useProjectFacts(orgId: string, projects: readonly ProjectRecord[]) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const repositoriesEnabled = projects.some((project) => project.repositoryId)
  const managedEnabled = canManage && projects.some((project) => isManagedProject(project))
  const repositoriesQuery = useRepositories(orgId, { enabled: repositoriesEnabled })
  const managedQuery = useOrganizationManaged(orgId, { enabled: managedEnabled })
  const repositories = repositoriesQuery.data?.repositories
  const managed = managedQuery.data?.managed
  const factsOf = useMemo(() => {
    const labels = new Map(orEmptyArray(repositories).map((row) => [row.id, repositoryLabel(row)]))
    const rowsByProject = groupByProject(orEmptyArray(managed))
    return (project: ProjectRecord): ProjectFacts => ({
      repositoryLabel: project.repositoryId ? (labels.get(project.repositoryId) ?? null) : null,
      managedRows: rowsByProject.get(project.id),
    })
  }, [repositories, managed])
  const refetch = () =>
    Promise.all([
      ...(repositoriesEnabled ? [repositoriesQuery.refetch()] : []),
      ...(managedEnabled ? [managedQuery.refetch()] : []),
    ])
  return { factsOf, refetch }
}

/** Environments, containers and deploy state for the projects, folded into home cards. */
function useHomeCards(
  orgId: string,
  projects: ReturnType<typeof useScopedProjects>['projects'],
  now: number
) {
  const environmentsQuery = useEnvironments(orgId, undefined, { enabled: projects.length > 0 })
  const containersQuery = useContainers(orgId, undefined, { enabled: projects.length > 0 })
  const environments = useMemo(() => {
    const ids = new Set(projects.map((project) => project.id))
    return orEmptyArray(environmentsQuery.data?.environments).filter((env) =>
      ids.has(env.projectId)
    )
  }, [projects, environmentsQuery.data?.environments])
  // Only Compose projects have their newest deploy read per environment: a
  // platform project has one environment per server, so reading each would
  // scale with the fleet.
  const composeEnvironmentIds = useMemo(() => {
    const compose = new Set(projects.filter(wantsConfigView).map((project) => project.id))
    return environments.filter((env) => compose.has(env.projectId)).map((env) => env.id)
  }, [projects, environments])
  const { latest } = useLatestDeployments(orgId, composeEnvironmentIds)
  const facts = useProjectFacts(orgId, projects)
  const { factsOf } = facts
  const containersByEnvironment = useMemo(
    () => (containersQuery.data ? groupByEnvironment(containersQuery.data.containers) : undefined),
    [containersQuery.data]
  )
  const cards = useMemo(
    () =>
      projects.map((project) =>
        homeProject({
          project,
          environments: environments.filter((env) => env.projectId === project.id),
          containersByEnvironment,
          latest,
          facts: factsOf(project),
        })
      ),
    [projects, environments, containersByEnvironment, latest, factsOf]
  )
  const inProgress = useMemo(
    () => deploysInProgress({ projects, environments, latest, now }),
    [projects, environments, latest, now]
  )
  // Until environments and containers have both loaded the counts are
  // unknown, not 0.
  const environmentCount = environmentsQuery.data ? environments.length : null
  const runningCount =
    containersByEnvironment && environmentsQuery.data
      ? cards.reduce(
          (sum, card) => sum + card.environments.filter((env) => env.status === 'running').length,
          0
        )
      : null
  return {
    environmentsQuery,
    containersQuery,
    refetchFacts: facts.refetch,
    environments,
    environmentCount,
    cards,
    inProgress,
    runningCount,
  }
}

function listLayout(phone: boolean): TileLayout {
  return phone ? 'listStacked' : 'list'
}

function ListHead() {
  const s = styles(usePalette())
  return (
    <View accessibilityElementsHidden style={s.listHead}>
      <View style={s.listHeadName}>
        <Text style={s.listHeadText}>Name</Text>
      </View>
      <View style={s.listHeadEnvs}>
        <Text style={s.listHeadText}>Status</Text>
      </View>
    </View>
  )
}

function ProjectGrid({
  orgId,
  cards,
  workspaces,
  showWorkspaceLabels,
  view,
}: Readonly<{
  orgId: string
  cards: readonly HomeProject[]
  workspaces: ReturnType<typeof useScopedProjects>['allWorkspaces']
  showWorkspaceLabels: boolean
  view: ProjectsView
}>) {
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspaceName(workspace)])),
    [workspaces]
  )
  const s = styles(usePalette())
  const router = useRouter()
  const phone = useWindowDimensions().width <= PHONE_MAX_WIDTH
  const grid = view === 'grid'
  const tiles = cards.map((card, index) => (
    <View key={card.id} style={grid ? s.gridCell : undefined}>
      <ProjectTile
        project={card}
        workspace={showWorkspaceLabels ? workspaceNameById.get(card.workspaceId ?? '') : undefined}
        layout={grid ? 'grid' : listLayout(phone)}
        first={index === 0}
        onOpen={() => router.push(projectHref(orgId, card.id) as Href)}
      />
    </View>
  ))
  if (grid) return <View style={s.grid}>{tiles}</View>
  return (
    <View style={s.listBox}>
      {phone ? null : <ListHead />}
      {tiles}
    </View>
  )
}

function DeploysInProgress({
  orgId,
  rows,
}: Readonly<{ orgId: string; rows: readonly InProgressRow[] }>) {
  const s = styles(usePalette())
  const router = useRouter()
  if (rows.length === 0) return null
  return (
    <View style={s.section}>
      <SectionHeading title="Deploys in Progress" />
      <ListGroup>
        {rows.slice(0, IN_PROGRESS_LIMIT).map((row) => (
          <ListRow
            key={row.environmentId}
            title={row.title}
            sub={row.sub}
            chips={<StatusChip status={row.status} size="sm" />}
            onPress={() =>
              router.push(
                environmentPageTabHref(
                  orgId,
                  row.projectId,
                  row.environmentId,
                  'deployments'
                ) as Href
              )
            }
          />
        ))}
        {rows.length > IN_PROGRESS_LIMIT ? (
          <ListRow
            title={`View ${rows.length - IN_PROGRESS_LIMIT} more in Activity`}
            onPress={() => router.push(orgAreaHref(orgId, 'activity') as Href)}
          />
        ) : null}
      </ListGroup>
    </View>
  )
}

type HomeData = ReturnType<typeof useScopedProjects> & ReturnType<typeof useHomeCards>

/** Pull to refresh re-reads everything the page shows. */
function useRefreshHome(data: HomeData, showWorkspaceLabels: boolean) {
  const workspaceScope = useOptionalWorkspaceScope()
  usePullToRefresh(async () => {
    await Promise.all([
      data.projectsQuery.refetch(),
      data.environmentsQuery.refetch(),
      data.containersQuery.refetch(),
      data.refetchFacts(),
      ...(showWorkspaceLabels ? [data.workspacesQuery.refetch()] : []),
    ])
    await workspaceScope?.refreshWorkspaces()
  })
}

/**
 * The project list body: loading, the first-run welcome, a line when the type
 * filter leaves nothing, or the project grid.
 */
function ProjectsList({
  orgId,
  scopeId,
  data,
  filter,
  loading,
  canCreate,
  view,
}: Readonly<{
  orgId: string
  scopeId: string
  data: HomeData
  filter: ProjectTypeFilter
  loading: boolean
  canCreate: boolean
  view: ProjectsView
}>) {
  const router = useRouter()
  const showWelcome = !loading && data.cards.length === 0
  const serversQuery = useOrgServers(orgId, { enabled: showWelcome && canCreate })
  const cards = useMemo(() => filterProjectsByType(data.cards, filter), [data.cards, filter])
  if (loading) return <LoadingState />
  if (showWelcome) {
    const newProjectHref = newProjectHrefForScope(orgId, scopeId) as Href
    const serverCount = serversQuery.data ? serversQuery.data.servers.length : null
    return (
      <ProjectsWelcomeCard
        serverCount={serverCount}
        onAddServer={
          canCreate ? () => router.push(orgAreaHref(orgId, 'servers') as Href) : undefined
        }
        onNewProject={canCreate ? () => router.push(newProjectHref) : undefined}
      />
    )
  }
  if (filter !== 'all' && cards.length === 0) {
    return <EmptyPanel inline title={emptyTypeMessage(filter)} />
  }
  return (
    <ProjectGrid
      orgId={orgId}
      cards={cards}
      workspaces={data.allWorkspaces}
      showWorkspaceLabels={scopeId === ALL_WORKSPACES_SCOPE}
      view={view}
    />
  )
}

/**
 * The type filter (All, Apps, Managed Databases, each with its count), the
 * workspace filter and the grid or list switch. The type rides in `?type=` so
 * the view is linkable and keeps the workspace. On a phone the type filter
 * takes its own row.
 */
function AllProjectsTools({
  orgId,
  scopeId,
  cards,
  filter,
  view,
  loading,
}: Readonly<{
  orgId: string
  scopeId: string
  cards: readonly HomeProject[]
  filter: ProjectTypeFilter
  view: ProjectsView
  /** The list has not arrived yet: no counts, never a row of zeros. */
  loading: boolean
}>) {
  const s = styles(usePalette())
  const router = useRouter()
  const phone = useWindowDimensions().width <= PHONE_MAX_WIDTH
  const options = useMemo(
    () => projectTypeOptions(loading ? null : projectTypeCounts(cards)),
    [cards, loading]
  )
  return (
    <View style={s.tools}>
      <View style={phone ? s.typeOwnRow : s.typeFilter}>
        <SegmentedControl
          accessibilityLabel="Project type"
          options={options}
          value={filter}
          onChange={(next) => router.replace(projectsListHref(orgId, scopeId, next) as Href)}
        />
      </View>
      <View style={phone ? s.filterGrow : s.filter}>
        <WorkspaceSwitcher orgId={orgId} />
      </View>
      <ProjectsViewToggle value={view} onChange={setProjectsView} />
    </View>
  )
}

/** With the Managed Databases filter on: the organization defaults those databases inherit. */
function ManagedSettingsLink({ orgId }: Readonly<{ orgId: string }>) {
  const s = styles(usePalette())
  const router = useRouter()
  return (
    <View style={s.links}>
      <TextLink
        label="Managed Database Settings"
        size="sm"
        onPress={() => router.push(managedSettingsHref(orgId) as Href)}
      />
    </View>
  )
}

/**
 * The Projects home: every project (managed databases included) as a compact
 * tile or row with what it is and the status of its primary and pinned
 * environments, filtered by type (`?type=apps|managed`) and workspace; the
 * projects you opened last, and the deploys running now. Only data the app has
 * read is shown.
 */
export function ProjectsHomeSection({
  orgId,
  workspaceId,
  type,
}: Readonly<{ orgId: string; workspaceId?: string; type?: string }>) {
  const s = styles(usePalette())
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const now = useNow(CLOCK_MS)
  const view = useProjectsView()
  const filter = parseProjectTypeFilter(type)

  const scopeId = workspaceId ?? workspaceScope?.scopeId ?? ALL_WORKSPACES_SCOPE
  const showWorkspaceLabels = scopeId === ALL_WORKSPACES_SCOPE
  const scopeWorkspace = workspaceScope?.scope.workspace
  const isSystemScope = scopeWorkspace != null && isTurbopanelWorkspace(scopeWorkspace)

  const scoped = useScopedProjects(orgId, scopeId, showWorkspaceLabels)
  const data = { ...scoped, ...useHomeCards(orgId, scoped.projects, now) }
  useRefreshHome(data, showWorkspaceLabels)

  const loading = data.projectsQuery.isLoading && data.projects.length === 0
  const error = queryErrorMessage(data.projectsQuery.error, data.workspacesQuery.error)
  const canCreate = canOwn && !isSystemScope
  // While the first-run welcome shows, it carries the New Project button.
  const welcomeShown = !loading && data.cards.length === 0 && !error
  // With the Managed Databases filter on, New Project opens on the managed type.
  const newProjectHref = withQueryParam(
    newProjectHrefForScope(orgId, scopeId),
    'type',
    filter === 'managed' ? 'managed' : null
  ) as Href

  return (
    <View style={s.root}>
      <PageTitle
        title="Projects"
        sub={
          data.cards.length > 0
            ? summaryLine(data.cards.length, data.environmentCount, data.runningCount)
            : undefined
        }
        actions={
          canCreate && !welcomeShown ? (
            <ActionButton
              label="New Project"
              variant="primary"
              onPress={() => router.push(newProjectHref)}
            />
          ) : null
        }
      />
      {error ? <Notice tone="bad" title="Could not load projects" body={error} /> : null}
      <RecentProjects orgId={orgId} projects={data.cards} environments={data.environments} />
      <DeploysInProgress orgId={orgId} rows={data.inProgress} />
      <View style={s.section}>
        <AllProjectsTools
          orgId={orgId}
          scopeId={scopeId}
          cards={data.cards}
          filter={filter}
          view={view}
          loading={loading}
        />
        {filter === 'managed' ? <ManagedSettingsLink orgId={orgId} /> : null}
        <ProjectsList
          orgId={orgId}
          scopeId={scopeId}
          data={data}
          filter={filter}
          loading={loading}
          canCreate={canCreate}
          view={view}
        />
      </View>
    </View>
  )
}
