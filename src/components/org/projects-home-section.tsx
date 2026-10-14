import { useRouter, type Href } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ProjectHomeCard } from '@/components/org/project-home-card'
import { ProjectsWelcomeCard } from '@/components/org/projects-welcome-card'
import { useNow } from '@/components/org/project/use-now'
import { WorkspaceSwitcher } from '@/components/org/workspace-switcher'
import { LoadingState } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { Notice } from '@/components/ui/v4/notice'
import { PageTitle } from '@/components/ui/v4/page-title'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { ContainerRecord, EnvironmentRecord } from '@/lib/instance-api'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  environmentPageTabHref,
  projectBaseHref,
  projectEnvironmentHref,
  projectHref,
} from '@/lib/project-navigation'
import { orgAreaHref } from '@/lib/org-navigation'
import { usePullToRefresh } from '@/lib/pull-to-refresh'
import { useCan } from '@/lib/query-client'
import { useProjects, useWorkspaces } from '@/lib/queries'
import { useContainers } from '@/lib/queries/containers'
import {
  useEnvironmentConfigViews,
  useLatestDeployments,
} from '@/lib/queries/environment-cards'
import { useEnvironments } from '@/lib/queries/environments'
import { useOrgServers } from '@/lib/queries/servers'
import { resolveRecentProjects, useRecentProjectIds } from '@/lib/recent-projects'
import {
  isTurbopanelProject,
  isTurbopanelWorkspace,
} from '@/lib/system-inventory'
import { userErrorMessage } from '@/lib/user-error'
import { webPointer } from '@/lib/theme'
import {
  deploysInProgress,
  homeProject,
  type InProgressRow,
  summaryLine,
  wantsConfigView,
  type HomeProject,
} from '@/lib/v4/projects-home'
import {
  ALL_WORKSPACES_SCOPE,
  newProjectHrefForScope,
  workspaceName,
} from '@/lib/workspace-scope'
import { useOptionalWorkspaceScope } from '@/lib/workspace-scope-context'

const CARD_MIN_WIDTH = 340
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  cell: { flexGrow: 1, flexBasis: CARD_MIN_WIDTH, minWidth: 0 },
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
  environments: readonly EnvironmentRecord[],
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
      <SectionHeading title="Recent projects" />
      <View accessibilityRole="summary" accessibilityLabel="Recent projects" style={s.chips}>
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
    [scopeWorkspaces, workspacesQuery.data?.workspaces],
  )
  const rawProjects = orEmptyArray(projectsQuery.data?.projects)
  const projects = useMemo(
    // All-workspaces scope hides platform infrastructure projects.
    () =>
      scopeId === ALL_WORKSPACES_SCOPE
        ? rawProjects.filter((project) => !isTurbopanelProject(project, allWorkspaces))
        : rawProjects,
    [rawProjects, scopeId, allWorkspaces],
  )
  return { projectsQuery, workspacesQuery, allWorkspaces, projects }
}

function groupByEnvironment(containers: readonly ContainerRecord[]): Record<string, ContainerRecord[]> {
  const map: Record<string, ContainerRecord[]> = {}
  for (const row of containers) {
    const bucket = map[row.environmentId] ?? []
    bucket.push(row)
    map[row.environmentId] = bucket
  }
  return map
}

/** Environments, containers and deploy state for the projects, folded into home cards. */
function useHomeCards(
  orgId: string,
  projects: ReturnType<typeof useScopedProjects>['projects'],
  now: number,
) {
  const environmentsQuery = useEnvironments(orgId, undefined, { enabled: projects.length > 0 })
  const containersQuery = useContainers(orgId, undefined, { enabled: projects.length > 0 })
  const environments = useMemo(() => {
    const ids = new Set(projects.map((project) => project.id))
    return orEmptyArray(environmentsQuery.data?.environments).filter((env) => ids.has(env.projectId))
  }, [projects, environmentsQuery.data?.environments])
  // Only Compose projects are read per environment (config-view, newest deploy):
  // a platform project has one environment per server, so reading each would
  // scale with the fleet.
  const composeEnvironmentIds = useMemo(() => {
    const compose = new Set(projects.filter(wantsConfigView).map((project) => project.id))
    return environments.filter((env) => compose.has(env.projectId)).map((env) => env.id)
  }, [projects, environments])
  const { views } = useEnvironmentConfigViews(orgId, composeEnvironmentIds)
  const { latest } = useLatestDeployments(orgId, composeEnvironmentIds)
  const containersByEnvironment = useMemo(
    () => (containersQuery.data ? groupByEnvironment(containersQuery.data.containers) : undefined),
    [containersQuery.data],
  )
  const cards = useMemo(
    () =>
      projects.map((project) =>
        homeProject({
          project,
          environments: environments.filter((env) => env.projectId === project.id),
          containersByEnvironment,
          views,
        }),
      ),
    [projects, environments, containersByEnvironment, views],
  )
  const inProgress = useMemo(
    () => deploysInProgress({ projects, environments, latest, now }),
    [projects, environments, latest, now],
  )
  const runningCount = containersByEnvironment
    ? cards.reduce((sum, card) => sum + card.environments.filter((env) => env.status === 'running').length, 0)
    : null
  return { environmentsQuery, containersQuery, environments, cards, inProgress, runningCount }
}

function ProjectGrid({
  orgId,
  cards,
  projects,
  workspaces,
  showWorkspaceLabels,
}: Readonly<{
  orgId: string
  cards: readonly HomeProject[]
  projects: ReturnType<typeof useScopedProjects>['projects']
  workspaces: ReturnType<typeof useScopedProjects>['allWorkspaces']
  showWorkspaceLabels: boolean
}>) {
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspaceName(workspace)])),
    [workspaces],
  )
  const s = styles(usePalette())
  const router = useRouter()
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  return (
    <View style={s.grid}>
      {cards.map((card) => (
        <View key={card.id} style={s.cell}>
          <ProjectHomeCard
            project={card}
            workspace={
              showWorkspaceLabels
                ? workspaceNameById.get(projectById.get(card.id)?.workspaceId ?? '')
                : undefined
            }
            onOpen={() => router.push(projectHref(orgId, card.id) as Href)}
            onOpenBase={() => router.push(projectBaseHref(orgId, card.id) as Href)}
            onOpenEnvironment={(environmentId) =>
              router.push(projectEnvironmentHref(orgId, card.id, environmentId) as Href)
            }
          />
        </View>
      ))}
    </View>
  )
}

function DeploysInProgress({ orgId, rows }: Readonly<{ orgId: string; rows: readonly InProgressRow[] }>) {
  const s = styles(usePalette())
  const router = useRouter()
  if (rows.length === 0) return null
  return (
    <View style={s.section}>
      <SectionHeading title="Deploys in progress" />
      <ListGroup>
        {rows.map((row) => (
          <ListRow
            key={row.environmentId}
            title={row.title}
            sub={row.sub}
            chips={<StatusChip status={row.status} size="sm" />}
            onPress={() =>
              router.push(environmentPageTabHref(orgId, row.projectId, row.environmentId, 'deployments') as Href)
            }
          />
        ))}
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
      ...(showWorkspaceLabels ? [data.workspacesQuery.refetch()] : []),
    ])
    await workspaceScope?.refreshWorkspaces()
  })
}

/** The project list body: loading, the first-run welcome, or the project grid. */
function ProjectsList({
  orgId,
  scopeId,
  data,
  loading,
  canCreate,
}: Readonly<{ orgId: string; scopeId: string; data: HomeData; loading: boolean; canCreate: boolean }>) {
  const router = useRouter()
  const showWelcome = !loading && data.cards.length === 0
  const serversQuery = useOrgServers(orgId, { enabled: showWelcome && canCreate })
  if (loading) return <LoadingState />
  if (showWelcome) {
    const newProjectHref = newProjectHrefForScope(orgId, scopeId) as Href
    const serverCount = serversQuery.data ? serversQuery.data.servers.length : null
    return (
      <ProjectsWelcomeCard
        serverCount={serverCount}
        onAddServer={canCreate ? () => router.push(orgAreaHref(orgId, 'servers') as Href) : undefined}
        onNewProject={canCreate ? () => router.push(newProjectHref) : undefined}
      />
    )
  }
  return (
    <ProjectGrid
      orgId={orgId}
      cards={data.cards}
      projects={data.projects}
      workspaces={data.allWorkspaces}
      showWorkspaceLabels={scopeId === ALL_WORKSPACES_SCOPE}
    />
  )
}

/**
 * The Projects home: every project as a layer card (its Base, who runs it,
 * each environment's status and relation to the Base), the projects you opened
 * last, and the deploys running now. Only data the app has read is shown.
 */
export function ProjectsHomeSection({
  orgId,
  workspaceId,
}: Readonly<{ orgId: string; workspaceId?: string }>) {
  const s = styles(usePalette())
  const router = useRouter()
  const workspaceScope = useOptionalWorkspaceScope()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const now = useNow(CLOCK_MS)

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
  const newProjectHref = newProjectHrefForScope(orgId, scopeId) as Href

  return (
    <View style={s.root}>
      <PageTitle
        title="Projects"
        sub={
          data.cards.length > 0
            ? summaryLine(data.cards.length, data.environments.length, data.runningCount)
            : undefined
        }
        actions={
          canCreate && !welcomeShown ? (
            <ActionButton label="New project" variant="primary" onPress={() => router.push(newProjectHref)} />
          ) : null
        }
      />
      <WorkspaceSwitcher orgId={orgId} />
      {error ? <Notice tone="bad" title="Could not load projects" body={error} /> : null}
      <RecentProjects orgId={orgId} projects={data.cards} environments={data.environments} />
      <DeploysInProgress orgId={orgId} rows={data.inProgress} />
      <View style={s.section}>
        <SectionHeading title="All projects" />
        <ProjectsList orgId={orgId} scopeId={scopeId} data={data} loading={loading} canCreate={canCreate} />
      </View>
    </View>
  )
}
