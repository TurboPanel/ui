/**
 * What the environment Configuration tab shows, built from the control
 * plane's config-view answer (`fetchEnvironmentConfigView`).
 *
 * The merge itself stays on the server (one copy of the Compose merge rules).
 * This module only turns its answer into rows: every row says where its value
 * comes from (Base, "{env} change", "Set in {env}", or "Project" for a
 * variable), and secrets never carry a value.
 *
 * Pure: no React, no storage, no network.
 */

import type {
  ConfigViewChange,
  ConfigViewFieldRow,
  ConfigViewLinuxUser,
  ConfigViewService,
  ConfigViewSource,
  ConfigViewVariable,
  EnvironmentConfigViewResponse,
} from '@/lib/instance-api'
import { onlyChangesLabel, relationText, sourceLabel, valueText } from './change-labels'
import { accessText, RUNS_IN_CONTAINER, type RunsAs } from './linux-users'
import { isDataStoreContainer, serviceKindLabel } from './service-roles'
import type { ConfigSource, V4Service } from './types'

/** Shown instead of a value the server did not send (a secret). */
export const HIDDEN_VALUE = 'Hidden'
/** Shown for a variable that is a secret: the value is write-only. */
export const SECRET_VALUE = '••••••••'
const EMPTY_VALUE = 'Empty'

/** Rows shown in a section before "Show all N". */
export const SECTION_ROW_LIMIT = 5

export type SourceTagModel = Readonly<{ source: ConfigSource; label: string }>

export type ChangeRowModel = Readonly<{
  key: string
  area: ConfigViewChange['area']
  kind: ConfigViewChange['kind']
  label: string
  /** "App web", "Variable", "Linux users". */
  where: string
  tag: SourceTagModel
  baseText: string
  envText: string
  masked: boolean
  serviceName: string | null
  serviceId: string | null
}>

export type AppRowModel = Readonly<{
  name: string
  serviceId: string | null
  kind: V4Service['kind']
  /** "Node.js app", or "Container · nginx:1.27". */
  kindLine: string
  tag: SourceTagModel
  changeCount: number
  /** "Staging changes: start command", "Added in Staging", "Set in Staging" or "Same as the Base". */
  changeText: string
  runsAs: RunsAs
}>

export type DataRowModel = Readonly<{
  name: string
  serviceId: string | null
  image: string
  tag: SourceTagModel
}>

export type DomainRowModel = Readonly<{
  key: string
  host: string
  serviceName: string
  tag: SourceTagModel
  /** Where the domain opens. */
  url: string
}>

export type VariableRowModel = Readonly<{
  key: string
  name: string
  variableId: string
  /** The value to show: masked for a secret. */
  valueText: string
  isSecret: boolean
  /** "Build and run", "Run only" or "Build only". */
  usedFor: string
  tag: SourceTagModel
  /** "Base: 1 · Staging: 2" under a changed variable, else empty. */
  sourceNote: string
  isChange: boolean
}>

export type LinuxUserRowModel = Readonly<{
  serviceName: string
  serviceId: string | null
  runsAs: RunsAs
  tag: SourceTagModel
  /** "SFTP on" or "No sign-in". */
  access: string
  isChange: boolean
}>

export type ConfigViewModel = Readonly<{
  envName: string
  followsBase: boolean
  /** "Follows the Base · 2 changes" or "Stands alone". */
  relationText: string
  changes: readonly ChangeRowModel[]
  changeCount: number
  /** "Only changes from Base (2)". */
  onlyChangesLabel: string
  apps: readonly AppRowModel[]
  data: readonly DataRowModel[]
  domains: readonly DomainRowModel[]
  variables: readonly VariableRowModel[]
  linuxUsers: readonly LinuxUserRowModel[]
}>

function tagFor(source: ConfigSource, envName: string, isVariable = false): SourceTagModel {
  return { source, label: sourceLabel(source, envName, isVariable) }
}

/** `environment` rows are changes when the environment follows the Base, its own values otherwise. */
export function rowSource(source: ConfigViewSource, followsBase: boolean): ConfigSource {
  if (!followsBase) return 'own'
  return source === 'environment' ? 'env' : 'base'
}

function lowerFirst(text: string): string {
  const second = text.charAt(1)
  // "Linux user", "PHP version" and variable names keep their capitals.
  if (second !== '' && second === second.toUpperCase() && second !== second.toLowerCase()) {
    return text
  }
  if (text.startsWith('Linux')) return text
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function valueOf(row: ConfigViewFieldRow | undefined): string | null {
  if (row === undefined) return null
  return row.masked ? HIDDEN_VALUE : row.value
}

function findRow(service: ConfigViewService, field: string): ConfigViewFieldRow | undefined {
  return service.rows.find((row) => row.field === field)
}

function toV4Service(service: ConfigViewService): V4Service {
  const image = valueOf(findRow(service, 'image'))
  return {
    id: service.serviceId ?? service.name,
    name: service.name,
    kind: service.kind,
    image: image ?? undefined,
  }
}

function changeWhere(change: ConfigViewChange): string {
  if (change.area === 'variable') return 'Variable'
  if (change.area === 'linuxUser') return 'Linux users'
  if (change.area === 'domain') return `Domain on ${change.serviceName ?? 'an app'}`
  return `App ${change.serviceName ?? ''}`.trim()
}

function changeLabel(change: ConfigViewChange): string {
  if (change.area === 'service' && change.field === null) return change.serviceName ?? change.label
  return change.label
}

function changeValueText(
  change: ConfigViewChange,
  value: string | null,
  absent: string
): string {
  if (change.masked) return HIDDEN_VALUE
  if (value === null) return absent
  return value === '' ? EMPTY_VALUE : value
}

function buildChanges(view: EnvironmentConfigViewResponse, envName: string): ChangeRowModel[] {
  const tag = tagFor(view.followsBase ? 'env' : 'own', envName)
  return view.changes.map((change) => ({
    key: change.key,
    area: change.area,
    kind: change.kind,
    label: changeLabel(change),
    where: changeWhere(change),
    tag,
    baseText: changeValueText(change, change.baseValue, valueText(null)),
    envText: changeValueText(change, change.envValue, 'Removed'),
    masked: change.masked,
    serviceName: change.serviceName,
    serviceId: change.serviceId,
  }))
}

function appChangeText(
  service: ConfigViewService,
  envName: string,
  followsBase: boolean,
  mine: readonly ConfigViewChange[]
): string {
  if (!followsBase) return `Set in ${envName}`
  if (service.source === 'environment') return `Added in ${envName}`
  const shorts = mine.filter((change) => change.field !== null).map((change) => lowerFirst(change.label))
  if (shorts.length > 0) return `${envName} changes: ${shorts.join(', ')}`
  return 'Same as the Base'
}

function kindLine(service: ConfigViewService): string {
  const label = serviceKindLabel(service.kind)
  const image = valueOf(findRow(service, 'image'))
  if (service.kind === 'container' && image !== null && image !== HIDDEN_VALUE) {
    return `${label} · ${image}`
  }
  return label
}

function findUser(
  users: readonly ConfigViewLinuxUser[],
  name: string
): ConfigViewLinuxUser | undefined {
  return users.find((user) => user.name === name)
}

function runsAsFor(
  service: ConfigViewService,
  users: readonly ConfigViewLinuxUser[],
  followsBase: boolean,
  envName: string
): RunsAs {
  const containerOnly: RunsAs = {
    runsInContainer: true,
    user: '',
    label: RUNS_IN_CONTAINER,
    short: RUNS_IN_CONTAINER,
    source: 'image',
    sourceLabel: '',
    access: '',
    hasAccess: false,
  }
  if (service.kind === 'container') return containerOnly
  const row = findRow(service, 'linuxUser')
  const user = row?.value ?? ''
  const source = row === undefined ? 'base' : rowSource(row.source, followsBase)
  const found = findUser(users, user)
  const hasAccess = found !== undefined && found.access !== 'none'
  return {
    runsInContainer: false,
    user,
    label: user === '' ? 'No Linux user yet' : `Runs as ${user}`,
    short: user === '' ? 'no Linux user' : `as ${user}`,
    source,
    sourceLabel: sourceLabel(source, envName),
    access: hasAccess ? accessText(found.access) : 'No sign-in',
    hasAccess,
  }
}

function appTag(
  service: ConfigViewService,
  envName: string,
  followsBase: boolean,
  changeCount: number
): SourceTagModel {
  if (!followsBase) return tagFor('own', envName)
  if (service.source === 'environment' || changeCount > 0) return tagFor('env', envName)
  return tagFor('base', envName)
}

function isData(service: ConfigViewService): boolean {
  return isDataStoreContainer(toV4Service(service))
}

function buildApps(view: EnvironmentConfigViewResponse, envName: string): AppRowModel[] {
  const { followsBase } = view
  return view.effective.services
    .filter((service) => !isData(service))
    .map((service) => {
      const mine = view.changes.filter((change) => change.serviceName === service.name)
      return {
        name: service.name,
        serviceId: service.serviceId,
        kind: service.kind,
        kindLine: kindLine(service),
        tag: appTag(service, envName, followsBase, mine.length),
        changeCount: mine.length,
        changeText: appChangeText(service, envName, followsBase, mine),
        runsAs: runsAsFor(service, view.effective.linuxUsers, followsBase, envName),
      }
    })
}

function buildData(view: EnvironmentConfigViewResponse, envName: string): DataRowModel[] {
  return view.effective.services.filter(isData).map((service) => ({
    name: service.name,
    serviceId: service.serviceId,
    image: valueOf(findRow(service, 'image')) ?? '',
    tag: appTag(service, envName, view.followsBase, 0),
  }))
}

function buildDomains(view: EnvironmentConfigViewResponse, envName: string): DomainRowModel[] {
  const rows: DomainRowModel[] = []
  for (const service of view.effective.services) {
    for (const row of service.rows) {
      if (row.area !== 'domain' || row.value === null) continue
      const source = rowSource(row.source, view.followsBase)
      rows.push({
        key: row.key,
        host: row.value,
        serviceName: service.name,
        tag: tagFor(source, envName),
        url: `https://${row.value}`,
      })
    }
  }
  return rows
}

function usedFor(variable: ConfigViewVariable): string {
  if (variable.forBuild && variable.forRuntime) return 'Build and run'
  if (variable.forBuild) return 'Build only'
  if (variable.forRuntime) return 'Run only'
  return 'Not used'
}

function variableValueText(variable: ConfigViewVariable): string {
  if (variable.isSecret || variable.value === null) return SECRET_VALUE
  return variable.value === '' ? EMPTY_VALUE : variable.value
}

function variableSource(variable: ConfigViewVariable, followsBase: boolean): ConfigSource {
  if (variable.source === 'project') return 'base'
  return followsBase ? 'env' : 'own'
}

function variableNote(
  change: ConfigViewChange | undefined,
  envName: string,
  isChange: boolean
): string {
  if (!isChange || change === undefined || change.masked) return ''
  if (change.baseValue === null || change.envValue === null) return ''
  return `Base: ${change.baseValue} · ${envName}: ${change.envValue}`
}

function buildVariables(view: EnvironmentConfigViewResponse, envName: string): VariableRowModel[] {
  const changes = new Map(view.changes.map((change) => [change.key, change]))
  return view.effective.variables.map((variable) => {
    const source = variableSource(variable, view.followsBase)
    const isChange = source === 'env'
    return {
      key: variable.key,
      name: variable.name,
      variableId: variable.variableId,
      valueText: variableValueText(variable),
      isSecret: variable.isSecret,
      usedFor: usedFor(variable),
      tag: tagFor(source, envName, true),
      sourceNote: variableNote(changes.get(variable.key), envName, isChange),
      isChange,
    }
  })
}

function buildLinuxUsers(envName: string, apps: readonly AppRowModel[]): LinuxUserRowModel[] {
  return apps
    .filter((app) => !app.runsAs.runsInContainer)
    .map((app) => ({
      serviceName: app.name,
      serviceId: app.serviceId,
      runsAs: app.runsAs,
      tag: tagFor(app.runsAs.source === 'image' ? 'base' : app.runsAs.source, envName),
      access: app.runsAs.access,
      isChange: app.runsAs.source === 'env',
    }))
}

/** The whole Configuration tab, from one config-view answer. */
export function buildConfigViewModel(input: Readonly<{
  envName: string
  view: EnvironmentConfigViewResponse
}>): ConfigViewModel {
  const { envName, view } = input
  const changes = buildChanges(view, envName)
  const apps = buildApps(view, envName)
  return {
    envName,
    followsBase: view.followsBase,
    relationText: relationText(!view.followsBase, changes.length),
    changes,
    changeCount: changes.length,
    onlyChangesLabel: onlyChangesLabel(changes.length),
    apps,
    data: buildData(view, envName),
    domains: buildDomains(view, envName),
    variables: buildVariables(view, envName),
    linuxUsers: buildLinuxUsers(envName, apps),
  }
}

/** "Show all 12" under a section that has more than {@link SECTION_ROW_LIMIT} rows. */
export function showAllLabel(total: number): string {
  return `Show all ${total}`
}

/** Rows to draw: the first few, or all of them. */
export function visibleRows<T>(rows: readonly T[], showAll: boolean): readonly T[] {
  return showAll ? rows : rows.slice(0, SECTION_ROW_LIMIT)
}
