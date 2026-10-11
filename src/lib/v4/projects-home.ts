/**
 * The Projects home: one card per project with its Base line, who runs it,
 * and each environment's status and relation to the Base; plus the deploys
 * that are running now.
 *
 * Built from data the app has read. A project that is not a Compose project
 * (a managed database, a platform project, one not set up yet) gets a plain
 * card: no Base line and no environment details, because none apply.
 */

import type { DeploymentGroup } from '@/lib/deployment-history'
import type {
  ConfigViewSide,
  ContainerRecord,
  EnvironmentConfigViewResponse,
  EnvironmentRecord,
  ProjectRecord,
} from '@/lib/instance-api'
import {
  isManagedProject,
  isSystemProject,
  projectNeedsSetup,
} from '@/lib/project-navigation'
import { environmentDisplayName } from '@/lib/resource-labels'
import {
  baseLine,
  baseRunsAs,
  environmentRelation,
  inProgressSub,
  isDeployInProgress,
  runningStatusKey,
  visitHost,
  type Relation,
} from './project-home'
import type { RunsAs } from './linux-users'
import { worstStatus } from './status-vocab'
import { plural } from './text'

export type HomeKind = 'compose' | 'managed' | 'platform' | 'setup'

export function homeKind(project: ProjectRecord): HomeKind {
  if (isSystemProject(project)) return 'platform'
  if (isManagedProject(project)) return 'managed'
  if (projectNeedsSetup(project)) return 'setup'
  return 'compose'
}

/** Compose projects are the ones whose Base and changes are worth reading. */
export function wantsConfigView(project: ProjectRecord): boolean {
  return homeKind(project) === 'compose'
}

export type HomeEnvironment = Readonly<{
  id: string
  name: string
  /** A status key; `unknown` while containers load. */
  status: string
  relation: Relation | null
  host: string | null
}>

export type HomeProject = Readonly<{
  id: string
  name: string
  kind: HomeKind
  description: string | null
  /** "3 environments", "Managed database", "Not set up yet", "Platform". */
  sub: string
  /** "Base · 3 services · 2 Linux users", or null when it has not been read. */
  baseLine: string | null
  runs: readonly RunsAs[]
  environments: readonly HomeEnvironment[]
  /** The worst status across the environments, for one dot. */
  status: string
}>

const KIND_SUB: Readonly<Record<Exclude<HomeKind, 'compose'>, string>> = {
  managed: 'Managed database',
  setup: 'Not set up yet',
  platform: 'Platform',
}

function projectSub(kind: HomeKind, environmentCount: number): string {
  if (kind === 'compose') return plural(environmentCount, 'environment')
  const label = KIND_SUB[kind]
  return environmentCount > 0 && kind === 'managed'
    ? `${label} · ${plural(environmentCount, 'environment')}`
    : label
}

/** The first environment's Base: every environment of a project shares one. */
function firstBase(
  environments: readonly EnvironmentRecord[],
  views: Readonly<Record<string, EnvironmentConfigViewResponse | undefined>>,
): ConfigViewSide | null {
  for (const env of environments) {
    const base = views[env.id]?.base
    if (base) return base
  }
  return null
}

export function homeProject(
  input: Readonly<{
    project: ProjectRecord
    environments: readonly EnvironmentRecord[]
    /** `undefined` while the organization's containers load. */
    containersByEnvironment: Readonly<Record<string, readonly ContainerRecord[]>> | undefined
    views: Readonly<Record<string, EnvironmentConfigViewResponse | undefined>>
  }>,
): HomeProject {
  const { project, environments, views } = input
  const kind = homeKind(project)
  const name = project.name?.trim() || 'Unnamed project'
  const compose = kind === 'compose'
  const containersOf = (environmentId: string) =>
    input.containersByEnvironment ? (input.containersByEnvironment[environmentId] ?? []) : undefined
  const rows: HomeEnvironment[] = environments.map((env) => {
    const view = compose ? views[env.id] : undefined
    return {
      id: env.id,
      name: environmentDisplayName(env),
      status: runningStatusKey(containersOf(env.id)) ?? 'unknown',
      relation: environmentRelation(view),
      host: view ? visitHost(view.effective) : null,
    }
  })
  const base = compose ? firstBase(environments, views) : null
  return {
    id: project.id,
    name,
    kind,
    description: project.description?.trim() || null,
    sub: projectSub(kind, environments.length),
    baseLine: base ? baseLine(base) : null,
    runs: base ? baseRunsAs(base, name) : [],
    // A platform project has one environment per server, all named alike: its
    // card stays plain and only the dot carries their status.
    environments: kind === 'platform' ? [] : rows,
    status: worstStatus(rows.map((row) => row.status)),
  }
}

/** "4 projects · 9 environments · 7 running" (the running part waits for containers). */
export function summaryLine(
  projectCount: number,
  environmentCount: number,
  runningCount: number | null,
): string {
  const parts = [plural(projectCount, 'project'), plural(environmentCount, 'environment')]
  if (runningCount !== null) parts.push(`${runningCount} running`)
  return parts.join(' · ')
}

export type InProgressRow = Readonly<{
  environmentId: string
  projectId: string
  title: string
  sub: string
  status: 'deploying' | 'queued'
  startedAt: number
}>

/** Deploys still going: one row per environment whose newest deploy is not finished. */
export function deploysInProgress(
  input: Readonly<{
    projects: readonly Pick<ProjectRecord, 'id' | 'name'>[]
    environments: readonly EnvironmentRecord[]
    latest: Readonly<Record<string, DeploymentGroup | null | undefined>>
    now: number
  }>,
): InProgressRow[] {
  const names = new Map(input.projects.map((project) => [project.id, project.name?.trim() || 'Unnamed project']))
  const rows: InProgressRow[] = []
  for (const env of input.environments) {
    const group = input.latest[env.id]
    const projectName = names.get(env.projectId)
    if (!group || projectName === undefined || !isDeployInProgress(group)) continue
    rows.push({
      environmentId: env.id,
      projectId: env.projectId,
      title: `${projectName} · ${environmentDisplayName(env)}`,
      sub: inProgressSub(group, input.now),
      status: group.status === 'running' ? 'deploying' : 'queued',
      startedAt: group.startedAt ? Date.parse(group.startedAt) : input.now,
    })
  }
  return rows.sort((a, b) => b.startedAt - a.startedAt)
}
