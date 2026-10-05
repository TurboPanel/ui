/**
 * Data for the project's Base tab, worked out from calls the app already makes:
 * each environment's config view (it carries the Base, what the environment
 * runs and what it changes) and the project's Linux users.
 *
 * Pure: records in, plain rows and a `MapInput` out. A part the data does not
 * say (a status, a deploy state) is left out, never guessed.
 *
 * The Base is read from any one environment's config view, because they all
 * carry the same `base`. A project with no environment has no Base to show.
 */

import type {
  ConfigViewService,
  ConfigViewSide,
  EnvironmentConfigViewResponse,
  ProjectPrincipalRecord,
} from '@/lib/instance-api'
import { sourceLabel } from './change-labels'
import { usedFor, variableValueText } from './config-view-model'
import {
  mapInputOf,
  runsAsOf,
  sideServices,
  type OverviewSource,
} from './environment-overview'
import {
  linuxUserFromDeclared,
  linuxUserFromRecord,
  userSub,
  type LinuxUser,
  type RunsAs,
} from './linux-users'
import type { MapInput } from './map-layout'
import { environmentRelation, followLine } from './project-home'
import { isAppService, isDataStoreContainer, serviceKindLabel } from './service-roles'
import { plural } from './text'
import type { ConfigSource, V4Service } from './types'

/** One environment of the project and what the control plane said about it. */
export type BaseEnvironment = Readonly<{
  id: string
  name: string
  /** `undefined` while it loads, or when the configuration could not be read. */
  view: EnvironmentConfigViewResponse | undefined
}>

/** The first environment's configuration that could be read: it carries the Base. */
export function baseViewOf(
  environments: readonly BaseEnvironment[],
): EnvironmentConfigViewResponse | null {
  return environments.find((environment) => environment.view !== undefined)?.view ?? null
}

// --- Environments built from this Base ---------------------------------------------

export type BaseEnvironmentRow = Readonly<{
  id: string
  name: string
  /** `null` until the control plane has answered (or when it could not). */
  followsBase: boolean | null
  /** "Follows the Base · 2 changes", "Stands alone", or empty when not known. */
  relationText: string
  source: ConfigSource
  changeCount: number
  /** "See Staging's changes": only for an environment that follows the Base and changes something. */
  seeChanges: string | null
}>

/** One row per environment: how it relates to the Base. */
export function baseEnvironmentRows(
  environments: readonly BaseEnvironment[],
): BaseEnvironmentRow[] {
  return environments.map((environment) => {
    const relation = environmentRelation(environment.view)
    if (relation === null) {
      return {
        id: environment.id,
        name: environment.name,
        followsBase: null,
        relationText: '',
        source: 'base',
        changeCount: 0,
        seeChanges: null,
      }
    }
    return {
      id: environment.id,
      name: environment.name,
      followsBase: !relation.standsAlone,
      relationText: relation.text,
      source: relation.source,
      changeCount: relation.changeCount,
      seeChanges:
        !relation.standsAlone && relation.changeCount > 0
          ? `See ${environment.name}'s changes`
          : null,
    }
  })
}

/** "Production and Staging follow it · Preview stands alone". */
export function reachLine(rows: readonly BaseEnvironmentRow[]): string {
  return followLine(rows.map((row) => ({ name: row.name, followsBase: row.followsBase })))
}

// --- The Base map ------------------------------------------------------------------

function sourceOf(
  view: EnvironmentConfigViewResponse,
  envName: string,
  principals: readonly ProjectPrincipalRecord[],
): OverviewSource {
  return {
    envName,
    view,
    services: [],
    containers: undefined,
    hostings: {},
    tls: undefined,
    storage: [],
    bindings: [],
    principals,
  }
}

export type BaseMapSelection = Readonly<{
  /** Any environment's view: it carries the Base. */
  view: EnvironmentConfigViewResponse
  /** `undefined` when the project's Linux users could not be read. */
  principals: readonly ProjectPrincipalRecord[] | undefined
  /** The environment to compare with, or `null` for the Base alone. */
  compare: Readonly<{ name: string; view: EnvironmentConfigViewResponse }> | null
}>

/**
 * What the Base map draws: the Base alone, or the Base compared with one
 * environment (what that environment adds, changes or removes). Only the
 * services and what the config view says are drawn: no domains, volumes or
 * run state, because the Base is not running anywhere.
 */
export function baseMapInput(selection: BaseMapSelection): MapInput {
  const { view, compare } = selection
  const principals = selection.principals ?? []
  if (compare === null) {
    return {
      ...mapInputOf(sourceOf(view, 'Base', principals), 'base'),
      envName: null,
      changes: [],
      status: () => null,
    }
  }
  return {
    ...mapInputOf(sourceOf(compare.view, compare.name, principals), 'diff'),
    status: () => null,
  }
}

// --- Services in the Base ----------------------------------------------------------

export type BaseServiceRow = Readonly<{
  name: string
  kindLabel: string
  /** The image of a container, else the kind. */
  sub: string
  /** The service is an app (it runs as a Linux user, or inside its container). */
  isApp: boolean
  runsAs: RunsAs | null
}>

function serviceSub(service: V4Service): string {
  if (service.kind === 'container' && service.image !== undefined) {
    const label = isDataStoreContainer(service) ? 'Data store' : serviceKindLabel(service.kind)
    return `${label} · ${service.image}`
  }
  return serviceKindLabel(service.kind)
}

/** Every service the Base declares, with who runs it. */
export function baseServiceRows(
  view: EnvironmentConfigViewResponse,
  principals: readonly ProjectPrincipalRecord[],
): BaseServiceRow[] {
  const source = sourceOf(view, 'Base', principals)
  return sideServices(source, view.base).map((service) => {
    const isApp = isAppService(service)
    return {
      name: service.name,
      kindLabel: serviceKindLabel(service.kind),
      sub: serviceSub(service),
      isApp,
      runsAs: isApp ? runsAsOf(source, service, false) : null,
    }
  })
}

/** "3 services" for the section note. */
export function baseServicesNote(rows: readonly BaseServiceRow[]): string {
  return plural(rows.length, 'service')
}

// --- Project variables -------------------------------------------------------------

export type BaseVariableRow = Readonly<{
  name: string
  variableId: string
  valueText: string
  isSecret: boolean
  /** "Build and run", "Run only" or "Build only". */
  usedFor: string
  tag: string
}>

/** The variables set on the project, shared by every environment. */
export function baseVariableRows(base: ConfigViewSide): BaseVariableRow[] {
  return base.variables.map((variable) => ({
    name: variable.name,
    variableId: variable.variableId,
    valueText: variableValueText(variable),
    isSecret: variable.isSecret,
    usedFor: usedFor(variable),
    tag: sourceLabel('base', 'Base', true),
  }))
}

// --- Linux users -------------------------------------------------------------------

export type BaseLinuxUserRow = Readonly<{
  name: string
  /** The login on the server, when it differs from the name people type. */
  systemName: string
  /** The user exists on the control plane, so its access and keys can be changed. */
  recordId: string | null
  access: LinuxUser['access']
  /** "SFTP on · 1 SSH key · password set". */
  sub: string
  /** "web in Production, Staging", one entry per app. */
  uses: readonly string[]
  usesText: string
  /** "web in Testing runs as testing-web", for environments that differ. */
  otherText: string
  hasOther: boolean
  inUse: boolean
}>

type UserWithRecord = Readonly<{ user: LinuxUser; recordId: string | null }>

/**
 * The project's Linux users: the ones the control plane holds, then the ones
 * only the Base declares. `principals` is `undefined` when they could not be
 * read: a declared user is then listed without saying it is not created yet.
 */
export function baseLinuxUsers(
  base: ConfigViewSide,
  principals: readonly ProjectPrincipalRecord[] | undefined,
): UserWithRecord[] {
  const records = principals ?? []
  const fromRecords = records.map((record) => ({
    user: linuxUserFromRecord(record),
    recordId: record.id,
  }))
  const known = new Set(records.map((record) => record.username))
  const declared = base.linuxUsers
    .filter((user) => !known.has(user.name))
    .map((user) => {
      const created = linuxUserFromDeclared(user.name, user.access)
      return {
        user: principals === undefined ? { ...created, createdOnFirstDeploy: false } : created,
        recordId: null,
      }
    })
  return [...fromRecords, ...declared]
}

/**
 * The user an app runs as: the Linux user row of its settings, else the user
 * whose record lists this service (the same fallback the Services list uses,
 * so the two sections agree).
 */
function linuxUserOf(
  service: ConfigViewService,
  records: readonly ProjectPrincipalRecord[],
): string | null {
  const row = service.rows.find((item) => item.field === 'linuxUser')?.value
  if (row !== undefined && row !== null && row !== '') return row
  const id = service.serviceId
  if (id === null) return null
  return records.find((record) => record.serviceIds.includes(id))?.username ?? null
}

type EnvUse = { service: string; environments: string[] }

function usesOf(
  environments: readonly BaseEnvironment[],
  records: readonly ProjectPrincipalRecord[],
  userName: string,
): string[] {
  const byService = new Map<string, EnvUse>()
  for (const environment of environments) {
    for (const service of environment.view?.effective.services ?? []) {
      if (linuxUserOf(service, records) !== userName) continue
      const entry = byService.get(service.name) ?? { service: service.name, environments: [] }
      entry.environments.push(environment.name)
      byService.set(service.name, entry)
    }
  }
  return [...byService.values()].map((entry) => `${entry.service} in ${entry.environments.join(', ')}`)
}

function differencesOf(
  environments: readonly BaseEnvironment[],
  records: readonly ProjectPrincipalRecord[],
  base: ConfigViewSide,
  userName: string,
): string[] {
  const lines: string[] = []
  for (const service of base.services) {
    if (linuxUserOf(service, records) !== userName) continue
    for (const environment of environments) {
      const own = environment.view?.effective.services.find((item) => item.name === service.name)
      const runsAs = own === undefined ? null : linuxUserOf(own, records)
      if (runsAs !== null && runsAs !== userName) {
        lines.push(`${service.name} in ${environment.name} runs as ${runsAs}`)
      }
    }
  }
  return lines
}

/**
 * What to say about a user's apps. Nothing found is only "No app runs as this
 * user yet" when every environment could be read; otherwise it names the apps
 * the Base says run as the user, and says nothing more.
 */
function usesTextOf(
  uses: readonly string[],
  allRead: boolean,
  declared: readonly string[],
): string {
  if (uses.length > 0) return uses.join(' · ')
  if (allRead) return 'No app runs as this user yet'
  return declared.length > 0 ? `${declared.join(', ')} in the Base` : ''
}

/** Each Linux user with the apps (per environment) that run as it. */
export function baseLinuxUserRows(
  base: ConfigViewSide,
  principals: readonly ProjectPrincipalRecord[] | undefined,
  environments: readonly BaseEnvironment[],
): BaseLinuxUserRow[] {
  const records = principals ?? []
  const allRead = environments.every((environment) => environment.view !== undefined)
  return baseLinuxUsers(base, principals).map(({ user, recordId }) => {
    const uses = usesOf(environments, records, user.name)
    const other = differencesOf(environments, records, base, user.name)
    const declared = base.linuxUsers.find((item) => item.name === user.name)?.usedBy ?? []
    return {
      name: user.name,
      systemName: user.systemName,
      recordId,
      access: user.access,
      sub: userSub(user),
      uses,
      usesText: usesTextOf(uses, allRead, declared),
      otherText: other.join(' · '),
      hasOther: other.length > 0,
      inUse: uses.length > 0 || (!allRead && declared.length > 0),
    }
  })
}

/** "2 Linux users" for the section note. */
export function baseLinuxUsersNote(rows: readonly BaseLinuxUserRow[]): string {
  return plural(rows.length, 'Linux user')
}
