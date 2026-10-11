/**
 * What an environment really runs: the Base plus "Changes for {env}", or its
 * own values when it stands alone. Pure comparison over flat configuration
 * maps (see `types.ts`); the compose merge itself stays on the server.
 *
 * Every row says where its value comes from (ia-v4 rule 22): Base, Project
 * (variables), "{env} change", or "Set in {env}".
 */

import {
  describeConfigKey,
  isVariableKey,
  onlyChangesLabel,
  relationText,
  serviceConfigKey,
  sourceLabel,
  changeTag,
  valueText,
} from './change-labels'
import { isAppService } from './service-roles'
import { plural } from './text'
import type {
  ConfigChangeRow,
  ConfigSource,
  EnvConfigSource,
  FlatConfig,
  V4Service,
} from './types'

/** Variables with these words in the name are shown masked by default. */
const SECRET_NAME_RE = /KEY|SECRET|TOKEN|PASSWORD/

export function isSecretVariableName(name: string): boolean {
  return SECRET_NAME_RE.test(name)
}

/** The values an environment runs with. */
export function environmentValues(
  base: FlatConfig,
  source: EnvConfigSource,
): FlatConfig {
  if (source.standsAlone) return source.values
  const values: Record<string, string> = { ...base }
  for (const change of source.changes) {
    if (change.value === null) delete values[change.key]
    else values[change.key] = change.value
  }
  return values
}

/** Keys of the Base in display order, then keys only the environment has. */
function allKeys(base: FlatConfig, values: FlatConfig): string[] {
  const keys = Object.keys(base)
  for (const key of Object.keys(values)) {
    if (!(key in base)) keys.push(key)
  }
  return keys
}

export type EnvironmentChangesInput = Readonly<{
  envName: string
  services: readonly V4Service[]
  base: FlatConfig
  source: EnvConfigSource
}>

function changeRow(
  input: EnvironmentChangesInput,
  key: string,
  baseValue: string | undefined,
  envValue: string | undefined,
): ConfigChangeRow {
  const info = describeConfigKey(key, input.services)
  return {
    key,
    area: info.area,
    label: info.label,
    short: info.short,
    serviceId: info.serviceId,
    serviceName: info.serviceName,
    baseValue: valueText(baseValue),
    envValue: valueText(envValue),
    added: baseValue === undefined,
    removed: envValue === undefined,
    envName: input.envName,
    tag: changeTag(input.envName),
  }
}

/**
 * What this environment does differently from the Base, one row per key.
 * A stand-alone environment is compared value by value.
 */
export function environmentChanges(
  input: EnvironmentChangesInput,
): ConfigChangeRow[] {
  const { base, source } = input
  if (!source.standsAlone) {
    return source.changes.map((change) =>
      changeRow(input, change.key, base[change.key], change.value ?? undefined),
    )
  }
  return allKeys(base, source.values)
    .filter((key) => base[key] !== source.values[key])
    .map((key) => changeRow(input, key, base[key], source.values[key]))
}

export type ConfigRow = Readonly<{
  key: string
  label: string
  value: string
  baseValue: string
  source: ConfigSource
  sourceLabel: string
  /** This value is an environment change (blue tag). */
  isChange: boolean
  differs: boolean
  /** "Base: 1 · Staging: 2" under a changed row, else empty. */
  sourceNote: string
}>

export type EffectiveVariable = ConfigRow &
  Readonly<{
    name: string
    secret: boolean
    serviceId: string | null
    /** "All services in Staging" or "Only web in Staging". */
    scope: string
  }>

export type EffectiveApp = Readonly<{
  id: string
  name: string
  kind: V4Service['kind']
  rows: readonly ConfigRow[]
  changeCount: number
  isChange: boolean
  source: ConfigSource
  sourceLabel: string
  /** "Staging changes: start command, Linux user", "Set in Staging" or "Same as the Base". */
  changeText: string
}>

export type EffectiveConfig = Readonly<{
  envName: string
  followsBase: boolean
  standsAlone: boolean
  changes: readonly ConfigChangeRow[]
  changeCount: number
  changeText: string
  hasChanges: boolean
  /** "Follows the Base · 2 changes" or "Stands alone". */
  relationText: string
  /** "Only changes from Base (2)". */
  onlyChangesLabel: string
  apps: readonly EffectiveApp[]
  variables: readonly EffectiveVariable[]
}>

export type EffectiveConfigInput = EnvironmentChangesInput &
  Readonly<{
    /** Per-variable details the screens know (which app it is for). */
    variableScopes?: Readonly<Record<string, string>>
  }>

function rowSource(
  standsAlone: boolean,
  changed: ReadonlySet<string>,
  key: string,
): ConfigSource {
  if (standsAlone) return 'own'
  return changed.has(key) ? 'env' : 'base'
}

function buildRow(
  input: EnvironmentChangesInput,
  values: FlatConfig,
  changed: ReadonlySet<string>,
  key: string,
  label: string,
): ConfigRow {
  const source = rowSource(input.source.standsAlone, changed, key)
  const value = valueText(values[key])
  const baseValue = valueText(input.base[key])
  return {
    key,
    label,
    value,
    baseValue,
    source,
    sourceLabel: sourceLabel(source, input.envName, isVariableKey(key)),
    isChange: source === 'env',
    differs: value !== baseValue,
    sourceNote:
      source === 'env'
        ? `Base: ${baseValue} · ${input.envName}: ${value}`
        : '',
  }
}

function appChangeText(
  envName: string,
  standsAlone: boolean,
  mine: readonly ConfigChangeRow[],
): string {
  if (mine.length > 0) {
    return `${envName} changes: ${mine.map((change) => change.short).join(', ')}`
  }
  return standsAlone ? `Set in ${envName}` : 'Same as the Base'
}

function buildApp(
  input: EnvironmentChangesInput,
  values: FlatConfig,
  changed: ReadonlySet<string>,
  changes: readonly ConfigChangeRow[],
  service: V4Service,
): EffectiveApp {
  const prefix = serviceConfigKey(service.id, '')
  const { standsAlone } = input.source
  const rows = allKeys(input.base, values)
    .filter((key) => key.startsWith(prefix) && key in values)
    .map((key) =>
      buildRow(input, values, changed, key, describeConfigKey(key, input.services).label),
    )
  const mine = changes.filter((change) => change.serviceId === service.id)
  const isChange = mine.length > 0 && !standsAlone
  let source: ConfigSource = 'base'
  if (standsAlone) source = 'own'
  else if (mine.length > 0) source = 'env'
  return {
    id: service.id,
    name: service.name,
    kind: service.kind,
    rows,
    changeCount: mine.length,
    isChange,
    source,
    sourceLabel: sourceLabel(source, input.envName),
    changeText: appChangeText(input.envName, standsAlone, mine),
  }
}

function buildVariable(
  input: EffectiveConfigInput,
  values: FlatConfig,
  changed: ReadonlySet<string>,
  key: string,
): EffectiveVariable {
  const name = key.slice('var:'.length)
  const row = buildRow(input, values, changed, key, name)
  const serviceId = input.variableScopes?.[name] ?? null
  const serviceName = input.services.find((item) => item.id === serviceId)?.name
  return {
    ...row,
    name,
    secret: isSecretVariableName(name),
    serviceId,
    scope:
      serviceName === undefined
        ? `All services in ${input.envName}`
        : `Only ${serviceName} in ${input.envName}`,
  }
}

/**
 * The merged view every Configuration screen shows. Rows are built from the
 * keys that exist, so an app shows exactly the settings it has.
 */
export function effectiveConfig(input: EffectiveConfigInput): EffectiveConfig {
  const values = environmentValues(input.base, input.source)
  const changes = environmentChanges(input)
  const changed = new Set(changes.map((change) => change.key))
  const { standsAlone } = input.source
  const apps = input.services
    .filter(isAppService)
    .map((service) => buildApp(input, values, changed, changes, service))
  const variables = allKeys(input.base, values)
    .filter((key) => isVariableKey(key) && key in values)
    .map((key) => buildVariable(input, values, changed, key))
  return {
    envName: input.envName,
    followsBase: !standsAlone,
    standsAlone,
    changes,
    changeCount: changes.length,
    changeText: plural(changes.length, 'change'),
    hasChanges: changes.length > 0,
    relationText: relationText(standsAlone, changes.length),
    onlyChangesLabel: onlyChangesLabel(changes.length),
    apps,
    variables,
  }
}

/** Short names of the settings an app changes, for map tags. */
export function changedShorts(
  changes: readonly ConfigChangeRow[],
  serviceId: string,
): string[] {
  return changes
    .filter((change) => change.serviceId === serviceId)
    .map((change) => change.short)
}
