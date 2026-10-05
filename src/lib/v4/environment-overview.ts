/**
 * Data for the environment Overview tab, worked out from calls the app already
 * makes: the config view (what the environment runs and what it changes from
 * the Base), the service rows, containers, domains, certificates, storage,
 * database bindings and Linux users.
 *
 * Pure: records in, plain rows and a `MapInput` out. Anything the API does not
 * say (a volume's size, a database's state, a crash count) is left out of the
 * result rather than guessed.
 *
 * Services are identified by their compose name (`web`), because that is the
 * name the config view keys its rows and changes with. The matching service
 * record id (needed to open a service page) is kept in `recordIds`.
 */

import type {
  BindingRecord,
  ContainerRecord,
  HostingRecord,
  ProjectPrincipalRecord,
  ServiceRecord,
  StorageRecord,
  TlsRecord,
} from '@/lib/instance-api'
import type {
  ConfigViewChange,
  ConfigViewService,
  ConfigViewSide,
  EnvironmentConfigView,
} from '@/lib/v4/config-view-client'
import { accessText, RUNS_IN_CONTAINER, type RunsAs } from './linux-users'
import type { MapDomain, MapInput, MapLink, MapMode, MapStatus, MapVolume } from './map-layout'
import { isAppService, isDataStoreContainer, serviceKindLabel } from './service-roles'
import { statusInfo } from './status-vocab'
import { relationText, sourceLabel } from './change-labels'
import { NOT_SET } from './text'
import type { ConfigArea, ConfigChangeRow, ConfigSource, V4Service } from './types'

/** Everything the screen has fetched. `undefined` means "not loaded"; never a stand-in. */
export type OverviewSource = Readonly<{
  envName: string
  view: EnvironmentConfigView
  services: readonly ServiceRecord[]
  containers: readonly ContainerRecord[] | undefined
  hostings: Readonly<Record<string, readonly HostingRecord[]>>
  tls: readonly TlsRecord[] | undefined
  storage: readonly StorageRecord[]
  bindings: readonly BindingRecord[]
  principals: readonly ProjectPrincipalRecord[]
}>

const HIDDEN = 'Hidden'

// --- changes ---------------------------------------------------------------------

function changeArea(change: ConfigViewChange): ConfigArea {
  if (change.area === 'variable') return 'variables'
  if (change.area === 'linuxUser') return 'users'
  return change.field === null && change.serviceName !== null ? 'services' : 'service'
}

/** "Start command" reads "start command" inside a sentence; "Linux user" and "PHP version" stay. */
export function shortLabel(label: string): string {
  const first = label.split(' ')[0] ?? ''
  const keep = first === 'Linux' || (first.length > 1 && first === first.toUpperCase())
  return keep ? label : label.charAt(0).toLowerCase() + label.slice(1)
}

function sideValue(value: string | null, masked: boolean, absent: boolean): string {
  if (absent) return NOT_SET
  if (masked || value === null) return masked ? HIDDEN : NOT_SET
  return value
}

/** The server's changes as rows the v4 cards and map understand. */
export function changeRows(
  changes: readonly ConfigViewChange[],
  envName: string,
): ConfigChangeRow[] {
  return changes.map((change) => {
    const area = changeArea(change)
    const serviceName = change.serviceName ?? ''
    return {
      key: change.key,
      area,
      label: change.label,
      short: area === 'variables' ? change.label : shortLabel(change.label),
      serviceId: serviceName === '' ? null : serviceName,
      serviceName,
      baseValue: sideValue(change.baseValue, change.masked, change.kind === 'added'),
      envValue: sideValue(change.envValue, change.masked, change.kind === 'removed'),
      added: change.kind === 'added',
      removed: change.kind === 'removed',
      envName,
      tag: `${envName} change`,
    }
  })
}

// --- services ----------------------------------------------------------------------

function rowValue(service: ConfigViewService, field: string): string | undefined {
  const value = service.rows.find((row) => row.field === field)?.value
  return value === null || value === '' ? undefined : value
}

function hostedNames(source: OverviewSource, services: readonly ConfigViewService[]): Set<string> {
  const names = new Set<string>()
  for (const service of services) {
    const hasDomain = service.rows.some((row) => row.area === 'domain')
    const hasHosting =
      service.serviceId !== null && (source.hostings[service.serviceId]?.length ?? 0) > 0
    if (hasDomain || hasHosting) names.add(service.name)
  }
  return names
}

function v4Service(service: ConfigViewService, web: boolean): V4Service {
  const image = rowValue(service, 'image')
  return {
    id: service.name,
    name: service.name,
    kind: service.kind,
    ...(image === undefined ? {} : { image }),
    ...(web ? { web } : {}),
  }
}

function byName(services: readonly ConfigViewService[]): Map<string, ConfigViewService> {
  return new Map(services.map((service) => [service.name, service]))
}

/** Apps and data containers of one side of the config view. */
export function sideServices(source: OverviewSource, side: ConfigViewSide): V4Service[] {
  const web = hostedNames(source, side.services)
  return side.services.map((service) => v4Service(service, web.has(service.name)))
}

/** The environment's services, then the ones only the Base has (they show as removed). */
function diffServices(source: OverviewSource): V4Service[] {
  const own = sideServices(source, source.view.effective)
  const have = new Set(own.map((service) => service.id))
  const removed = sideServices(source, source.view.base).filter((service) => !have.has(service.id))
  return [...own, ...removed]
}

/** Service record id by compose name, for opening a service page. */
export function recordIds(source: OverviewSource): Map<string, string> {
  const ids = new Map<string, string>()
  for (const service of source.services) ids.set(service.composeServiceName, service.id)
  for (const service of source.view.effective.services) {
    if (service.serviceId !== null) ids.set(service.name, service.serviceId)
  }
  return ids
}

// --- status ------------------------------------------------------------------------

const BUSY_CONTAINER = new Set(['restarting', 'created', 'paused'])
const STOPPED_CONTAINER = new Set(['exited', 'dead', 'removing'])

/** Run state of one service from its containers; no crash words until the server sends them. */
export function runStatusKey(
  recordId: string | undefined,
  containers: readonly ContainerRecord[] | undefined,
): string | null {
  if (containers === undefined) return null
  const own = containers.filter(
    (container) => container.serviceId === recordId && container.role === 'service',
  )
  if (own.length === 0) return 'never'
  const states = own.map((container) => container.status)
  if (states.includes('running')) return 'running'
  if (states.some((state) => BUSY_CONTAINER.has(state))) return 'busy'
  if (states.some((state) => STOPPED_CONTAINER.has(state))) return 'stopped'
  return 'unknown'
}

function mapStatus(key: string | null): MapStatus | null {
  return key === null ? null : { key, label: statusInfo(key).label }
}

// --- domains, volumes, databases ---------------------------------------------------

/**
 * The certificate word for a domain. No pinned certificate means the edge's own
 * self-signed one (a test certificate); a pinned one is read from its row, and
 * is unknown while that row is not at hand.
 */
export function certificateKey(
  tlsId: string | null | undefined,
  tls: readonly TlsRecord[] | undefined,
): string {
  if (!tlsId) return 'test'
  const record = tls?.find((row) => row.id === tlsId)
  if (record === undefined) return 'unknown'
  if (record.source === 'self_signed') return 'test'
  const status = record.metadata.status
  if (status === 'ready' || status === 'managed') return 'ok'
  if (status === 'pending') return 'issuing'
  return 'renewal_failed'
}

export function domainsOf(source: OverviewSource): MapDomain[] {
  const seen = new Set<string>()
  const domains: MapDomain[] = []
  for (const service of source.view.effective.services) {
    const rows = service.serviceId === null ? [] : (source.hostings[service.serviceId] ?? [])
    for (const hosting of rows) {
      const host = hosting.name?.trim() ?? ''
      if (host === '' || seen.has(host)) continue
      seen.add(host)
      const key = certificateKey(hosting.tlsId, source.tls)
      domains.push({ host, status: { key, label: statusInfo(key).label }, serviceId: service.name })
    }
  }
  return domains
}

function volumeMount(storage: StorageRecord, names: ReadonlyMap<string, string>): string {
  const mount = storage.mounts[0]
  if (mount === undefined) return ''
  return `${names.get(mount.serviceId) ?? mount.serviceId}:${mount.destinationPath}`
}

/** Volumes of the environment. Size and last backup are not in the data, so they stay unknown. */
export function volumesOf(source: OverviewSource): MapVolume[] {
  const names = new Map(source.services.map((service) => [service.id, service.composeServiceName]))
  return source.storage.map((storage) => ({
    name: storage.name,
    mount: volumeMount(storage, names),
    size: null,
    lastBackup: undefined,
  }))
}

const ENGINE_NAMES: Readonly<Record<string, string>> = {
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mariadb: 'MariaDB',
  redis: 'Redis',
  valkey: 'Valkey',
}

export function engineName(engine: string | null): string | undefined {
  if (engine === null) return undefined
  return ENGINE_NAMES[engine.toLowerCase()] ?? engine
}

/** Databases the platform runs and backs up, one per database name. */
export function databasesOf(source: OverviewSource): V4Service[] {
  const seen = new Map<string, V4Service>()
  for (const binding of source.bindings) {
    if (binding.managedId === null) continue
    const id = `db:${binding.databaseName}`
    if (seen.has(id)) continue
    const engine = engineName(binding.engine)
    seen.set(id, {
      id,
      name: binding.databaseName,
      kind: 'database',
      ...(engine === undefined ? {} : { engine }),
    })
  }
  return [...seen.values()]
}

// --- links -------------------------------------------------------------------------

function dependencyNames(service: ConfigViewService): string[] {
  const names: string[] = []
  for (const row of service.rows) {
    if (row.field === 'depends_on' && row.value !== null) {
      names.push(...row.value.split(',').map((name) => name.trim()))
    } else if (row.field.startsWith('depends_on.')) {
      names.push(row.field.split('.')[1] ?? '')
    }
  }
  return names.filter((name) => name !== '')
}

/** App to data lines: `depends_on` towards a data container, and database bindings. */
export function linksOf(
  source: OverviewSource,
  side: ConfigViewSide,
  services: readonly V4Service[],
  includeDatabases: boolean,
): MapLink[] {
  const links: MapLink[] = []
  const known = new Map(services.map((service) => [service.id, service]))
  const lookup = byName(side.services)
  for (const service of services.filter(isAppService)) {
    const view = lookup.get(service.id)
    for (const name of view === undefined ? [] : dependencyNames(view)) {
      const target = known.get(name)
      if (target !== undefined && isDataStoreContainer(target)) {
        links.push({ from: service.id, to: name, kind: 'data' })
      }
    }
  }
  if (!includeDatabases) return links
  const names = new Map(source.services.map((service) => [service.id, service.composeServiceName]))
  for (const binding of source.bindings) {
    const from = names.get(binding.serviceId)
    if (binding.managedId === null || from === undefined) continue
    links.push({ from, to: `db:${binding.databaseName}`, kind: 'data' })
  }
  return links
}

// --- Runs as -----------------------------------------------------------------------

const CONTAINER_RUNS_AS: RunsAs = {
  runsInContainer: true,
  user: '',
  label: RUNS_IN_CONTAINER,
  short: RUNS_IN_CONTAINER,
  source: 'image',
  sourceLabel: '',
  access: '',
  hasAccess: false,
}

const UNSET_RUNS_AS: RunsAs = {
  runsInContainer: false,
  user: '',
  label: 'Linux user not set',
  short: '',
  source: 'base',
  sourceLabel: '',
  access: '',
  hasAccess: false,
}

function runsAsSource(
  view: EnvironmentConfigView,
  row: ConfigViewService['rows'][number] | undefined,
  inEnvironment: boolean,
): ConfigSource {
  if (!inEnvironment) return 'base'
  if (!view.followsBase) return 'own'
  return row?.source === 'environment' ? 'env' : 'base'
}

function principalFor(
  source: OverviewSource,
  service: ConfigViewService,
): ProjectPrincipalRecord | undefined {
  if (service.serviceId === null) return undefined
  const id = service.serviceId
  return source.principals.find((principal) => principal.serviceIds.includes(id))
}

/** Who runs an app, as the Base or the environment says; never a made-up default. */
export function runsAsOf(
  source: OverviewSource,
  service: V4Service,
  inEnvironment: boolean,
): RunsAs {
  if (service.kind !== 'node' && service.kind !== 'site') return CONTAINER_RUNS_AS
  const view = source.view
  const side = inEnvironment ? view.effective : view.base
  const found = byName(side.services).get(service.id) ?? byName(view.base.services).get(service.id)
  if (found === undefined) return UNSET_RUNS_AS
  const row = found.rows.find((candidate) => candidate.field === 'linuxUser')
  const user = row?.value ?? principalFor(source, found)?.username ?? ''
  if (user === '') return UNSET_RUNS_AS
  const declared = side.linuxUsers.find((candidate) => candidate.name === user)
  const hasAccess = declared !== undefined && declared.access !== 'none'
  const origin = runsAsSource(view, row, inEnvironment)
  return {
    runsInContainer: false,
    user,
    label: `Runs as ${user}`,
    short: `as ${user}`,
    source: origin,
    sourceLabel: sourceLabel(origin, source.envName),
    access: hasAccess ? accessText(declared.access) : 'No sign-in',
    hasAccess,
  }
}

// --- the map -----------------------------------------------------------------------

/** What `mapLayout` draws for this environment, the Base, or the two compared. */
export function mapInputOf(source: OverviewSource, mode: MapMode): MapInput {
  const inBase = mode === 'base'
  const side = inBase ? source.view.base : source.view.effective
  const services = [
    ...(mode === 'diff' ? diffServices(source) : sideServices(source, side)),
    ...(inBase ? [] : databasesOf(source)),
  ]
  const recordOf = recordIds(source)
  const present = new Set(source.view.effective.services.map((service) => service.name))
  return {
    mode,
    envName: source.envName,
    services,
    domains: inBase ? [] : domainsOf(source),
    volumes: inBase ? [] : volumesOf(source),
    links: linksOf(source, side, services, !inBase),
    changes: changeRows(source.view.changes, source.envName),
    runsAs: (service, inEnvironment) => runsAsOf(source, service, inEnvironment),
    status: (service) =>
      service.kind === 'database' || !present.has(service.id)
        ? null
        : mapStatus(runStatusKey(recordOf.get(service.id), source.containers)),
  }
}

// --- the services list under the map -------------------------------------------------

export type OverviewServiceRow = Readonly<{
  name: string
  /** "Node.js app", "Container · redis:7". */
  sub: string
  recordId: string | undefined
  runsAs: RunsAs
  statusKey: string | null
  source: ConfigSource
  sourceLabel: string
  host: string | null
}>

export type OverviewDataRow = Readonly<{
  id: string
  kind: 'store' | 'database' | 'volume'
  name: string
  sub: string
  statusKey: string | null
  recordId: string | undefined
}>

function serviceSub(service: V4Service): string {
  const kind = serviceKindLabel(service.kind)
  return service.image === undefined ? kind : `${kind} · ${service.image}`
}

function changedServiceNames(changes: readonly ConfigViewChange[]): Set<string> {
  const names = new Set<string>()
  for (const change of changes) {
    if (change.serviceName !== null) names.add(change.serviceName)
  }
  return names
}

function serviceSource(
  source: OverviewSource,
  service: ConfigViewService,
  touched: ReadonlySet<string>,
): ConfigSource {
  if (!source.view.followsBase) return 'own'
  return service.source === 'environment' || touched.has(service.name) ? 'env' : 'base'
}

/** First hostname a service answers, for the "visit" link beside its row. */
function hostOf(source: OverviewSource, service: ConfigViewService): string | null {
  const rows = service.serviceId === null ? [] : (source.hostings[service.serviceId] ?? [])
  return rows.map((row) => row.name?.trim() ?? '').find((name) => name !== '') ?? null
}

export function appRows(source: OverviewSource): OverviewServiceRow[] {
  const touched = changedServiceNames(source.view.changes)
  const recordOf = recordIds(source)
  const web = hostedNames(source, source.view.effective.services)
  return source.view.effective.services
    .map((service) => ({ service, v4: v4Service(service, web.has(service.name)) }))
    .filter(({ v4 }) => isAppService(v4))
    .map(({ service, v4 }) => {
      const origin = serviceSource(source, service, touched)
      return {
        name: service.name,
        sub: serviceSub(v4),
        recordId: recordOf.get(service.name),
        runsAs: runsAsOf(source, v4, true),
        statusKey: runStatusKey(recordOf.get(service.name), source.containers),
        source: origin,
        sourceLabel: sourceLabel(origin, source.envName),
        host: hostOf(source, service),
      }
    })
}

/** Data containers, databases and volumes, in the order the map lists them. */
export function dataRows(source: OverviewSource): OverviewDataRow[] {
  const recordOf = recordIds(source)
  const web = hostedNames(source, source.view.effective.services)
  const stores = source.view.effective.services
    .map((service) => v4Service(service, web.has(service.name)))
    .filter(isDataStoreContainer)
    .map<OverviewDataRow>((service) => ({
      id: service.id,
      kind: 'store',
      name: service.name,
      sub: service.image ?? serviceKindLabel(service.kind),
      statusKey: runStatusKey(recordOf.get(service.name), source.containers),
      recordId: recordOf.get(service.name),
    }))
  const databases = databasesOf(source).map<OverviewDataRow>((service) => ({
    id: service.id,
    kind: 'database',
    name: service.name,
    sub: service.engine ?? 'Database we run and back up for you',
    statusKey: null,
    recordId: undefined,
  }))
  const volumes = volumesOf(source).map<OverviewDataRow>((volume, index) => ({
    id: `vol${index}`,
    kind: 'volume',
    name: volume.name,
    sub: volume.mount === '' ? 'Storage' : volume.mount,
    statusKey: null,
    recordId: source.storage[index]?.id,
  }))
  return [...stores, ...databases, ...volumes]
}

// --- the changes card ---------------------------------------------------------------

export type EnvironmentRelation = Readonly<
  | { kind: 'changes'; title: string; text: string; count: number }
  | { kind: 'alone'; title: string; text: string }
  | { kind: 'none' }
>

/**
 * The card under the services: "Changes from Base (2)" when the environment
 * follows the Base and changes something, "Staging stands alone" when it does
 * not follow it. Nothing otherwise; there is no card with a made-up 0.
 */
export function relationCard(
  view: EnvironmentConfigView,
  envName: string,
  environmentCount: number,
): EnvironmentRelation {
  if (!view.followsBase) {
    if (environmentCount < 2) return { kind: 'none' }
    return {
      kind: 'alone',
      title: `${envName} stands alone`,
      text: 'Changes to the Base do not reach it.',
    }
  }
  const count = view.changes.length
  if (count === 0) return { kind: 'none' }
  return {
    kind: 'changes',
    title: `Changes from Base (${count})`,
    text: relationText(false, count),
    count,
  }
}
