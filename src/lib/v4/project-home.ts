/**
 * What the Projects home and a project's Environments tab show for each
 * environment, worked out from data the app really has: the containers (what
 * runs now), the newest deploy, and the control plane's config-view answer
 * (Base, what the environment changes, whether it follows the Base).
 *
 * Nothing here guesses. A part that has no data yet returns `null` (or
 * `undefined` for "still loading") and the screen leaves it out.
 */

import type { DeploymentGroup } from '@/lib/deployment-history'
import { formatAgo, siteUrlFromHostname } from '@/lib/environment-status'
import { hasHostDeployedContainers, isActiveContainerStatus } from '@/lib/container-status-guards'
import type {
  ConfigViewChange,
  ConfigViewService,
  ConfigViewSide,
  ContainerRecord,
  createEnvironment,
  EnvironmentConfigViewResponse,
} from '@/lib/instance-api'
import { serverDisplayName } from '@/lib/resource-labels'
import { baseSummary, linuxUserKey, relationText } from './change-labels'
import {
  defaultLinuxUser,
  linuxUserFromDeclared,
  resolveRunsAs,
  type RunsAs,
} from './linux-users'
import { isAppService } from './service-roles'
import { standAloneCompose } from './stand-alone-compose'
import type { StatusKey } from './status-vocab'
import { joinNames, plural } from './text'
import type { ConfigSource, V4Service } from './types'

// --- What runs now -------------------------------------------------------------

/** The containers that answer for the app itself (not the per-service ingress). */
function serviceContainers(containers: readonly ContainerRecord[]): readonly ContainerRecord[] {
  const own = containers.filter((row) => row.role === 'service')
  return own.length > 0 ? own : containers
}

function statusOfRows(rows: readonly ContainerRecord[]): StatusKey {
  const statuses = rows.map((row) => row.status)
  if (statuses.includes('running')) return 'running'
  if (rows.some((row) => isActiveContainerStatus(row.status))) return 'busy'
  const stopped = new Set(['exited', 'dead', 'removing'])
  if (statuses.some((status) => stopped.has(status))) return 'stopped'
  return 'unknown'
}

/**
 * What an environment is running now, in the words of the status vocabulary.
 * Same buckets as the environment header (`environmentStatusTone`), so a card
 * and the page it opens never disagree. `undefined` while containers load.
 */
export function runningStatusKey(
  containers: readonly ContainerRecord[] | undefined,
): StatusKey | undefined {
  if (containers === undefined) return undefined
  if (containers.length === 0 || !hasHostDeployedContainers(containers)) return 'never'
  return statusOfRows(serviceContainers(containers))
}

/** The state of one app on the mini map; `null` until it has been deployed. */
export function serviceStatusKey(containers: readonly ContainerRecord[]): StatusKey | null {
  if (containers.length === 0 || !hasHostDeployedContainers(containers)) return null
  return statusOfRows(serviceContainers(containers))
}

// --- The newest deploy ---------------------------------------------------------

const IN_PROGRESS = new Set(['queued', 'dispatching', 'sent', 'acked', 'running'])

/** True while any host of the deploy is still queued or running. */
export function isDeployInProgress(group: Pick<DeploymentGroup, 'status'> | null | undefined): boolean {
  return group != null && IN_PROGRESS.has(group.status)
}

type DeployWords = Readonly<{ status: StatusKey; label?: string }>

function deployWords(group: DeploymentGroup): DeployWords {
  if (group.strategyOutcome === 'rolled_back') return { status: 'rolledback' }
  if (group.strategyOutcome === 'needs_attention') {
    return { status: 'failed', label: 'Needs attention' }
  }
  switch (group.status) {
    case 'succeeded':
      return { status: 'deployed' }
    case 'failed':
      return { status: 'failed' }
    case 'timed_out':
      return { status: 'failed', label: 'Deploy timed out' }
    case 'cancelled':
      return { status: 'cancelled' }
    case 'running':
      return { status: 'deploying' }
    default:
      return { status: 'queued' }
  }
}

export type DeployPart = Readonly<{ status: string; label?: string; sub?: string }>

/**
 * The "Last deploy" part of the status triplet. `undefined` while the history
 * loads (leave the part out), a plain "No deploys yet" when there is none.
 */
export function lastDeployPart(
  group: DeploymentGroup | null | undefined,
  now: number,
): DeployPart | undefined {
  if (group === undefined) return undefined
  if (group === null) return { status: 'never', label: 'No deploys yet' }
  const words = deployWords(group)
  const sha = group.trigger?.commitSha?.slice(0, 7)
  const sub = [sha, formatAgo(group.startedAt, now)].filter(Boolean).join(' · ')
  return { status: words.status, ...(words.label ? { label: words.label } : {}), ...(sub ? { sub } : {}) }
}

/** "Started 4m ago" or "Started 4m ago · push to main", for a deploy that is still going. */
export function inProgressSub(group: DeploymentGroup, now: number): string {
  const ago = formatAgo(group.startedAt, now)
  const branch = group.trigger?.branch?.trim()
  const parts = [ago ? `Started ${ago}` : 'Starting now', branch ? `push to ${branch}` : null]
  return parts.filter(Boolean).join(' · ')
}

// --- Base and changes ----------------------------------------------------------

type ConfigViewRelationInput = Readonly<{
  followsBase: boolean
  changes: readonly unknown[]
}>

export type Relation = Readonly<{
  standsAlone: boolean
  changeCount: number
  /** "Follows the Base", "Follows the Base · 2 changes" or "Stands alone". */
  text: string
  /** Tag style: dashed for stands alone, blue when it changes something. */
  source: ConfigSource
}>

/**
 * How an environment relates to the Base, from the control plane's own answer.
 * `undefined` (not loaded, or the compose could not be read) shows nothing
 * rather than a guess.
 */
export function environmentRelation(view: ConfigViewRelationInput | undefined): Relation | null {
  if (view === undefined) return null
  if (!view.followsBase) {
    return { standsAlone: true, changeCount: 0, text: relationText(true, 0), source: 'own' }
  }
  const changeCount = view.changes.length
  return {
    standsAlone: false,
    changeCount,
    text: changeCount === 0 ? 'Follows the Base' : relationText(false, changeCount),
    source: changeCount === 0 ? 'base' : 'env',
  }
}

/** "3 services · 2 Linux users", the line under the Base band. */
export function baseCounts(base: ConfigViewSide): string {
  return `${plural(base.services.length, 'service')} · ${plural(base.linuxUsers.length, 'Linux user')}`
}

/** "Base · 3 services · 2 Linux users", the Base line on a project card. */
export function baseLine(base: ConfigViewSide): string {
  return baseSummary(base.services.length, base.linuxUsers.length)
}

/**
 * "Production and Staging follow it · Preview stands alone". Environments
 * whose answer is not known yet are left out.
 */
export function followLine(
  environments: readonly Readonly<{ name: string; followsBase: boolean | null }>[],
): string {
  const names = (follows: boolean) =>
    environments.filter((env) => env.followsBase === follows).map((env) => env.name)
  const follow = names(true)
  const alone = names(false)
  const parts: string[] = []
  if (follow.length > 0) parts.push(`${joinNames(follow)} ${follow.length === 1 ? 'follows' : 'follow'} it`)
  if (alone.length > 0) parts.push(`${joinNames(alone)} ${alone.length === 1 ? 'stands' : 'stand'} alone`)
  return parts.join(' · ')
}

// --- Services, Linux users and the mini map ------------------------------------

function rowValue(service: ConfigViewService, field: string): string | undefined {
  return service.rows.find((row) => row.field === field)?.value ?? undefined
}

/** A config-view service as the v4 helpers see it (the service name is its id). */
export function v4ServiceOf(service: ConfigViewService): V4Service {
  const image = rowValue(service, 'image')
  return {
    id: service.name,
    name: service.name,
    kind: service.kind,
    ...(image === undefined ? {} : { image }),
  }
}

/**
 * Who runs the Base's apps, one chip per distinct answer ("Runs as website",
 * "Runs inside its container"). A Node.js app or site with no user of its own
 * runs as the first Linux user, else the project's name.
 */
export function baseRunsAs(base: ConfigViewSide, projectName: string): RunsAs[] {
  const users = base.linuxUsers.map((user) => linuxUserFromDeclared(user.name, user.access))
  const defaultUser = defaultLinuxUser(users, projectName)
  const seen = new Set<string>()
  const chips: RunsAs[] = []
  for (const service of base.services) {
    const v4 = v4ServiceOf(service)
    if (!isAppService(v4)) continue
    const declared = rowValue(service, 'linuxUser')
    const runsAs = resolveRunsAs({
      service: v4,
      base: declared === undefined ? {} : { [linuxUserKey(v4.id)]: declared },
      users,
      defaultUser,
    })
    if (seen.has(runsAs.label)) continue
    seen.add(runsAs.label)
    chips.push(runsAs)
  }
  return chips
}

/** The host part of a domain row ("example.com/blog" -> "example.com"). */
function hostOf(value: string): string {
  const slash = value.indexOf('/')
  return slash < 0 ? value : value.slice(0, slash)
}

/** Every domain the environment answers, once each, in service order. */
export function environmentDomains(side: ConfigViewSide): string[] {
  const hosts: string[] = []
  for (const service of side.services) {
    for (const row of service.rows) {
      if (row.area === 'domain' && row.value) hosts.push(hostOf(row.value))
    }
  }
  return [...new Set(hosts.filter((host) => host !== ''))]
}

/** The first domain that can be opened in a browser (a wildcard cannot). */
export function visitHost(side: ConfigViewSide): string | null {
  return environmentDomains(side).find((host) => siteUrlFromHostname(host) !== null) ?? null
}

/** The branch the first Git-built app builds, when one is set. */
export function builtBranch(side: ConfigViewSide): string | null {
  for (const service of side.services) {
    const branch = rowValue(service, 'panel.source.branch')
    if (branch !== undefined && branch !== '') return branch
  }
  return null
}

export type MiniMapItem = Readonly<{
  name: string
  /** A status key, or null when the app has not been deployed. */
  status: string | null
  /** This environment changes it compared with the Base. */
  changed: boolean
}>

export type MiniMapColumn = Readonly<{
  key: 'visitors' | 'apps' | 'data'
  label: string
  emptyText: string
  items: readonly MiniMapItem[]
}>

/**
 * The three small lists on a card: who visits (domains), the apps, and the
 * data stores they use. Volumes and links are not read here; the full map
 * on the environment page draws those.
 */
export function miniMapColumns(
  side: ConfigViewSide,
  changes: readonly Pick<ConfigViewChange, 'serviceName'>[],
  statusOf: (serviceName: string) => string | null,
): MiniMapColumn[] {
  const changed = new Set(changes.map((change) => change.serviceName).filter((name) => name !== null))
  const services = side.services.map((service) => ({ service, v4: v4ServiceOf(service) }))
  const item = (name: string): MiniMapItem => ({
    name,
    status: statusOf(name),
    changed: changed.has(name),
  })
  return [
    {
      key: 'visitors',
      label: 'Visitors',
      emptyText: 'No domains yet',
      items: environmentDomains(side).map((host) => ({ name: host, status: null, changed: false })),
    },
    {
      key: 'apps',
      label: 'Apps',
      emptyText: 'No apps yet',
      items: services.filter((entry) => isAppService(entry.v4)).map((entry) => item(entry.service.name)),
    },
    {
      key: 'data',
      label: 'Data',
      emptyText: 'None',
      items: services
        .filter((entry) => !isAppService(entry.v4))
        .map((entry) => item(entry.service.name)),
    },
  ]
}

/** What a stand-alone environment starts from: no services and nothing from the Base. */
export const EMPTY_SIDE: ConfigViewSide = Object.freeze({
  services: [],
  variables: [],
  linuxUsers: [],
})

// --- One environment card -------------------------------------------------------

export type EnvironmentCardData = Readonly<{
  name: string
  /** `null` until the control plane has answered (or when it could not). */
  relation: Relation | null
  running: DeployPart
  /** `undefined` while the history loads: the part is left out. */
  lastDeploy: DeployPart | undefined
  /** `null` when the configuration could not be read: no map is drawn. */
  columns: readonly MiniMapColumn[] | null
  branch: string | null
  serverLine: string
  visitHost: string | null
}>

type ServerNames = Readonly<{ id: string; name: string | null; hostname: string | null }>

/**
 * Where an environment runs, in words: its own server, else the project's
 * server, else "No server yet". `servers` is `undefined` while they load.
 */
export function serverLine(
  serverId: string | null,
  defaultServerId: string | null,
  servers: readonly ServerNames[] | undefined,
): string {
  const named = (id: string) => {
    const found = servers?.find((server) => server.id === id)
    return found ? serverDisplayName(found) : null
  }
  if (serverId) return named(serverId) ?? 'A server of this organization'
  if (defaultServerId) {
    const name = named(defaultServerId)
    return name ? `${name} (the project's server)` : "The project's server"
  }
  return 'No server yet'
}

/** Everything one card shows, from the data the screen has read so far. */
export function environmentCardData(
  input: Readonly<{
    name: string
    containers: readonly ContainerRecord[] | undefined
    view: EnvironmentConfigViewResponse | undefined
    latest: DeploymentGroup | null | undefined
    serverLine: string
    now: number
  }>,
): EnvironmentCardData {
  const { view, containers } = input
  const runningKey = runningStatusKey(containers)
  const statusOf = (serviceName: string) =>
    serviceStatusKey((containers ?? []).filter((row) => row.composeServiceName === serviceName))
  return {
    name: input.name,
    relation: environmentRelation(view),
    running: runningKey === undefined ? { status: 'unknown', label: 'Checking…' } : { status: runningKey },
    lastDeploy: lastDeployPart(input.latest, input.now),
    columns: view ? miniMapColumns(view.effective, view.changes, statusOf) : null,
    branch: view ? builtBranch(view.effective) : null,
    serverLine: input.serverLine,
    visitHost: view ? visitHost(view.effective) : null,
  }
}

// --- New environment -----------------------------------------------------------

export type NewEnvironmentStart = 'base' | 'empty'

export type CreateEnvironmentBody = Parameters<typeof createEnvironment>[0]

/**
 * What "Create environment" sends.
 *
 * - from the Base: no compose of its own, so it runs what the Base runs
 * - empty, stands alone: `services: !override {}`
 * - a server is sent only when one was chosen; otherwise the environment uses
 *   the project's server
 */
export function newEnvironmentBody(
  input: Readonly<{
    projectId: string
    name: string
    start: NewEnvironmentStart
    serverId: string | null
  }>,
): CreateEnvironmentBody {
  return {
    projectId: input.projectId,
    name: input.name.trim(),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(input.start === 'empty' ? { options: { compose: standAloneCompose() } } : {}),
  }
}

/**
 * What the sheet previews: the Base's own services when starting from the
 * Base (`null` until the Base has been read), nothing when standing alone.
 */
export function startPreview(
  start: NewEnvironmentStart,
  base: ConfigViewSide | null,
): MiniMapColumn[] | null {
  if (start === 'empty') return miniMapColumns(EMPTY_SIDE, [], () => null)
  return base ? miniMapColumns(base, [], () => null) : null
}

/** Words under each start choice. */
export const START_CHOICES: readonly Readonly<{
  key: NewEnvironmentStart
  title: string
  body: string
}>[] = [
  {
    key: 'base',
    title: 'Start from the Base (recommended)',
    body: 'Runs what the Base runs. Add changes later.',
  },
  {
    key: 'empty',
    title: 'Empty, stands alone',
    body: 'Ignores the Base. You write its compose yourself.',
  },
]
