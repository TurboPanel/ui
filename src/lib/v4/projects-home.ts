/**
 * The Projects home: one tile per project with the status of its primary and
 * pinned environments; plus the deploys that are running now.
 *
 * Built from data the app has read. A platform project shows no environments
 * (it has one per server, all named alike) and a project not set up yet has
 * none to show.
 */

import type { DeploymentGroup } from '@/lib/deployment-history'
import type {
  ContainerRecord,
  EnvironmentConfigViewResponse,
  EnvironmentRecord,
  ProjectRecord,
} from '@/lib/instance-api'
import { isManagedProject, isSystemProject, projectNeedsSetup } from '@/lib/project-navigation'
import { environmentDisplayName } from '@/lib/resource-labels'
import { hasNativeApp, inProgressSub, isDeployInProgress, runningStatusKey } from './project-home'
import { orderEnvironments, primaryEnvironmentOf } from './primary-environment'
import { statusInfo, worstStatus, type StatusTone } from './status-vocab'
import { plural } from './text'

export type HomeKind = 'compose' | 'managed' | 'platform' | 'setup'

export function homeKind(project: ProjectRecord): HomeKind {
  if (isSystemProject(project)) return 'platform'
  if (isManagedProject(project)) return 'managed'
  if (projectNeedsSetup(project)) return 'setup'
  return 'compose'
}

/** Compose projects are the ones whose newest deploy is read to tell a native app's state. */
export function wantsConfigView(project: ProjectRecord): boolean {
  return homeKind(project) === 'compose'
}

export type HomeEnvironment = Readonly<{
  id: string
  name: string
  /** A status key; `unknown` while containers load. */
  status: string
  isPrimary: boolean
  pinned: boolean
}>

export type HomeProject = Readonly<{
  id: string
  name: string
  kind: HomeKind
  workspaceId: string | null
  /** Every environment, the primary first, then the pinned ones, then the rest. */
  environments: readonly HomeEnvironment[]
  /** The worst status across the environments, for one dot. */
  status: string
}>

/** Oldest first, so pinned environments keep the order they were created in. */
function byCreated(a: EnvironmentRecord, b: EnvironmentRecord): number {
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

type Latest = Readonly<Record<string, DeploymentGroup | null | undefined>>
type Views = Readonly<Record<string, EnvironmentConfigViewResponse | undefined>>

/**
 * With no containers, a deployed native app is told by its newest deploy. When
 * config views were read, only an environment that has a native app uses it;
 * without them, any environment with a deploy record does.
 */
function nativeFallback(envId: string, latest: Latest | undefined, views: Views | undefined) {
  if (!latest) return undefined
  if (views && !hasNativeApp(views[envId]?.effective.services)) return undefined
  return { latest: latest[envId] }
}

function homeEnvironments(
  environments: readonly EnvironmentRecord[],
  containersOf: (environmentId: string) => readonly ContainerRecord[] | undefined,
  latest: Latest | undefined,
  views: Views | undefined
): HomeEnvironment[] {
  const sorted = [...environments].sort(byCreated)
  const primary = primaryEnvironmentOf(sorted)
  return orderEnvironments(
    sorted.map((env) => ({ ...env, isPrimary: env.id === primary?.id }))
  ).map((env) => ({
    id: env.id,
    name: environmentDisplayName(env),
    status:
      runningStatusKey(containersOf(env.id), nativeFallback(env.id, latest, views)) ?? 'unknown',
    isPrimary: env.isPrimary === true,
    pinned: env.isPrimary !== true && env.pinned === true,
  }))
}

export function homeProject(
  input: Readonly<{
    project: ProjectRecord
    environments: readonly EnvironmentRecord[]
    /** `undefined` while the organization's containers load. */
    containersByEnvironment: Readonly<Record<string, readonly ContainerRecord[]>> | undefined
    /** Each environment's newest deploy: what a native app's status comes from. */
    latest?: Latest
    /** Config views, when the caller read them: they say which environments run a native app. */
    views?: Views
  }>
): HomeProject {
  const { project, environments, latest, views } = input
  const kind = homeKind(project)
  const containersOf = (environmentId: string) =>
    input.containersByEnvironment ? (input.containersByEnvironment[environmentId] ?? []) : undefined
  const rows = homeEnvironments(
    environments,
    containersOf,
    kind === 'compose' ? latest : undefined,
    kind === 'compose' ? views : undefined
  )
  return {
    id: project.id,
    name: project.name?.trim() || 'Unnamed project',
    kind,
    workspaceId: project.workspaceId ?? null,
    // A platform project has one environment per server, all named alike: its
    // tile stays plain and only the dot carries their status.
    environments: kind === 'platform' ? [] : rows,
    status: worstStatus(rows.map((row) => row.status)),
  }
}

/** Dot colours on a tile: a failed or unhealthy state uses the warning colour, never red. */
export type PillTone = 'ok' | 'busy' | 'warn' | 'idle'

const PILL_TONE: Readonly<Record<StatusTone, PillTone>> = {
  ok: 'ok',
  busy: 'busy',
  warn: 'warn',
  bad: 'warn',
  idle: 'idle',
}

export function pillTone(status: string): PillTone {
  return PILL_TONE[statusInfo(status).tone]
}

/** The environments a tile names (primary, then pinned) and how many fold into "+N". */
export function tilePills(project: Pick<HomeProject, 'environments'>): {
  shown: HomeEnvironment[]
  more: number
} {
  const shown = project.environments.filter((env) => env.isPrimary || env.pinned)
  return { shown, more: project.environments.length - shown.length }
}

/** Deploys in progress show this many rows; the rest are reached from Activity. */
export const IN_PROGRESS_LIMIT = 3

/** "4 projects · 9 environments · 7 running" (the running part waits for containers). */
export function summaryLine(
  projectCount: number,
  environmentCount: number,
  runningCount: number | null
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
  }>
): InProgressRow[] {
  const names = new Map(
    input.projects.map((project) => [project.id, project.name?.trim() || 'Unnamed project'])
  )
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
