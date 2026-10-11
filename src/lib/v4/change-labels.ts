/**
 * Plain-words labels for configuration keys and for what an environment
 * changes compared with the Base. Wording follows ia-v4 section 3.1: "Base",
 * "{env} change", "Follows the Base", "Stands alone".
 */

import { NOT_SET, plural } from './text'
import type { ConfigArea, ConfigSource, V4Service } from './types'

const LINUX_USER_ROW = 'runsAs'

/** Row labels shared by every kind of app. */
const COMMON_ROW_LABELS: Readonly<Record<string, string>> = {
  start: 'Start command',
  build: 'Build command',
  restarts: 'Restart if it crashes',
  health: 'Check the site loads before switching over',
  hc: 'Check the site loads before switching over',
  hcpath: 'Path to check',
  root: 'App folder in the repository',
  subdir: 'App folder in the repository',
  fresh: 'Always rebuild from scratch',
  grace: 'Time to stop',
  cpu: 'CPU limit',
  mem: 'Memory limit',
  port: 'Port',
  instances: 'Instances',
  image: 'Image or build',
  install: 'Package install command',
  node: 'Node version',
  enabled: 'Start after deploy',
  cooldown: 'Time between restarts',
  startfile: 'File that starts your app',
  webserver: 'Web server',
  php: 'PHP version',
  docroot: 'Document root',
  webenv: 'Web server variables',
  ext: 'PHP extensions',
  ini: 'php.ini settings',
  buildwith: 'Build with',
  prefix: 'Variable names start with',
  listen: 'Listen on',
}

/** Rows whose wording depends on the kind of app. */
const KIND_ROW_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  node: { mode: 'Mode' },
  site: { mode: 'PHP mode' },
}

/** Label for one setting row of one kind of app. */
export function serviceRowLabel(kind: V4Service['kind'], row: string): string {
  if (row === LINUX_USER_ROW) return 'Linux user'
  return KIND_ROW_LABELS[kind]?.[row] ?? COMMON_ROW_LABELS[row] ?? row
}

export function serviceConfigKey(serviceId: string, row: string): string {
  return `svc:${serviceId}:${row}`
}

export function variableConfigKey(name: string): string {
  return `var:${name}`
}

export function isVariableKey(key: string): boolean {
  return key.startsWith('var:')
}

/** The Linux user row of a service. */
export function linuxUserKey(serviceId: string): string {
  return serviceConfigKey(serviceId, LINUX_USER_ROW)
}

export type ConfigKeyInfo = Readonly<{
  area: ConfigArea
  label: string
  /** Lower-case form for use inside a sentence. */
  short: string
  serviceId: string | null
  serviceName: string
}>

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function serviceKeyInfo(
  parts: readonly string[],
  services: readonly V4Service[],
): ConfigKeyInfo {
  const [serviceId = '', row] = parts
  const service = services.find((item) => item.id === serviceId)
  const serviceName = service?.name ?? serviceId
  if (row === undefined) {
    return { area: 'services', label: serviceName, short: serviceName, serviceId, serviceName }
  }
  const label = serviceRowLabel(service?.kind ?? 'container', row)
  const short = label.startsWith('Linux') ? label : lowerFirst(label)
  const area = row === LINUX_USER_ROW ? 'users' : 'service'
  return { area, label, short, serviceId, serviceName }
}

/** What a configuration key is called on screen, and which area it belongs to. */
export function describeConfigKey(
  key: string,
  services: readonly V4Service[],
): ConfigKeyInfo {
  const [kind, ...rest] = key.split(':')
  if (kind === 'var') {
    const name = rest.join(':')
    return { area: 'variables', label: name, short: name, serviceId: null, serviceName: '' }
  }
  if (kind === 'svc') return serviceKeyInfo(rest, services)
  return { area: 'settings', label: key, short: key, serviceId: null, serviceName: '' }
}

/** Value shown for a possibly absent value. */
export function valueText(value: string | null | undefined): string {
  return value ?? NOT_SET
}

/** Tag on a changed row: "Staging change". */
export function changeTag(envName: string): string {
  return `${envName} change`
}

/** Text of the source tag on a row. Variables are shared at "Project" level. */
export function sourceLabel(
  source: ConfigSource,
  envName: string,
  isVariable = false,
): string {
  if (source === 'env') return changeTag(envName)
  if (source === 'own') return `Set in ${envName}`
  return isVariable ? 'Project' : 'Base'
}

/** "Stands alone" or "Follows the Base · 2 changes". */
export function relationText(standsAlone: boolean, changeCount: number): string {
  if (standsAlone) return 'Stands alone'
  return `Follows the Base · ${plural(changeCount, 'change')}`
}

/** Label of the filter switch on the Configuration page. */
export function onlyChangesLabel(changeCount: number): string {
  return `Only changes from Base (${changeCount})`
}

/** "Changed: start command, Linux user", from changes that touch one app. */
export function changedSummary(shorts: readonly string[]): string {
  return `Changed: ${shorts.join(', ')}`
}

/** "Base · 3 services · 2 Linux users" on the Base card. */
export function baseSummary(serviceCount: number, userCount: number): string {
  return `Base · ${plural(serviceCount, 'service')} · ${plural(userCount, 'Linux user')}`
}
